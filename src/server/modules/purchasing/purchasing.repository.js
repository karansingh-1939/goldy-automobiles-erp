export class PurchasingRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  findSupplierById(id) {
    return this.db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  }

  findItemById(id) {
    return this.db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  }

  findWarehouseById(id) {
    return this.db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
  }

  findPurchaseOrderById(id) {
    return this.db.prepare(`
      SELECT purchase_orders.*, suppliers.name AS supplier_name
      FROM purchase_orders
      JOIN suppliers ON suppliers.id = purchase_orders.supplier_id
      WHERE purchase_orders.id = ?
    `).get(id);
  }

  listPurchaseOrders({ search, pageSize, offset }) {
    const params = [];
    const where = search
      ? `WHERE purchase_orders.order_number LIKE ? COLLATE NOCASE
          OR suppliers.name LIKE ? COLLATE NOCASE`
      : '';

    if (search) {
      params.push(`%${search}%`, `%${search}%`);
    }

    const data = this.db.prepare(`
      SELECT purchase_orders.*, suppliers.name AS supplier_name
      FROM purchase_orders
      JOIN suppliers ON suppliers.id = purchase_orders.supplier_id
      ${where}
      ORDER BY purchase_orders.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM purchase_orders
      JOIN suppliers ON suppliers.id = purchase_orders.supplier_id
      ${where}
    `).get(...params).count;

    return { data, total };
  }

  createPurchaseOrder(data) {
    const result = this.db.prepare(`
      INSERT INTO purchase_orders (
        order_number,
        supplier_id,
        order_date,
        expected_date,
        status,
        notes,
        created_by
      )
      VALUES (
        @order_number,
        @supplier_id,
        @order_date,
        @expected_date,
        @status,
        @notes,
        @created_by
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  updatePurchaseOrderTotals(id, totals) {
    this.db.prepare(`
      UPDATE purchase_orders
      SET subtotal = @subtotal,
          gst_total = @gst_total,
          grand_total = @grand_total,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...totals, id });
  }

  updatePurchaseOrderStatus(id, status) {
    this.db.prepare(`
      UPDATE purchase_orders
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);
  }

  createPurchaseItem(data) {
    const result = this.db.prepare(`
      INSERT INTO purchase_items (
        purchase_id,
        purchase_order_id,
        purchase_receipt_id,
        item_id,
        warehouse_id,
        batch_id,
        batch_number,
        manufacture_date,
        expiry_date,
        quantity,
        purchase_cost,
        selling_price,
        gst_rate,
        gst_amount,
        line_total
      )
      VALUES (
        @purchase_id,
        @purchase_order_id,
        @purchase_receipt_id,
        @item_id,
        @warehouse_id,
        @batch_id,
        @batch_number,
        @manufacture_date,
        @expiry_date,
        @quantity,
        @purchase_cost,
        @selling_price,
        @gst_rate,
        @gst_amount,
        @line_total
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  listPurchaseItemsByOrderId(orderId) {
    return this.db.prepare(`
      SELECT purchase_items.*, inventory_items.sku, inventory_items.item_name, warehouses.name AS warehouse_name
      FROM purchase_items
      JOIN inventory_items ON inventory_items.id = purchase_items.item_id
      JOIN warehouses ON warehouses.id = purchase_items.warehouse_id
      WHERE purchase_items.purchase_order_id = ?
      ORDER BY purchase_items.id
    `).all(orderId);
  }

  findPurchaseReceiptById(id) {
    return this.db.prepare(`
      SELECT purchase_receipts.*, suppliers.name AS supplier_name
      FROM purchase_receipts
      JOIN suppliers ON suppliers.id = purchase_receipts.supplier_id
      WHERE purchase_receipts.id = ?
    `).get(id);
  }

  listPurchaseReceipts({ search, pageSize, offset }) {
    const params = [];
    const where = search
      ? `WHERE purchase_receipts.receipt_number LIKE ? COLLATE NOCASE
          OR suppliers.name LIKE ? COLLATE NOCASE`
      : '';

    if (search) {
      params.push(`%${search}%`, `%${search}%`);
    }

    const data = this.db.prepare(`
      SELECT purchase_receipts.*, suppliers.name AS supplier_name
      FROM purchase_receipts
      JOIN suppliers ON suppliers.id = purchase_receipts.supplier_id
      ${where}
      ORDER BY purchase_receipts.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM purchase_receipts
      JOIN suppliers ON suppliers.id = purchase_receipts.supplier_id
      ${where}
    `).get(...params).count;

    return { data, total };
  }

  createPurchaseReceipt(data) {
    const result = this.db.prepare(`
      INSERT INTO purchase_receipts (
        receipt_number,
        purchase_order_id,
        supplier_id,
        receipt_date,
        status,
        notes,
        created_by
      )
      VALUES (
        @receipt_number,
        @purchase_order_id,
        @supplier_id,
        @receipt_date,
        @status,
        @notes,
        @created_by
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  updatePurchaseReceiptTotals(id, totals) {
    this.db.prepare(`
      UPDATE purchase_receipts
      SET subtotal = @subtotal,
          gst_total = @gst_total,
          grand_total = @grand_total,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...totals, id });
  }

  listPurchaseItemsByReceiptId(receiptId) {
    return this.db.prepare(`
      SELECT purchase_items.*, inventory_items.sku, inventory_items.item_name, warehouses.name AS warehouse_name
      FROM purchase_items
      JOIN inventory_items ON inventory_items.id = purchase_items.item_id
      JOIN warehouses ON warehouses.id = purchase_items.warehouse_id
      WHERE purchase_items.purchase_receipt_id = ?
      ORDER BY purchase_items.id
    `).all(receiptId);
  }

  createPurchaseReturn(data) {
    const result = this.db.prepare(`
      INSERT INTO purchase_returns (
        return_number,
        purchase_id,
        supplier_id,
        return_date,
        notes,
        created_by
      )
      VALUES (
        @return_number,
        @purchase_id,
        @supplier_id,
        @return_date,
        @notes,
        @created_by
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  updatePurchaseReturnTotals(id, totals) {
    this.db.prepare(`
      UPDATE purchase_returns
      SET subtotal = @subtotal,
          gst_total = @gst_total,
          grand_total = @grand_total
      WHERE id = @id
    `).run({ ...totals, id });
  }

  createPurchaseReturnItem(data) {
    const result = this.db.prepare(`
      INSERT INTO purchase_return_items (
        purchase_return_id,
        item_id,
        batch_id,
        warehouse_id,
        quantity,
        unit_cost,
        gst_rate,
        gst_amount,
        line_total
      )
      VALUES (
        @purchase_return_id,
        @item_id,
        @batch_id,
        @warehouse_id,
        @quantity,
        @unit_cost,
        @gst_rate,
        @gst_amount,
        @line_total
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  findPurchaseReturnById(id) {
    return this.db.prepare(`
      SELECT purchase_returns.*, suppliers.name AS supplier_name
      FROM purchase_returns
      JOIN suppliers ON suppliers.id = purchase_returns.supplier_id
      WHERE purchase_returns.id = ?
    `).get(id);
  }

  listPurchaseReturnItems(returnId) {
    return this.db.prepare(`
      SELECT purchase_return_items.*, inventory_items.sku, inventory_items.item_name, warehouses.name AS warehouse_name
      FROM purchase_return_items
      JOIN inventory_items ON inventory_items.id = purchase_return_items.item_id
      JOIN warehouses ON warehouses.id = purchase_return_items.warehouse_id
      WHERE purchase_return_items.purchase_return_id = ?
      ORDER BY purchase_return_items.id
    `).all(returnId);
  }

  latestSupplierBalance(supplierId) {
    return this.db.prepare(`
      SELECT balance_after
      FROM supplier_ledgers
      WHERE supplier_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(supplierId)?.balance_after ?? 0;
  }

  createSupplierLedger(data) {
    const result = this.db.prepare(`
      INSERT INTO supplier_ledgers (
        supplier_id,
        entry_date,
        entry_type,
        reference_type,
        reference_id,
        debit,
        credit,
        balance_after,
        notes,
        created_by
      )
      VALUES (
        @supplier_id,
        @entry_date,
        @entry_type,
        @reference_type,
        @reference_id,
        @debit,
        @credit,
        @balance_after,
        @notes,
        @created_by
      )
    `).run(data);

    return result.lastInsertRowid;
  }
}
