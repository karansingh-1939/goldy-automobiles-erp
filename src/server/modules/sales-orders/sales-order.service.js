import { assertCustomerCreditLimit } from '../accounting/customer-credit.service.js';
import { localDate } from '../../shared/utils/local-date.js';
import { AppError } from '../../shared/errors/app-error.js';
import { SalesOrderRepository } from './sales-order.repository.js';
import { QuotationService } from './quotation.service.js';
import { ShipmentInvoiceService } from './shipment-invoice.service.js';
import { calculateLinePricing } from './line-pricing.js';
import { createInventoryService } from '../inventory/inventory.service.js';
import { AccountingPostingEngine } from '../accounting/posting-engine.service.js';

function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

export class SalesOrderService {
  constructor(db) {
    this.db = db;
    this.repository = new SalesOrderRepository(db);
    this.quotations = new QuotationService(this.repository);
    this.inventoryService = createInventoryService(db);
    this.postingEngine = new AccountingPostingEngine(db);
    this.shipmentInvoices = new ShipmentInvoiceService(this.repository, this.postingEngine);
  }

  createQuotation(payload, userId) {
    return this.quotations.createQuotation(payload, userId);
  }
  reviseQuotation(id, payload, userId) {
    return this.quotations.reviseQuotation(id, payload, userId);
  }

  // --- SALES ORDERS ---

