import { AppError } from '../../shared/errors/AppError.js';
import { SalesOrderRepository } from './salesOrder.repository.js';
import { createInventoryService } from '../inventory/inventory.service.js';
import { AccountingPostingEngine } from '../accounting/postingEngine.service.js';

function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

export class SalesOrderService {
  constructor(db) {
    this.db = db;
    this.repository = new SalesOrderRepository(db);
    this.inventoryService = createInventoryService(db);
    this.postingEngine = new AccountingPostingEngine(db);
  }

  // Helper: Pricing Calculations
  calculateLinePricing(qty, price, discountVal, gstRate, taxType) {
    const quantity = Number(qty || 0);
    const unitPrice = Number(price || 0);
    const discount = Number(discountVal || 0);
    const rate = Number(gstRate || 0);

    let lineSubtotal = 0;
    let lineGst = 0;
    let lineTotal = 0;

    if (taxType === 'INCLUSIVE') {
      const rawLineTotal = quantity * unitPrice;
      const discountedLineTotal = Math.max(0, rawLineTotal - discount);
      
      lineSubtotal = discountedLineTotal / (1 + (rate / 100));
      lineGst = discountedLineTotal - lineSubtotal;
      lineTotal = discountedLineTotal;
    } else {
      const rawLineSubtotal = quantity * unitPrice;
      const discountedLineSubtotal = Math.max(0, rawLineSubtotal - discount);
      
      lineSubtotal = discountedLineSubtotal;
      lineGst = discountedLineSubtotal * (rate / 100);
      lineTotal = discountedLineSubtotal + lineGst;
    }

    return {
      subtotal: roundMoney(lineSubtotal),
      gst: roundMoney(lineGst),
      total: roundMoney(lineTotal)
    };
  }

  generateDocNumber(prefix) {
    const year = new Date().getFullYear();
    const fullPrefix = `${prefix}-${year}-`;
    
    let last;
    if (prefix === 'QT') {
      last = this.db.prepare("SELECT quotation_number AS num FROM quotations WHERE quotation_number LIKE ? ORDER BY id DESC LIMIT 1").get(`${fullPrefix}%`);
    } else if (prefix === 'SO') {
      last = this.db.prepare("SELECT order_number AS num FROM sales_orders WHERE order_number LIKE ? ORDER BY id DESC LIMIT 1").get(`${fullPrefix}%`);
    } else {
      last = this.db.prepare("SELECT shipment_number AS num FROM sales_shipments WHERE shipment_number LIKE ? ORDER BY id DESC LIMIT 1").get(`${fullPrefix}%`);
    }

    let seq = 1;
    if (last && last.num) {
      const match = last.num.match(/(\d+)$/);
      if (match) {
        seq = parseInt(match[1], 10) + 1;
      }
    }
    return `${fullPrefix}${String(seq).padStart(6, '0')}`;
  }

  // --- QUOTATIONS ---

  createQuotation(payload, userId) {
    const { companyId = 1, customerId, quotationDate, validUntil, items, termsConditions, status = 'DRAFT', taxType = 'EXCLUSIVE' } = payload;
    
    if (!customerId || !quotationDate || !validUntil || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Customer, dates, and items are required.', 400, 'VALIDATION_ERROR');
    }

    const customer = this.db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      throw new AppError('Customer not found.', 404, 'CUSTOMER_NOT_FOUND');
    }

    const quotationNumber = this.generateDocNumber('QT');

