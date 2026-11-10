import { DocumentSeries, nextDocumentNumber } from '../../shared/utils/document-number.js';

export class SalesOrderRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(cb) {
    return this.db.transaction(cb)();
  }

  generateDocNumber(prefix) {
    const year = new Date().getFullYear();
    const fullPrefix = `${prefix}-${year}-`;

    let last;
    if (prefix === 'QT') {
      last = this.db
        .prepare(
          'SELECT quotation_number AS num FROM quotations WHERE quotation_number LIKE ? ORDER BY id DESC LIMIT 1',
        )
        .get(`${fullPrefix}%`);
    } else if (prefix === 'SO') {
      last = this.db
        .prepare(
          'SELECT order_number AS num FROM sales_orders WHERE order_number LIKE ? ORDER BY id DESC LIMIT 1',
        )
        .get(`${fullPrefix}%`);
    } else {
      last = this.db
        .prepare(
          'SELECT shipment_number AS num FROM sales_shipments WHERE shipment_number LIKE ? ORDER BY id DESC LIMIT 1',
        )
        .get(`${fullPrefix}%`);
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

  findCustomer(id) {
    return this.db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
  }
  findPricedItem(id) {
    return this.db
      .prepare('SELECT id, selling_price, gst_rate FROM inventory_items WHERE id = ?')
      .get(id);
  }

  // --- QUOTATIONS ---

  createQuotation(quotation, items) {
    return this.transaction(() => {
      const qResult = this.db
        .prepare(
          `
        INSERT INTO quotations (
          quotation_number, revision_number, company_id, customer_id, 
          quotation_date, valid_until, status, subtotal, discount_amount, 
          gst_total, grand_total, terms_conditions, created_by, tax_type
        ) VALUES (
          @quotation_number, @revision_number, @company_id, @customer_id,
          @quotation_date, @valid_until, @status, @subtotal, @discount_amount,
          @gst_total, @grand_total, @terms_conditions, @created_by, @tax_type
        )
      `,
        )
        .run(quotation);

      const quotationId = qResult.lastInsertRowid;

      const itemInsert = this.db.prepare(`
        INSERT INTO quotation_items (
          quotation_id, item_id, description, quantity, unit_price, 
          discount_amount, gst_rate, gst_amount, line_total
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      for (const item of items) {
        itemInsert.run(
          quotationId,
          item.item_id,
          item.description || null,
          item.quantity,
          item.unit_price,
          item.discount_amount || 0,
          item.gst_rate || 0,
          item.gst_amount || 0,
          item.line_total,
        );
      }

      return quotationId;
    });
  }

  getQuotationById(id) {
    const quotation = this.db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
    if (!quotation) return null;

    const items = this.db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(id);
    return { ...quotation, items };
  }

  getLatestRevision(quotationNumber) {
    return this.db
      .prepare(
        `
      SELECT * FROM quotations 
      WHERE quotation_number = ? 
      ORDER BY revision_number DESC 
      LIMIT 1
    `,
      )
      .get(quotationNumber);
  }

  listQuotations({ status, search, limit = 50, offset = 0 }) {
    let sql = `
      SELECT q.*, c.name AS customer_name 
      FROM quotations q
      JOIN customers c ON c.id = q.customer_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND q.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (q.quotation_number LIKE ? OR c.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY q.quotation_number DESC, q.revision_number DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params);
  }

  updateQuotationStatus(id, status) {
    this.db
      .prepare('UPDATE quotations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, id);
  }

  // --- SALES ORDERS ---

  createSalesOrder(order, items) {
    return this.transaction(() => {
      const oResult = this.db
        .prepare(
          `
        INSERT INTO sales_orders (
          order_number, company_id, customer_id, quotation_id, 
          order_date, status, customer_reference, subtotal, 
          discount_amount, gst_total, grand_total, terms_conditions, created_by, tax_type
        ) VALUES (
          @order_number, @company_id, @customer_id, @quotation_id,
          @order_date, @status, @customer_reference, @subtotal,
          @discount_amount, @gst_total, @grand_total, @terms_conditions, @created_by, @tax_type
        )
      `,
        )
        .run(order);

      const orderId = oResult.lastInsertRowid;

      const itemInsert = this.db.prepare(`
        INSERT INTO sales_order_items (
          sales_order_id, item_id, warehouse_id, description, quantity, 
          allocated_quantity, fulfilled_quantity, unit_price, 
          discount_amount, gst_rate, gst_amount, line_total
        ) VALUES (
          ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?
        )
      `);

      for (const item of items) {
        itemInsert.run(
          orderId,
          item.item_id,
          item.warehouse_id || null,
          item.description || null,
          item.quantity,
          item.unit_price,
          item.discount_amount || 0,
          item.gst_rate || 0,
          item.gst_amount || 0,
          item.line_total,
        );
      }

      return orderId;
    });
  }

  getSalesOrderById(id) {
    const order = this.db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(id);
    if (!order) return null;

    const items = this.db
      .prepare('SELECT * FROM sales_order_items WHERE sales_order_id = ?')
      .all(id);
    return { ...order, items };
  }

  listSalesOrders({ status, customerId, search, limit = 50, offset = 0, count = false }) {
    let sql = `
      SELECT o.*, c.name AS customer_name 
      FROM sales_orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND o.status = ?';
      params.push(status);
    }
    if (customerId) {
      sql += ' AND o.customer_id = ?';
      params.push(Number(customerId));
    }

    if (search) {
      sql += ' AND (o.order_number LIKE ? OR c.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (count) {
      sql = sql.replace('SELECT o.*, c.name AS customer_name', 'SELECT COUNT(*) AS total');
      return this.db.prepare(sql).get(...params).total;
    }

    sql += ' ORDER BY o.order_number DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params);
  }

  updateSalesOrderStatus(id, status) {
    this.db
      .prepare('UPDATE sales_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, id);
  }

  updateSalesOrderItemQuantities(itemId, allocatedQty, fulfilledQty) {
    this.db
      .prepare(
        `
      UPDATE sales_order_items 
      SET allocated_quantity = ?, fulfilled_quantity = ? 
      WHERE id = ?
    `,
      )
      .run(allocatedQty, fulfilledQty, itemId);
  }

  // --- SHIPMENTS ---

  availableBatches(itemId, warehouseId) {
    return this.db
      .prepare(
        'SELECT id, quantity FROM inventory_batches WHERE item_id = ? AND warehouse_id = ? AND quantity > 0 ORDER BY id ASC',
      )
      .all(itemId, warehouseId);
  }

  activeItemReservations(itemId, warehouseId, orderId) {
    return this.db
      .prepare(
        "SELECT * FROM inventory_reservations WHERE item_id = ? AND warehouse_id = ? AND reference_table = 'sales_orders' AND reference_id = ? AND status = 'ACTIVE' ORDER BY id ASC",
      )
      .all(itemId, warehouseId, orderId);
  }

  oldestBatch(itemId, warehouseId) {
    return this.db
      .prepare(
        'SELECT id FROM inventory_batches WHERE item_id = ? AND warehouse_id = ? ORDER BY id ASC LIMIT 1',
      )
      .get(itemId, warehouseId);
  }

  activeOrderReservations(orderId) {
    return this.db
      .prepare(
        "SELECT id FROM inventory_reservations WHERE reference_table = 'sales_orders' AND reference_id = ? AND status = 'ACTIVE'",
      )
      .all(orderId);
  }

  findShipment(id) {
    const shipment = this.db.prepare('SELECT * FROM sales_shipments WHERE id = ?').get(id);
    if (!shipment) return null;
    shipment.items = this.db
      .prepare('SELECT * FROM sales_shipment_items WHERE sales_shipment_id = ?')
      .all(id);
    return shipment;
  }

  findCustomerState(id) {
    return this.db.prepare('SELECT name, state FROM customers WHERE id = ?').get(id);
  }

  findCompanyState(id) {
    return this.db.prepare('SELECT state FROM companies WHERE id = ?').get(id);
  }

  findInvoiceForShipment(id) {
    return this.db.prepare('SELECT id FROM direct_invoices WHERE sales_shipment_id = ?').get(id);
  }

  // Shipment invoices share the counter-sale series because both live in direct_invoices.
  nextCounterInvoiceNumber(invoiceDate) {
    return nextDocumentNumber(this.db, DocumentSeries.COUNTER_INVOICE, invoiceDate);
  }

  createShipmentInvoice(order, shipment, number, userId) {
    return this.db
      .prepare(
        `INSERT INTO direct_invoices (
      invoice_number, company_id, customer_id, invoice_date, subtotal, gst_total, grand_total, status, narration, created_by, cgst_total, sgst_total, igst_total, sales_order_id, sales_shipment_id
    ) VALUES (?, ?, ?, ?, 0, 0, 0, 'UNPAID', ?, ?, 0, 0, 0, ?, ?)`,
      )
      .run(
        number,
        order.company_id,
        order.customer_id,
        shipment.shipment_date,
        `Invoice for Shipment ${shipment.shipment_number}`,
        userId,
        order.id,
        shipment.id,
      ).lastInsertRowid;
  }

  updateShipmentInvoiceTotals(id, subtotal, gst, total, cgst, sgst, igst) {
    this.db
      .prepare(
        'UPDATE direct_invoices SET subtotal = ?, gst_total = ?, grand_total = ?, cgst_total = ?, sgst_total = ?, igst_total = ? WHERE id = ?',
      )
      .run(subtotal, gst, total, cgst, sgst, igst, id);
  }

  insertShipmentInvoiceItems(invoiceId, items) {
    const insert = this.db.prepare(`INSERT INTO direct_invoice_items (
      direct_invoice_id, item_id, description, quantity, unit_price, gst_rate, gst_amount, line_total, cost_price, warehouse_id, batch_id, sales_order_item_id, sales_shipment_item_id, line_cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const item of items)
      insert.run(
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
        item.sales_shipment_item_id,
        Math.round(item.quantity * item.costPrice * 100) / 100,
      );
  }

  linkShipmentInvoiceVoucher(invoiceId, voucherId, costVoucher = false) {
    const column = costVoucher ? 'cogs_voucher_id' : 'voucher_id';
    this.db
      .prepare(`UPDATE direct_invoices SET ${column} = ? WHERE id = ?`)
      .run(voucherId, invoiceId);
  }

  findDirectInvoice(id) {
    return this.db.prepare('SELECT * FROM direct_invoices WHERE id = ?').get(id);
  }

  createShipment(shipment, items) {
    return this.transaction(() => {
      const sResult = this.db
        .prepare(
          `
        INSERT INTO sales_shipments (
          shipment_number, sales_order_id, shipment_date, status, notes, created_by
        ) VALUES (
          @shipment_number, @sales_order_id, @shipment_date, @status, @notes, @created_by
        )
      `,
        )
        .run(shipment);

      const shipmentId = sResult.lastInsertRowid;

      const itemInsert = this.db.prepare(`
        INSERT INTO sales_shipment_items (
          sales_shipment_id, sales_order_item_id, item_id, warehouse_id, batch_id, quantity, cost_price
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?
        )
      `);

      for (const item of items) {
        itemInsert.run(
          shipmentId,
          item.sales_order_item_id,
          item.item_id,
          item.warehouse_id,
          item.batch_id,
          item.quantity,
          item.cost_price,
        );
      }

      return shipmentId;
    });
  }

  getShipmentsForOrder(orderId) {
    const shipments = this.db
      .prepare('SELECT * FROM sales_shipments WHERE sales_order_id = ?')
      .all(orderId);
    for (const sh of shipments) {
      sh.items = this.db
        .prepare('SELECT * FROM sales_shipment_items WHERE sales_shipment_id = ?')
        .all(sh.id);
    }
    return shipments;
  }

  // --- REPORT AGGREGATIONS ---

  getOpenSalesOrders() {
    return this.db
      .prepare(
        `
      SELECT o.*, c.name AS customer_name 
      FROM sales_orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.status IN ('CONFIRMED', 'PARTIALLY_FULFILLED')
      ORDER BY o.order_date ASC
    `,
      )
      .all();
  }

  getPendingFulfillments() {
    return this.db
      .prepare(
        `
      SELECT oi.*, o.order_number, o.order_date, c.name AS customer_name, i.item_name, i.sku, w.name AS warehouse_name
      FROM sales_order_items oi
      JOIN sales_orders o ON o.id = oi.sales_order_id
      JOIN customers c ON c.id = o.customer_id
      JOIN inventory_items i ON i.id = oi.item_id
      LEFT JOIN warehouses w ON w.id = oi.warehouse_id
      WHERE o.status IN ('CONFIRMED', 'PARTIALLY_FULFILLED') AND (oi.quantity - oi.fulfilled_quantity) > 0
      ORDER BY o.order_date ASC
    `,
      )
      .all();
  }

  getQuotationConversionRate() {
    const total = this.db
      .prepare('SELECT COUNT(DISTINCT quotation_number) AS count FROM quotations')
      .get().count;
    const converted = this.db
      .prepare(
        'SELECT COUNT(DISTINCT quotation_id) AS count FROM sales_orders WHERE quotation_id IS NOT NULL',
      )
      .get().count;
    return {
      totalQuotations: total,
      convertedQuotations: converted,
      conversionRate: total > 0 ? Math.round((converted / total) * 10000) / 100 : 0,
    };
  }

  getCustomerOrderHistory(customerId) {
    const orders = this.db
      .prepare(
        `
      SELECT id, order_number, order_date, status, grand_total 
      FROM sales_orders 
      WHERE customer_id = ? 
      ORDER BY order_date DESC
    `,
      )
      .all(customerId);

    const invoices = this.db
      .prepare(
        `
      SELECT id, invoice_number, invoice_date, status, grand_total 
      FROM direct_invoices 
      WHERE customer_id = ? 
      ORDER BY invoice_date DESC
    `,
      )
      .all(customerId);

    return { orders, invoices };
  }

  getReservedStock() {
    return this.db
      .prepare(
        `
      SELECT r.*, i.item_name, i.sku, w.name AS warehouse_name, b.batch_number
      FROM inventory_reservations r
      JOIN inventory_items i ON i.id = r.item_id
      JOIN warehouses w ON w.id = r.warehouse_id
      LEFT JOIN inventory_batches b ON b.id = r.batch_id
      WHERE r.status = 'ACTIVE'
      ORDER BY r.created_at ASC
    `,
      )
      .all();
  }

  getOrderAging() {
    const openOrders = this.getOpenSalesOrders();
    const now = new Date();

    const aging = {
      bucket_0_30: { count: 0, value: 0 },
      bucket_31_60: { count: 0, value: 0 },
      bucket_61_90: { count: 0, value: 0 },
      bucket_90_plus: { count: 0, value: 0 },
    };

    for (const order of openOrders) {
      const orderDate = new Date(order.order_date);
      const diffTime = Math.abs(now - orderDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 30) {
        aging.bucket_0_30.count++;
        aging.bucket_0_30.value += order.grand_total;
      } else if (diffDays <= 60) {
        aging.bucket_31_60.count++;
        aging.bucket_31_60.value += order.grand_total;
      } else if (diffDays <= 90) {
        aging.bucket_61_90.count++;
        aging.bucket_61_90.value += order.grand_total;
      } else {
        aging.bucket_90_plus.count++;
        aging.bucket_90_plus.value += order.grand_total;
      }
    }

    return aging;
  }

  getSalesPipeline() {
    const quotes = this.db
      .prepare(
        `
      SELECT status, COUNT(*) AS count, SUM(grand_total) AS value 
      FROM quotations 
      GROUP BY status
    `,
      )
      .all();

    const orders = this.db
      .prepare(
        `
      SELECT status, COUNT(*) AS count, SUM(grand_total) AS value 
      FROM sales_orders 
      GROUP BY status
    `,
      )
      .all();

    return { quotations: quotes, salesOrders: orders };
  }
}
