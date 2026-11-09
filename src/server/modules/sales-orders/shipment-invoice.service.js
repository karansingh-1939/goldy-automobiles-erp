import { AppError } from '../../shared/errors/app-error.js';
import { calculateLinePricing } from './line-pricing.js';
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

export class ShipmentInvoiceService {
  constructor(repository, postingEngine) {
    this.repository = repository;
    this.postingEngine = postingEngine;
  }
  createInvoiceForShipment(shipmentId, userId) {
    const shipment = this.repository.findShipment(shipmentId);
    if (!shipment) {
      throw new AppError('Shipment not found.', 404, 'SHIPMENT_NOT_FOUND');
    }

    const order = this.repository.getSalesOrderById(shipment.sales_order_id);
    const shipmentItems = shipment.items;

    // Verify company & customer state for GST resolution
    const customer = this.repository.findCustomerState(order.customer_id);
    const company = this.repository.findCompanyState(order.company_id);
    const companyState = company ? company.state || 'Haryana' : 'Haryana';
    const customerState = customer ? customer.state || companyState : companyState;
    const isInterstate = customerState.trim().toLowerCase() !== companyState.trim().toLowerCase();

    const customerLedgerId = this.postingEngine.getOrCreateCustomerLedger(
      order.company_id,
      order.customer_id,
      customer.name,
    );

    return this.repository.transaction(() => {
      const existing = this.repository.findInvoiceForShipment(shipmentId);
      if (existing || shipment.status === 'CANCELLED') {
        throw new AppError(
          'Shipment is already invoiced or cancelled.',
          409,
          'SHIPMENT_ALREADY_INVOICED',
        );
      }

      const invoiceNumber = this.repository.nextDirectInvoiceNumber(new Date().getFullYear());
      const invoiceId = this.repository.createShipmentInvoice(
        order,
        shipment,
        invoiceNumber,
        userId,
      );

      let subtotal = 0;
      let gstTotal = 0;
      let totalPartsCost = 0;
      let totalPartsRevenue = 0;

      const processedItems = [];

      for (const shItem of shipmentItems) {
        const orderItem = order.items.find((oi) => oi.id === shItem.sales_order_item_id);
        const qty = shItem.quantity;
        const price = orderItem.unit_price;
        const discountVal = (orderItem.discount_amount / orderItem.quantity) * qty;
        const gstRate = orderItem.gst_rate;

        // Calculate pricing
        const pricing = calculateLinePricing(qty, price, discountVal, gstRate, order.tax_type);

        subtotal += pricing.subtotal;
        gstTotal += pricing.gst;
        totalPartsCost += roundMoney(qty * shItem.cost_price);
        totalPartsRevenue += pricing.subtotal;

        processedItems.push({
          itemId: shItem.item_id,
          description: orderItem.description || 'Spare Part',
          quantity: qty,
          unitPrice: price,
          gstRate,
          gstAmount: pricing.gst,
          lineTotal: pricing.total,
          costPrice: shItem.cost_price,
          warehouseId: shItem.warehouse_id,
          batchId: shItem.batch_id,
          sales_order_item_id: orderItem.id,
          sales_shipment_item_id: shItem.id,
        });
      }

      const grandTotal = Math.round(subtotal + gstTotal);

      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (isInterstate) {
        igst = roundMoney(gstTotal);
      } else {
        cgst = roundMoney(gstTotal / 2);
        sgst = roundMoney(gstTotal - cgst);
      }

      this.repository.updateShipmentInvoiceTotals(
        invoiceId,
        roundMoney(subtotal),
        roundMoney(gstTotal),
        grandTotal,
        cgst,
        sgst,
        igst,
      );
      this.repository.insertShipmentInvoiceItems(invoiceId, processedItems);

      // Compile accounting entries
      const salesEntries = [];
      salesEntries.push({ ledgerId: customerLedgerId, type: 'DEBIT', amount: grandTotal });

      if (totalPartsRevenue > 0) {
        salesEntries.push({
          ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'parts_sales'),
          type: 'CREDIT',
          amount: totalPartsRevenue,
        });
      }

      if (igst > 0) {
        salesEntries.push({
          ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'igst_output'),
          type: 'CREDIT',
          amount: igst,
        });
      }
      if (cgst > 0) {
        salesEntries.push({
          ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'cgst_output'),
          type: 'CREDIT',
          amount: cgst,
        });
      }
      if (sgst > 0) {
        salesEntries.push({
          ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'sgst_output'),
          type: 'CREDIT',
          amount: sgst,
        });
      }

      // Add roundoff entry if applicable to keep journal balanced
      const roundoff = roundMoney(grandTotal - (subtotal + gstTotal));
      if (Math.abs(roundoff) >= 0.01) {
        const roundOffLedgerId = this.postingEngine.ledgerResolver.getLedgerId(
          order.company_id,
          'round_off',
        );
        if (roundoff > 0) {
          salesEntries.push({ ledgerId: roundOffLedgerId, type: 'CREDIT', amount: roundoff });
        } else {
          salesEntries.push({
            ledgerId: roundOffLedgerId,
            type: 'DEBIT',
            amount: Math.abs(roundoff),
          });
        }
      }

      // Post Sales Voucher
      const salesVoucher = this.postingEngine.post({
        companyId: order.company_id,
        voucherType: 'Sales',
        voucherDate: shipment.shipment_date,
        referenceTable: 'direct_invoices',
        referenceId: invoiceId,
        narration: `Invoice for shipment ${shipment.shipment_number}`,
        created_by: userId,
        entries: salesEntries,
      });

      this.repository.linkShipmentInvoiceVoucher(invoiceId, salesVoucher.voucherId);

      // Post COGS Voucher
      if (totalPartsCost > 0) {
        const cogsEntries = [
          {
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'cogs'),
            type: 'DEBIT',
            amount: totalPartsCost,
          },
          {
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(
              order.company_id,
              'inventory_stock',
            ),
            type: 'CREDIT',
            amount: totalPartsCost,
          },
        ];

        const cogsVoucher = this.postingEngine.post({
          companyId: order.company_id,
          voucherType: 'Journal',
          voucherDate: shipment.shipment_date,
          referenceTable: 'direct_invoices',
          referenceId: invoiceId,
          narration: `COGS entry for shipment ${shipment.shipment_number}`,
          created_by: userId,
          entries: cogsEntries,
        });
        this.repository.linkShipmentInvoiceVoucher(invoiceId, cogsVoucher.voucherId, true);
      }

      return this.repository.findDirectInvoice(invoiceId);
    });
  }
}
