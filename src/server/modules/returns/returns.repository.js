import { AppError } from '../../shared/errors/app-error.js';

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
        invoice_item_id,
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
        @invoice_item_id,
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

  getAlreadyReturnedQuantity(invoiceId, invoiceItem) {
    const ambiguous = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM customer_return_items ri
      JOIN customer_returns r ON r.id=ri.customer_return_id
      WHERE r.invoice_id=? AND ri.item_id=? AND ri.batch_id=? AND ri.invoice_item_id IS NULL AND r.status<>'CANCELLED'
      AND (SELECT COUNT(*) FROM invoice_items WHERE invoice_id=? AND inventory_item_id=? AND batch_id=?) > 1`,
      )
      .get(
        invoiceId,
        invoiceItem.inventory_item_id,
        invoiceItem.batch_id,
        invoiceId,
        invoiceItem.inventory_item_id,
        invoiceItem.batch_id,
      );
    if (ambiguous.n)
      throw new AppError(
        'Historical return has an ambiguous invoice line. Reconcile it before another return.',
        409,
        'RETURN_LINE_AMBIGUOUS',
      );
    const row = this.db
      .prepare(
        `
      SELECT COALESCE(SUM(ri.quantity), 0) AS total
      FROM customer_return_items ri
      JOIN customer_returns r ON ri.customer_return_id = r.id
      WHERE r.invoice_id = ? AND (ri.invoice_item_id = ? OR
        (ri.invoice_item_id IS NULL AND ri.item_id = ? AND ri.batch_id = ?)) AND r.status <> 'CANCELLED'
    `,
      )
      .get(invoiceId, invoiceItem.id, invoiceItem.inventory_item_id, invoiceItem.batch_id);
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
        , source_table, source_item_id, cgst_amount, sgst_amount, igst_amount
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
        , @source_table, @source_item_id, @cgst_amount, @sgst_amount, @igst_amount
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

  findInvoiceItem(invoiceId, itemId, invoiceItemId = null, historicalBatchId = null) {
    const rows = invoiceItemId
      ? this.db
          .prepare('SELECT * FROM invoice_items WHERE invoice_id=? AND id=?')
          .all(invoiceId, invoiceItemId)
      : historicalBatchId
        ? this.db
            .prepare(
              'SELECT * FROM invoice_items WHERE invoice_id=? AND inventory_item_id=? AND batch_id=?',
            )
            .all(invoiceId, itemId, historicalBatchId)
        : this.db
            .prepare('SELECT * FROM invoice_items WHERE invoice_id=? AND inventory_item_id=?')
            .all(invoiceId, itemId);
    if (rows.length > 1)
      throw new AppError(
        'Select the original invoice line, not only its SKU.',
        400,
        'RETURN_LINE_AMBIGUOUS',
      );
    return rows[0] || null;
  }

  supplierReturnSource(batchId, supplierId, purchaseId, item = {}) {
    let rows = this.db
      .prepare(
        `
      SELECT pi.*, 'purchase_items' AS source_table, COALESCE(pr.supplier_id, p.supplier_id) AS supplier_id,
        CASE WHEN pi.purchase_receipt_id IS NOT NULL THEN 'purchase_receipts' ELSE 'purchases' END AS document_table,
        COALESCE(pi.purchase_receipt_id, pi.purchase_id) AS document_id
      FROM purchase_items pi LEFT JOIN purchase_receipts pr ON pr.id=pi.purchase_receipt_id
      LEFT JOIN purchases p ON p.id=pi.purchase_id
      WHERE pi.batch_id=? AND (pr.status='POSTED' OR p.status='FINALIZED')
      UNION ALL
      SELECT bi.id, NULL, NULL, NULL, bi.item_id, bi.warehouse_id, bi.batch_id, NULL, NULL, NULL,
        bi.quantity, bi.purchase_cost, 0, bi.gst_rate, bi.gst_amount, bi.line_total,
        'purchase_bill_items', b.supplier_id, 'purchase_bills', b.id
      FROM purchase_bill_items bi JOIN purchase_bills b ON b.id=bi.purchase_bill_id
      WHERE bi.batch_id=? AND b.status<>'CANCELLED'
    `,
      )
      .all(batchId, batchId);
    if (purchaseId) rows = rows.filter((row) => row.purchase_id === Number(purchaseId));
    if (item.purchaseItemId)
      rows = rows.filter(
        (row) => row.source_table === 'purchase_items' && row.id === Number(item.purchaseItemId),
      );
    if (item.purchaseBillItemId)
      rows = rows.filter(
        (row) =>
          row.source_table === 'purchase_bill_items' && row.id === Number(item.purchaseBillItemId),
      );
    if (item.source_table && item.source_item_id)
      rows = rows.filter(
        (row) => row.source_table === item.source_table && row.id === Number(item.source_item_id),
      );
    if (!rows.length)
      throw new AppError(
        'Original supplier purchase is missing. Record or reconcile its purchase evidence before returning this batch.',
        400,
        'RETURN_PURCHASE_MISSING',
      );
    if (rows.some((row) => Number(row.supplier_id) !== Number(supplierId)))
      throw new AppError(
        'Return supplier must match the original purchase supplier.',
        400,
        'RETURN_SUPPLIER_MISMATCH',
      );
    if (rows.length !== 1)
      throw new AppError(
        'Select purchaseItemId or purchaseBillItemId: this batch has several original purchase lines.',
        400,
        'RETURN_PURCHASE_AMBIGUOUS',
      );
    const source = rows[0];
    const tax = this.db
      .prepare(
        `SELECT l.system_key, SUM(je.amount) AS amount FROM journal_entries je
      JOIN vouchers v ON v.id=je.voucher_id JOIN ledgers l ON l.id=je.ledger_id
      WHERE v.reference_table=? AND v.reference_id=? AND v.status<>'CANCELLED'
        AND l.system_key IN ('cgst_input','sgst_input','igst_input') AND je.entry_type='DEBIT'
      GROUP BY l.system_key`,
      )
      .all(source.document_table, source.document_id);
    if (source.gst_amount > 0 && !tax.length)
      throw new AppError(
        'Original purchase tax posting is missing. Reconcile its tax evidence before returning this batch.',
        400,
        'RETURN_PURCHASE_TAX_MISSING',
      );
    source.interstate = tax.some((row) => row.system_key === 'igst_input' && row.amount > 0);
    return source;
  }

  supplierReturnedQuantity(source, excludeReturnId = null) {
    return this.db
      .prepare(
        `SELECT COALESCE(SUM(ri.quantity),0) AS total FROM supplier_return_items ri
      JOIN supplier_returns r ON r.id=ri.supplier_return_id
      WHERE r.status<>'CANCELLED' AND (? IS NULL OR r.id<>?) AND
        ((ri.source_table=? AND ri.source_item_id=?) OR (ri.source_item_id IS NULL AND ri.batch_id=?))`,
      )
      .get(excludeReturnId, excludeReturnId, source.source_table, source.id, source.batch_id).total;
  }

  findPurchaseById(id) {
    return this.db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
  }

  findPurchaseItem(purchaseId, itemId) {
    return this.db
      .prepare(
        `
      SELECT * FROM purchase_items
      WHERE purchase_id = ? AND item_id = ?
    `,
      )
      .get(purchaseId, itemId);
  }
}
