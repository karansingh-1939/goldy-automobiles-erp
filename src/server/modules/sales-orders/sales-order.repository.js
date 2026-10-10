export class SalesOrderRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(cb) {
    return this.db.transaction(cb)();
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
          gst_total, grand_total, terms_conditions, created_by
        ) VALUES (
          @quotation_number, @revision_number, @company_id, @customer_id,
          @quotation_date, @valid_until, @status, @subtotal, @discount_amount,
          @gst_total, @grand_total, @terms_conditions, @created_by
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
          discount_amount, gst_total, grand_total, terms_conditions, created_by
        ) VALUES (
          @order_number, @company_id, @customer_id, @quotation_id,
          @order_date, @status, @customer_reference, @subtotal,
          @discount_amount, @gst_total, @grand_total, @terms_conditions, @created_by
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

  listSalesOrders({ status, customerId, limit = 50, offset = 0 }) {
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
