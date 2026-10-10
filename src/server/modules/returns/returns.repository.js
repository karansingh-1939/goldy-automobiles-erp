export class ReturnsRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  // CUSTOMER RETURNS
  createCustomerReturn(data) {
    const result = this.db
      .prepare(
        `
      INSERT INTO customer_returns (
        return_number,
        company_id,
        customer_id,
        invoice_id,
        return_date,
        status,
        total_refund_amount,
        credit_note_id,
        created_by
      ) VALUES (
        @return_number,
        @company_id,
        @customer_id,
        @invoice_id,
        @return_date,
        @status,
        @total_refund_amount,
        @credit_note_id,
        @created_by
      )
    `,
      )
      .run(data);

    return this.findCustomerReturnById(result.lastInsertRowid);
  }

  createCustomerReturnItem(data) {
    this.db
      .prepare(
        `
      INSERT INTO customer_return_items (
        customer_return_id,
        item_id,
        warehouse_id,
        batch_id,
        quantity,
        unit_price,
        gst_rate,
        gst_amount,
        cgst_amount,
        sgst_amount,
        igst_amount,
        line_total,
        condition
      ) VALUES (
        @customer_return_id,
        @item_id,
        @warehouse_id,
        @batch_id,
        @quantity,
        @unit_price,
        @gst_rate,
        @gst_amount,
        @cgst_amount,
        @sgst_amount,
        @igst_amount,
        @line_total,
        @condition
      )
    `,
      )
      .run(data);
  }

  findCustomerReturnById(id) {
    const ret = this.db
      .prepare(
        `
      SELECT r.*, c.name AS customer_name, inv.invoice_number
      FROM customer_returns r
      JOIN customers c ON r.customer_id = c.id
      JOIN invoices inv ON r.invoice_id = inv.id
      WHERE r.id = ?
    `,
      )
      .get(id);

    if (!ret) return null;

    ret.items = this.db
      .prepare(
        `
      SELECT ri.*, item.item_name, item.sku, wh.name AS warehouse_name, b.batch_number
      FROM customer_return_items ri
      JOIN inventory_items item ON ri.item_id = item.id
      JOIN warehouses wh ON ri.warehouse_id = wh.id
      JOIN inventory_batches b ON ri.batch_id = b.id
      WHERE ri.customer_return_id = ?
    `,
      )
      .all(id);

    return ret;
  }

  listCustomerReturns({ companyId, customerId, invoiceId, status, dateFrom, dateTo }) {
    const clauses = ['r.company_id = ?'];
    const params = [companyId];

    if (customerId) {
      clauses.push('r.customer_id = ?');
      params.push(customerId);
    }
    if (invoiceId) {
      clauses.push('r.invoice_id = ?');
      params.push(invoiceId);
    }
    if (status) {
      clauses.push('r.status = ?');
      params.push(status);
    }
    if (dateFrom) {
      clauses.push('DATE(r.return_date) >= DATE(?)');
      params.push(dateFrom);
    }
    if (dateTo) {
      clauses.push('DATE(r.return_date) <= DATE(?)');
      params.push(dateTo);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db
      .prepare(
        `
      SELECT r.*, c.name AS customer_name, inv.invoice_number
      FROM customer_returns r
      JOIN customers c ON r.customer_id = c.id
      JOIN invoices inv ON r.invoice_id = inv.id
      ${where}
      ORDER BY r.return_date DESC, r.id DESC
    `,
      )
      .all(params);
  }

  updateCustomerReturn(id, data) {
    const columns = Object.keys(data);
    const setClause = columns.map((col) => `${col} = @${col}`).join(', ');
    this.db
      .prepare(
        `
      UPDATE customer_returns
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `,
      )
      .run({ ...data, id });

    return this.findCustomerReturnById(id);
  }

  getAlreadyReturnedQuantity(invoiceId, itemId) {
    const row = this.db
      .prepare(
        `
      SELECT COALESCE(SUM(ri.quantity), 0) AS total
      FROM customer_return_items ri
      JOIN customer_returns r ON ri.customer_return_id = r.id
      WHERE r.invoice_id = ? AND ri.item_id = ? AND r.status <> 'CANCELLED'
    `,
      )
      .get(invoiceId, itemId);
    return row ? row.total : 0;
  }

  // SUPPLIER RETURNS
  createSupplierReturn(data) {
    const result = this.db
      .prepare(
        `
      INSERT INTO supplier_returns (
        return_number,
        company_id,
        supplier_id,
        purchase_id,
        return_date,
        status,
        total_refund_amount,
        debit_note_id,
        created_by
      ) VALUES (
        @return_number,
        @company_id,
        @supplier_id,
        @purchase_id,
        @return_date,
        @status,
        @total_refund_amount,
        @debit_note_id,
        @created_by
      )
    `,
      )
      .run(data);

    return this.findSupplierReturnById(result.lastInsertRowid);
  }

  createSupplierReturnItem(data) {
    this.db
      .prepare(
        `
      INSERT INTO supplier_return_items (
        supplier_return_id,
        item_id,
        warehouse_id,
        batch_id,
        quantity,
        unit_cost,
        gst_rate,
        gst_amount,
        line_total
      ) VALUES (
        @supplier_return_id,
        @item_id,
        @warehouse_id,
        @batch_id,
        @quantity,
        @unit_cost,
        @gst_rate,
        @gst_amount,
        @line_total
      )
    `,
      )
      .run(data);
  }

  findSupplierReturnById(id) {
    const ret = this.db
      .prepare(
        `
      SELECT r.*, s.name AS supplier_name, p.purchase_number
      FROM supplier_returns r
      JOIN suppliers s ON r.supplier_id = s.id
      LEFT JOIN purchases p ON r.purchase_id = p.id
      WHERE r.id = ?
    `,
      )
      .get(id);

    if (!ret) return null;

    ret.items = this.db
      .prepare(
        `
      SELECT ri.*, item.item_name, item.sku, wh.name AS warehouse_name, b.batch_number
      FROM supplier_return_items ri
      JOIN inventory_items item ON ri.item_id = item.id
      JOIN warehouses wh ON ri.warehouse_id = wh.id
      JOIN inventory_batches b ON ri.batch_id = b.id
      WHERE ri.supplier_return_id = ?
    `,
      )
      .all(id);

    return ret;
  }

  listSupplierReturns({ companyId, supplierId, purchaseId, status, dateFrom, dateTo }) {
    const clauses = ['r.company_id = ?'];
    const params = [companyId];

    if (supplierId) {
      clauses.push('r.supplier_id = ?');
      params.push(supplierId);
    }
    if (purchaseId) {
      clauses.push('r.purchase_id = ?');
      params.push(purchaseId);
    }
    if (status) {
      clauses.push('r.status = ?');
      params.push(status);
    }
    if (dateFrom) {
      clauses.push('DATE(r.return_date) >= DATE(?)');
      params.push(dateFrom);
    }
    if (dateTo) {
      clauses.push('DATE(r.return_date) <= DATE(?)');
      params.push(dateTo);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db
      .prepare(
        `
      SELECT r.*, s.name AS supplier_name, p.purchase_number
      FROM supplier_returns r
      JOIN suppliers s ON r.supplier_id = s.id
      LEFT JOIN purchases p ON r.purchase_id = p.id
      ${where}
      ORDER BY r.return_date DESC, r.id DESC
    `,
      )
      .all(params);
  }

  updateSupplierReturn(id, data) {
    const columns = Object.keys(data);
    const setClause = columns.map((col) => `${col} = @${col}`).join(', ');
    this.db
      .prepare(
        `
      UPDATE supplier_returns
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `,
      )
      .run({ ...data, id });

    return this.findSupplierReturnById(id);
  }

  // CORE UTILITIES
  findInvoiceById(id) {
    return this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  }

  findInvoiceItem(invoiceId, itemId) {
    return this.db
      .prepare(
        `
      SELECT * FROM invoice_items
      WHERE invoice_id = ? AND inventory_item_id = ?
    `,
      )
      .get(invoiceId, itemId);
  }

  findPurchaseById(id) {
    return this.db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
  }

  findPurchaseItem(purchaseId, itemId) {
    return this.db
      .prepare(
        `
      SELECT * FROM purchase_receipt_items
      WHERE purchase_id = ? AND item_id = ?
    `,
      )
      .get(purchaseId, itemId);
  }
}