    return this.repository.transaction(() => {
      let subtotal = 0;
      let gstTotal = 0;
      let discountAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const itemDetails = this.db.prepare('SELECT id, selling_price, gst_rate FROM inventory_items WHERE id = ?').get(item.itemId);
        if (!itemDetails) {
          throw new AppError(`Item ID ${item.itemId} not found.`, 404, 'INVENTORY_ITEM_NOT_FOUND');
        }

        const qty = Number(item.quantity);
        const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : Number(itemDetails.selling_price);
        const itemDiscount = Number(item.discountAmount || 0);
        const gstRate = item.gstRate !== undefined ? Number(item.gstRate) : Number(itemDetails.gst_rate);

        const pricing = this.calculateLinePricing(qty, unitPrice, itemDiscount, gstRate, taxType);

        subtotal += pricing.subtotal;
        gstTotal += pricing.gst;
        discountAmount += itemDiscount;

        processedItems.push({
          item_id: item.itemId,
          description: item.description || null,
          quantity: qty,
          unit_price: unitPrice,
          discount_amount: itemDiscount,
          gst_rate: gstRate,
          gst_amount: pricing.gst,
          line_total: pricing.total
        });
      }

      const grandTotal = Math.round(subtotal + gstTotal);

      const quotation = {
        quotation_number: quotationNumber,
        revision_number: 0,
        company_id: companyId,
        customer_id: customerId,
        quotation_date: quotationDate,
        valid_until: validUntil,
        status,
        subtotal: roundMoney(subtotal),
        discount_amount: roundMoney(discountAmount),
        gst_total: roundMoney(gstTotal),
        grand_total: grandTotal,
        terms_conditions: termsConditions || null,
        created_by: userId
      };

      const quotationId = this.repository.createQuotation(quotation, processedItems);
      return this.repository.getQuotationById(quotationId);
    });
  }

  reviseQuotation(quotationId, payload, userId) {
    const existing = this.repository.getQuotationById(quotationId);
    if (!existing) {
      throw new AppError('Quotation not found.', 404, 'QUOTATION_NOT_FOUND');
    }

    const { quotationDate = existing.quotation_date, validUntil = existing.valid_until, items = existing.items, termsConditions = existing.terms_conditions, status = 'DRAFT', taxType = 'EXCLUSIVE' } = payload;

    return this.repository.transaction(() => {
      let subtotal = 0;
      let gstTotal = 0;
      let discountAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const itemDetails = this.db.prepare('SELECT id, selling_price, gst_rate FROM inventory_items WHERE id = ?').get(item.itemId || item.item_id);
        if (!itemDetails) {
          throw new AppError(`Item ID ${item.itemId || item.item_id} not found.`, 404, 'INVENTORY_ITEM_NOT_FOUND');
        }

        const qty = Number(item.quantity);
        const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : (item.unit_price !== undefined ? Number(item.unit_price) : Number(itemDetails.selling_price));
        const itemDiscount = Number(item.discountAmount || item.discount_amount || 0);
        const gstRate = item.gstRate !== undefined ? Number(item.gstRate) : (item.gst_rate !== undefined ? Number(item.gst_rate) : Number(itemDetails.gst_rate));

        const pricing = this.calculateLinePricing(qty, unitPrice, itemDiscount, gstRate, taxType);

        subtotal += pricing.subtotal;
        gstTotal += pricing.gst;
        discountAmount += itemDiscount;

        processedItems.push({
          item_id: itemDetails.id,
          description: item.description || null,
          quantity: qty,
          unit_price: unitPrice,
          discount_amount: itemDiscount,
          gst_rate: gstRate,
          gst_amount: pricing.gst,
          line_total: pricing.total
        });
      }

      const grandTotal = Math.round(subtotal + gstTotal);

      // Create new revision record, keeping quotation_number the same
      const revision = {
        quotation_number: existing.quotation_number,
        revision_number: existing.revision_number + 1,
        company_id: existing.company_id,
        customer_id: existing.customer_id,
        quotation_date: quotationDate,
        valid_until: validUntil,
        status,
        subtotal: roundMoney(subtotal),
        discount_amount: roundMoney(discountAmount),
        gst_total: roundMoney(gstTotal),
        grand_total: grandTotal,
        terms_conditions: termsConditions || null,
        created_by: userId
      };

      const newId = this.repository.createQuotation(revision, processedItems);
      
      // Update status of old revision to REJECTED (revised out)
      this.repository.updateQuotationStatus(existing.id, 'REJECTED');

      return this.repository.getQuotationById(newId);
    });
  }

  // --- SALES ORDERS ---

  createSalesOrder(payload, userId) {
    const { companyId = 1, customerId, quotationId = null, orderDate, items, customerReference, termsConditions, status = 'DRAFT', taxType = 'EXCLUSIVE' } = payload;

    if (!customerId || !orderDate || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Customer, date, and items are required.', 400, 'VALIDATION_ERROR');
    }

    const customer = this.db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      throw new AppError('Customer not found.', 404, 'CUSTOMER_NOT_FOUND');
    }

    const orderNumber = this.generateDocNumber('SO');

    return this.repository.transaction(() => {
      let subtotal = 0;
      let gstTotal = 0;
      let discountAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const itemDetails = this.db.prepare('SELECT id, selling_price, gst_rate FROM inventory_items WHERE id = ?').get(item.itemId);
        if (!itemDetails) {
          throw new AppError(`Item ID ${item.itemId} not found.`, 404, 'INVENTORY_ITEM_NOT_FOUND');
        }

        const qty = Number(item.quantity);
        const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : Number(itemDetails.selling_price);
        const itemDiscount = Number(item.discountAmount || 0);
        const gstRate = item.gstRate !== undefined ? Number(item.gstRate) : Number(itemDetails.gst_rate);

        const pricing = this.calculateLinePricing(qty, unitPrice, itemDiscount, gstRate, taxType);

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
          line_total: pricing.total
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
        created_by: userId
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
        orderDate: payload.orderDate || new Date().toISOString().slice(0, 10),
        customerReference: payload.customerReference || null,
        termsConditions: quotation.terms_conditions,
        status: 'DRAFT',
        items: quotation.items.map(item => ({
          itemId: item.item_id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          discountAmount: item.discount_amount,
          gstRate: item.gst_rate,
          warehouseId: payload.warehouseId || null
        }))
      };

      const order = this.createSalesOrder(salesOrderPayload, userId);
      this.repository.updateQuotationStatus(quotation.id, 'ACCEPTED');
      return order;
    });
  }

  assertCreditLimit(companyId, customerId, grandTotal) {
    const customer = this.db.prepare('SELECT name, ledger_id, credit_limit FROM customers WHERE id = ?').get(customerId);
    if (!customer || customer.credit_limit === null || customer.credit_limit === undefined) {
      return;
    }

    let outstanding = 0;
    if (customer.ledger_id) {
      const balanceRow = this.db.prepare(`
        SELECT 
          l.opening_balance,
          COALESCE(SUM(CASE WHEN je.entry_type = 'DEBIT' THEN je.amount ELSE 0 END), 0) AS total_debit,
          COALESCE(SUM(CASE WHEN je.entry_type = 'CREDIT' THEN je.amount ELSE 0 END), 0) AS total_credit
        FROM ledgers l
        LEFT JOIN journal_entries je ON je.ledger_id = l.id
        LEFT JOIN vouchers v ON je.voucher_id = v.id AND v.company_id = ? AND v.status <> 'CANCELLED'
        WHERE l.id = ?
        GROUP BY l.id
      `).get(companyId, customer.ledger_id);

      if (balanceRow) {
        outstanding = Number(balanceRow.opening_balance) + Number(balanceRow.total_debit) - Number(balanceRow.total_credit);
      }
    }

    if (outstanding + grandTotal > customer.credit_limit) {
      throw new AppError(`Action would exceed customer credit limit of ${customer.credit_limit}. Current outstanding: ${Math.round(outstanding * 100) / 100}`, 400, 'CREDIT_LIMIT_EXCEEDED');
    }
  }

  confirmSalesOrder(orderId, userId) {
    const order = this.repository.getSalesOrderById(orderId);
    if (!order) {
      throw new AppError('Sales Order not found.', 404, 'SALES_ORDER_NOT_FOUND');
    }
    if (order.status !== 'DRAFT') {
      throw new AppError(`Cannot confirm a Sales Order with status ${order.status}.`, 400, 'VALIDATION_ERROR');
    }

    return this.repository.transaction(() => {
      // Check Credit Limit before reserving stock
      this.assertCreditLimit(order.company_id, order.customer_id, order.grand_total);
      for (const item of order.items) {
        if (!item.warehouse_id) {
          throw new AppError(`Warehouse selection is required on line item for ${item.item_id}.`, 400, 'VALIDATION_ERROR');
        }

        // Perform FIFO Batch Reservation
        const batches = this.db.prepare(`
          SELECT id, quantity FROM inventory_batches
          WHERE item_id = ? AND warehouse_id = ? AND quantity > 0
          ORDER BY id ASC
        `).all(item.item_id, item.warehouse_id);

        let remaining = item.quantity;
        let reserved = 0;

        for (const batch of batches) {
          if (remaining <= 0) break;
          const available = this.inventoryService.getAvailableQuantity(item.item_id, item.warehouse_id, batch.id);
          if (available > 0) {
            const alloc = Math.min(available, remaining);
            this.inventoryService.reserveStock({
              itemId: item.item_id,
              warehouseId: item.warehouse_id,
              batchId: batch.id,
              quantity: alloc,
              referenceTable: 'sales_orders',
              referenceId: order.id,
              companyId: order.company_id
            }, userId);

            reserved += alloc;
            remaining -= alloc;
          }
        }

        if (remaining > 0) {
          throw new AppError(`Insufficient available stock to reserve item ID ${item.item_id}. Outstanding: ${remaining}`, 400, 'INSUFFICIENT_STOCK');
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
      throw new AppError(`Cannot fulfill an order with status ${order.status}.`, 400, 'VALIDATION_ERROR');
    }

    const shipmentNumber = this.generateDocNumber('SH');

    return this.repository.transaction(() => {
      const shipmentItemsToSave = [];

      for (const shipItem of items) {
        const orderItem = order.items.find(oi => oi.id === Number(shipItem.salesOrderItemId));
        if (!orderItem) {
          throw new AppError(`Sales order item ID ${shipItem.salesOrderItemId} not found in this order.`, 404, 'RELATED_RECORD_NOT_FOUND');
        }

        const shipQty = Number(shipItem.quantity);
        if (shipQty <= 0) {
          throw new AppError('Quantity to ship must be positive.', 400, 'VALIDATION_ERROR');
        }

        const outstanding = orderItem.quantity - orderItem.fulfilled_quantity;
        if (shipQty > outstanding) {
          throw new AppError(`Shipment quantity ${shipQty} exceeds outstanding quantity ${outstanding} for item ID ${orderItem.item_id}.`, 400, 'VALIDATION_ERROR');
        }

        // Fetch active reservations for this sales order item and consume them in order
        const reservations = this.db.prepare(`
          SELECT * FROM inventory_reservations
          WHERE item_id = ? AND warehouse_id = ? AND reference_table = 'sales_orders' AND reference_id = ? AND status = 'ACTIVE'
          ORDER BY id ASC
        `).all(orderItem.item_id, orderItem.warehouse_id, order.id);

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
            userId
          });

          shipmentItemsToSave.push({
            sales_order_item_id: orderItem.id,
            item_id: orderItem.item_id,
            warehouse_id: orderItem.warehouse_id,
            batch_id: res.batch_id,
            quantity: consume,
            cost_price: stockResult.unitCost
          });

          remainingToShip -= consume;
        }

        if (remainingToShip > 0) {
          // If for some reason reservations don't cover it (should not happen), fallback to oldest batch
          const oldestBatch = this.db.prepare(`
            SELECT id FROM inventory_batches WHERE item_id = ? AND warehouse_id = ? ORDER BY id ASC LIMIT 1
          `).get(orderItem.item_id, orderItem.warehouse_id);

          if (!oldestBatch) {
            throw new AppError('No stock batches available to handle fallback shipment.', 400, 'INSUFFICIENT_STOCK');
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
            userId
          });

          shipmentItemsToSave.push({
            sales_order_item_id: orderItem.id,
            item_id: orderItem.item_id,
            warehouse_id: orderItem.warehouse_id,
            batch_id: oldestBatch.id,
            quantity: remainingToShip,
            cost_price: stockResult.unitCost
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
        created_by: userId
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
      const savedShipment = this.db.prepare('SELECT * FROM sales_shipments WHERE id = ?').get(shipmentId);
      savedShipment.items = this.db.prepare('SELECT * FROM sales_shipment_items WHERE sales_shipment_id = ?').all(shipmentId);
      return savedShipment;
    });
  }

  createInvoiceForShipment(shipmentId, userId) {
    const shipment = this.db.prepare('SELECT * FROM sales_shipments WHERE id = ?').get(shipmentId);
    if (!shipment) {
      throw new AppError('Shipment not found.', 404, 'SHIPMENT_NOT_FOUND');
    }

    const order = this.repository.getSalesOrderById(shipment.sales_order_id);
    const shipmentItems = this.db.prepare('SELECT * FROM sales_shipment_items WHERE sales_shipment_id = ?').all(shipmentId);

    // Verify company & customer state for GST resolution
    const customer = this.db.prepare('SELECT name, state FROM customers WHERE id = ?').get(order.customer_id);
    const company = this.db.prepare('SELECT state FROM companies WHERE id = ?').get(order.company_id);
    const companyState = company ? (company.state || 'Haryana') : 'Haryana';
    const customerState = customer ? (customer.state || companyState) : companyState;
    const isInterstate = customerState.trim().toLowerCase() !== companyState.trim().toLowerCase();

    const customerLedgerId = this.postingEngine.getOrCreateCustomerLedger(order.company_id, order.customer_id, customer.name);

    return this.repository.transaction(() => {
      // 1. Generate sequential invoice number (DIR- prefix reused for direct billing)
      const year = new Date().getFullYear();
      const prefix = `DIR-${year}-`;
      const last = this.db.prepare("SELECT invoice_number FROM direct_invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1").get(`${prefix}%`);
      let seq = 1;
      if (last && last.invoice_number) {
        const match = last.invoice_number.match(/(\d+)$/);
        if (match) {
          seq = parseInt(match[1], 10) + 1;
        }
      }
      const invoiceNumber = `${prefix}${String(seq).padStart(6, '0')}`;

      // Insert direct invoice header
      const dummyInfo = this.db.prepare(`
        INSERT INTO direct_invoices (
          invoice_number, company_id, customer_id, invoice_date, subtotal, gst_total, grand_total, status, narration, created_by, cgst_total, sgst_total, igst_total, sales_order_id, sales_shipment_id
        ) VALUES (?, ?, ?, ?, 0, 0, 0, 'UNPAID', ?, ?, 0, 0, 0, ?, ?)
      `).run(invoiceNumber, order.company_id, order.customer_id, shipment.shipment_date, `Invoice for Shipment ${shipment.shipment_number}`, userId, order.id, shipment.id);

      const invoiceId = dummyInfo.lastInsertRowid;

      let subtotal = 0;
      let gstTotal = 0;
      let totalPartsCost = 0;
      let totalPartsRevenue = 0;

      const processedItems = [];

      for (const shItem of shipmentItems) {
        const orderItem = order.items.find(oi => oi.id === shItem.sales_order_item_id);
        const qty = shItem.quantity;
        const price = orderItem.unit_price;
        const discountVal = (orderItem.discount_amount / orderItem.quantity) * qty;
        const gstRate = orderItem.gst_rate;

        // Calculate pricing
        const pricing = this.calculateLinePricing(qty, price, discountVal, gstRate, 'EXCLUSIVE');

        subtotal += pricing.subtotal;
        gstTotal += pricing.gst;
        totalPartsCost += (qty * shItem.cost_price);
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
          sales_shipment_item_id: shItem.id
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

      // Update invoice header with actual values
      this.db.prepare(`
        UPDATE direct_invoices 
        SET subtotal = ?, gst_total = ?, grand_total = ?, cgst_total = ?, sgst_total = ?, igst_total = ?
        WHERE id = ?
      `).run(roundMoney(subtotal), roundMoney(gstTotal), grandTotal, cgst, sgst, igst, invoiceId);

      // Save invoice items
      const insertItem = this.db.prepare(`
        INSERT INTO direct_invoice_items (
          direct_invoice_id, item_id, description, quantity, unit_price, gst_rate, gst_amount, line_total, cost_price, warehouse_id, batch_id, sales_order_item_id, sales_shipment_item_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of processedItems) {
        insertItem.run(
          invoiceId,
          item.itemId,
          item.description,
          item.quantity,
          item.unitPrice,
          item.gstRate,
          item.gstAmount,
          item.lineTotal,
          item.costPrice,
          item.warehouseId,
          item.batchId,
          item.sales_order_item_id,
          item.sales_shipment_item_id
        );
      }

      // Compile accounting entries
      const salesEntries = [];
      salesEntries.push({ ledgerId: customerLedgerId, type: 'DEBIT', amount: grandTotal });

      if (totalPartsRevenue > 0) {
        salesEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'parts_sales'), type: 'CREDIT', amount: totalPartsRevenue });
      }

      if (igst > 0) {
        salesEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'igst_output'), type: 'CREDIT', amount: igst });
      }
      if (cgst > 0) {
        salesEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'cgst_output'), type: 'CREDIT', amount: cgst });
      }
      if (sgst > 0) {
        salesEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'sgst_output'), type: 'CREDIT', amount: sgst });
      }

      // Add roundoff entry if applicable to keep journal balanced
      const roundoff = roundMoney(grandTotal - (subtotal + gstTotal));
      if (Math.abs(roundoff) >= 0.01) {
        const roundOffLedgerId = this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'round_off');
        if (roundoff > 0) {
          salesEntries.push({ ledgerId: roundOffLedgerId, type: 'CREDIT', amount: roundoff });
        } else {
          salesEntries.push({ ledgerId: roundOffLedgerId, type: 'DEBIT', amount: Math.abs(roundoff) });
        }
      }

      // Post Sales Voucher
      this.postingEngine.post({
        companyId: order.company_id,
        voucherType: 'Sales',
        voucherDate: shipment.shipment_date,
        referenceTable: 'direct_invoices',
        referenceId: invoiceId,
        narration: `Invoice for shipment ${shipment.shipment_number}`,
        created_by: userId,
        entries: salesEntries
      });

      // Post COGS Voucher
      if (totalPartsCost > 0) {
        const cogsEntries = [
          { ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'cogs'), type: 'DEBIT', amount: totalPartsCost },
          { ledgerId: this.postingEngine.ledgerResolver.getLedgerId(order.company_id, 'inventory_stock'), type: 'CREDIT', amount: totalPartsCost }
        ];

        this.postingEngine.post({
          companyId: order.company_id,
          voucherType: 'Journal',
          voucherDate: shipment.shipment_date,
          referenceTable: 'direct_invoices',
          referenceId: invoiceId,
          narration: `COGS entry for shipment ${shipment.shipment_number}`,
          created_by: userId,
          entries: cogsEntries
        });
      }

      return this.db.prepare('SELECT * FROM direct_invoices WHERE id = ?').get(invoiceId);
    });
  }

  // --- CANCEL SALES ORDER ---

  cancelSalesOrder(orderId, userId) {
    const order = this.repository.getSalesOrderById(orderId);
    if (!order) {
      throw new AppError('Sales Order not found.', 404, 'SALES_ORDER_NOT_FOUND');
    }
    if (order.status === 'CANCELLED' || order.status === 'FULFILLED') {
      throw new AppError(`Cannot cancel a Sales Order with status ${order.status}.`, 400, 'VALIDATION_ERROR');
    }

    return this.repository.transaction(() => {
      // Find all active reservations and cancel them
      const reservations = this.db.prepare(`
        SELECT id FROM inventory_reservations
        WHERE reference_table = 'sales_orders' AND reference_id = ? AND status = 'ACTIVE'
      `).all(order.id);

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