  createSalesOrder(payload, userId) {
    const {
      companyId = 1,
      customerId,
      quotationId = null,
      orderDate,
      items,
      customerReference,
      termsConditions,
      status = 'DRAFT',
      taxType = 'EXCLUSIVE',
    } = payload;

    if (!customerId || !orderDate || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Customer, date, and items are required.', 400, 'VALIDATION_ERROR');
    }

    const customer = this.repository.findCustomer(customerId);
    if (!customer) {
      throw new AppError('Customer not found.', 404, 'CUSTOMER_NOT_FOUND');
    }

    const orderNumber = this.repository.generateDocNumber('SO');

    return this.repository.transaction(() => {
      let subtotal = 0;
      let gstTotal = 0;
      let discountAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const itemDetails = this.repository.findPricedItem(item.itemId);
        if (!itemDetails) {
          throw new AppError(`Item ID ${item.itemId} not found.`, 404, 'INVENTORY_ITEM_NOT_FOUND');
        }

        const qty = Number(item.quantity);
        const unitPrice =
          item.unitPrice !== undefined ? Number(item.unitPrice) : Number(itemDetails.selling_price);
        const itemDiscount = Number(item.discountAmount || 0);
        const gstRate =
          item.gstRate !== undefined ? Number(item.gstRate) : Number(itemDetails.gst_rate);

        const pricing = calculateLinePricing(qty, unitPrice, itemDiscount, gstRate, taxType);

        subtotal += pricing.subtotal;
        gstTotal += pricing.gst;
        discountAmount += itemDiscount;

        processedItems.push({
          item_id: item.itemId,
          warehouse_id: item.warehouseId || null,
          description: item.description || null,
          quantity: qty,
          unit_price: unitPrice,
          discount_amount: itemDiscount,
          gst_rate: gstRate,
          gst_amount: pricing.gst,
          line_total: pricing.total,
        });
      }

      const grandTotal = Math.round(subtotal + gstTotal);

      const order = {
        order_number: orderNumber,
        company_id: companyId,
        customer_id: customerId,
        quotation_id: quotationId,
        order_date: orderDate,
        status,
        customer_reference: customerReference || null,
        subtotal: roundMoney(subtotal),
        discount_amount: roundMoney(discountAmount),
        gst_total: roundMoney(gstTotal),
        grand_total: grandTotal,
        terms_conditions: termsConditions || null,
        created_by: userId,
        tax_type: taxType,
      };

      const orderId = this.repository.createSalesOrder(order, processedItems);
      return this.repository.getSalesOrderById(orderId);
    });
  }

  convertQuotationToSalesOrder(quotationId, payload, userId) {
    const quotation = this.repository.getQuotationById(quotationId);
    if (!quotation) {
      throw new AppError('Quotation not found.', 404, 'QUOTATION_NOT_FOUND');
    }

    return this.repository.transaction(() => {
      const salesOrderPayload = {
        companyId: quotation.company_id,
        customerId: quotation.customer_id,
        quotationId: quotation.id,
        orderDate: payload.orderDate || localDate(),
        customerReference: payload.customerReference || null,
        termsConditions: quotation.terms_conditions,
        status: 'DRAFT',
        taxType: quotation.tax_type,
        items: quotation.items.map((item) => ({
          itemId: item.item_id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          discountAmount: item.discount_amount,
          gstRate: item.gst_rate,
          warehouseId: payload.warehouseId || null,
        })),
      };

      const order = this.createSalesOrder(salesOrderPayload, userId);
      this.repository.updateQuotationStatus(quotation.id, 'ACCEPTED');
      return order;
    });
  }

  assertCreditLimit(companyId, customerId, grandTotal) {
    assertCustomerCreditLimit(this.db, companyId, customerId, grandTotal);
  }

  confirmSalesOrder(orderId, userId) {
    const order = this.repository.getSalesOrderById(orderId);
    if (!order) {
      throw new AppError('Sales Order not found.', 404, 'SALES_ORDER_NOT_FOUND');
    }
    if (order.status !== 'DRAFT') {
      throw new AppError(
        `Cannot confirm a Sales Order with status ${order.status}.`,
        400,
        'VALIDATION_ERROR',
      );
    }

    return this.repository.transaction(() => {
      // Check Credit Limit before reserving stock
      this.assertCreditLimit(order.company_id, order.customer_id, order.grand_total);
      for (const item of order.items) {
        if (!item.warehouse_id) {
          throw new AppError(
            `Warehouse selection is required on line item for ${item.item_id}.`,
            400,
            'VALIDATION_ERROR',
          );
        }

        // Perform FIFO Batch Reservation
        const batches = this.repository.availableBatches(item.item_id, item.warehouse_id);

        let remaining = item.quantity;
        let reserved = 0;

        for (const batch of batches) {
          if (remaining <= 0) break;
          const available = this.inventoryService.getAvailableQuantity(
            item.item_id,
            item.warehouse_id,
            batch.id,
          );
          if (available > 0) {
            const alloc = Math.min(available, remaining);
            this.inventoryService.reserveStock(
              {
                itemId: item.item_id,
                warehouseId: item.warehouse_id,
                batchId: batch.id,
                quantity: alloc,
                referenceTable: 'sales_orders',
                referenceId: order.id,
                companyId: order.company_id,
              },
              userId,
            );

            reserved += alloc;
            remaining -= alloc;
          }
        }

        if (remaining > 0) {
          throw new AppError(
            `Insufficient available stock to reserve item ID ${item.item_id}. Outstanding: ${remaining}`,
            400,
            'INSUFFICIENT_STOCK',
          );
        }

        this.repository.updateSalesOrderItemQuantities(item.id, reserved, item.fulfilled_quantity);
      }

      this.repository.updateSalesOrderStatus(order.id, 'CONFIRMED');
      return this.repository.getSalesOrderById(order.id);
    });
  }

  // --- FULFILLMENT & INVOICING ---

  createShipment(orderId, payload, userId) {
    const { shipmentDate, notes, items } = payload;
    if (!shipmentDate || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Shipment date and items are required.', 400, 'VALIDATION_ERROR');
    }

    const order = this.repository.getSalesOrderById(orderId);
    if (!order) {
      throw new AppError('Sales Order not found.', 404, 'SALES_ORDER_NOT_FOUND');
    }
    if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_FULFILLED') {
      throw new AppError(
        `Cannot fulfill an order with status ${order.status}.`,
        400,
        'VALIDATION_ERROR',
      );
    }

    const shipmentNumber = this.repository.generateDocNumber('SH');

    return this.repository.transaction(() => {
      const shipmentItemsToSave = [];

      for (const shipItem of items) {
        const orderItem = order.items.find((oi) => oi.id === Number(shipItem.salesOrderItemId));
        if (!orderItem) {
          throw new AppError(
            `Sales order item ID ${shipItem.salesOrderItemId} not found in this order.`,
            404,
            'RELATED_RECORD_NOT_FOUND',
          );
        }

        const shipQty = Number(shipItem.quantity);
        if (shipQty <= 0) {
          throw new AppError('Quantity to ship must be positive.', 400, 'VALIDATION_ERROR');
        }

        const outstanding = orderItem.quantity - orderItem.fulfilled_quantity;
        if (shipQty > outstanding) {
          throw new AppError(
            `Shipment quantity ${shipQty} exceeds outstanding quantity ${outstanding} for item ID ${orderItem.item_id}.`,
            400,
            'VALIDATION_ERROR',
          );
        }

        // Fetch active reservations for this sales order item and consume them in order
        const reservations = this.repository.activeItemReservations(
          orderItem.item_id,
          orderItem.warehouse_id,
          order.id,
        );

        let remainingToShip = shipQty;
        for (const res of reservations) {
          if (remainingToShip <= 0) break;
          const consume = Math.min(res.quantity, remainingToShip);

          // Deduct physical stock (this will consume the reservation inside stockOut)
          const stockResult = this.inventoryService.stockOut({
            itemId: orderItem.item_id,
            warehouseId: orderItem.warehouse_id,
            batchId: res.batch_id,
            quantity: consume,
            transactionType: 'Consumption',
            referenceType: 'sales_orders',
            referenceId: order.id,
            notes: `Fulfillment of Sales Order ${order.order_number}`,
            userId,
          });

          shipmentItemsToSave.push({
            sales_order_item_id: orderItem.id,
            item_id: orderItem.item_id,
            warehouse_id: orderItem.warehouse_id,
            batch_id: res.batch_id,
            quantity: consume,
            cost_price: stockResult.unitCost,
          });

          remainingToShip -= consume;
        }

        if (remainingToShip > 0) {
          // If for some reason reservations don't cover it (should not happen), fallback to oldest batch
          const oldestBatch = this.repository.oldestBatch(
            orderItem.item_id,
            orderItem.warehouse_id,
          );

          if (!oldestBatch) {
            throw new AppError(
              'No stock batches available to handle fallback shipment.',
              400,
              'INSUFFICIENT_STOCK',
            );
          }

          const stockResult = this.inventoryService.stockOut({
            itemId: orderItem.item_id,
            warehouseId: orderItem.warehouse_id,
            batchId: oldestBatch.id,
            quantity: remainingToShip,
            transactionType: 'Consumption',
            referenceType: 'sales_orders',
            referenceId: order.id,
            notes: `Fulfillment of Sales Order ${order.order_number} (Unallocated)`,
            userId,
          });

          shipmentItemsToSave.push({
            sales_order_item_id: orderItem.id,
            item_id: orderItem.item_id,
            warehouse_id: orderItem.warehouse_id,
            batch_id: oldestBatch.id,
            quantity: remainingToShip,
            cost_price: stockResult.unitCost,
          });
        }

        // Update Sales Order Item quantities:
        // fulfilled increases by shipQty, allocated decreases by shipQty
        const newAllocated = Math.max(0, orderItem.allocated_quantity - shipQty);
        const newFulfilled = orderItem.fulfilled_quantity + shipQty;
        this.repository.updateSalesOrderItemQuantities(orderItem.id, newAllocated, newFulfilled);
      }

      // Save Shipment Header & Items
      const shipment = {
        shipment_number: shipmentNumber,
        sales_order_id: order.id,
        shipment_date: shipmentDate,
        status: 'SHIPPED',
        notes: notes || null,
        created_by: userId,
      };

      const shipmentId = this.repository.createShipment(shipment, shipmentItemsToSave);

      // Re-evaluate Sales Order Status
      const updatedOrder = this.repository.getSalesOrderById(order.id);
      let allFulfilled = true;
      for (const item of updatedOrder.items) {
        if (item.fulfilled_quantity < item.quantity) {
          allFulfilled = false;
          break;
        }
      }

      const nextStatus = allFulfilled ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
      this.repository.updateSalesOrderStatus(order.id, nextStatus);

      // Return shipment detail along with items
      return this.repository.findShipment(shipmentId);
    });
  }

  createInvoiceForShipment(shipmentId, userId) {
    return this.shipmentInvoices.createInvoiceForShipment(shipmentId, userId);
  }

  // --- CANCEL SALES ORDER ---

  cancelSalesOrder(orderId, userId) {
    const order = this.repository.getSalesOrderById(orderId);
    if (!order) {
      throw new AppError('Sales Order not found.', 404, 'SALES_ORDER_NOT_FOUND');
    }
    if (order.status === 'CANCELLED' || order.status === 'FULFILLED') {
      throw new AppError(
        `Cannot cancel a Sales Order with status ${order.status}.`,
        400,
        'VALIDATION_ERROR',
      );
    }

    return this.repository.transaction(() => {
      // Find all active reservations and cancel them
      const reservations = this.repository.activeOrderReservations(order.id);

      for (const res of reservations) {
        this.inventoryService.cancelReservation(res.id, userId);
      }

      // Reset allocated quantities
      for (const item of order.items) {
        this.repository.updateSalesOrderItemQuantities(item.id, 0, item.fulfilled_quantity);
      }

      this.repository.updateSalesOrderStatus(order.id, 'CANCELLED');
      return this.repository.getSalesOrderById(order.id);
    });
  }

  // --- REPORTS ---

  getOpenSalesOrders() {
    return this.repository.getOpenSalesOrders();
  }

  getPendingFulfillments() {
    return this.repository.getPendingFulfillments();
  }

  getQuotationConversionRate() {
    return this.repository.getQuotationConversionRate();
  }

  getCustomerOrderHistory(customerId) {
    return this.repository.getCustomerOrderHistory(customerId);
  }

  getReservedStock() {
    return this.repository.getReservedStock();
  }

  getOrderAging() {
    return this.repository.getOrderAging();
  }

  getSalesPipeline() {
    return this.repository.getSalesPipeline();
  }
}
