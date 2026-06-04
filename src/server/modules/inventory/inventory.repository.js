export class InventoryRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  createItem(data) {
    const result = this.db.prepare(`
      INSERT INTO inventory_items (
        sku,
        barcode,
        item_name,
        category,
        category_id,
        supplier_id,
        hsn_code,
        hsn_sac_code,
        gst_rate,
        purchase_cost,
        average_cost,
        selling_price,
        minimum_stock,
        reorder_level,
        unit,
        unit_of_measure,
        is_active
      )
      VALUES (
        @sku,
        @barcode,
        @item_name,
        @category,
        @category_id,
        @supplier_id,
        @hsn_code,
        @hsn_code,
        @gst_rate,
        @purchase_cost,
        @purchase_cost,
        @selling_price,
        @reorder_level,
        @reorder_level,
        @unit_of_measure,
        @unit_of_measure,
        @is_active
      )
    `).run(data);

    return this.findItemById(result.lastInsertRowid);
  }

  updateItem(id, data) {
    const columns = Object.keys(data);
    const setClause = columns.map((column) => `${column} = @${column}`).join(', ');
    this.db.prepare(`
      UPDATE inventory_items
      SET ${setClause},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...data, id });

    return this.findItemById(id);
  }

  listItems({ search, pageSize, offset }) {
    const params = [];
    const where = search
      ? `WHERE inventory_items.sku LIKE ? COLLATE NOCASE
          OR inventory_items.barcode LIKE ? COLLATE NOCASE
          OR inventory_items.item_name LIKE ? COLLATE NOCASE`
      : '';

    if (search) {
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const data = this.db.prepare(`
      SELECT
        inventory_items.*,
        suppliers.name AS supplier_name,
        inventory_categories.name AS category_name
      FROM inventory_items
      LEFT JOIN suppliers ON suppliers.id = inventory_items.supplier_id
      LEFT JOIN inventory_categories ON inventory_categories.id = inventory_items.category_id
      ${where}
      ORDER BY inventory_items.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM inventory_items
      ${where}
    `).get(...params).count;

    return { data, total };
  }

  findItemById(id) {
    return this.db.prepare(`
      SELECT
        inventory_items.*,
        suppliers.name AS supplier_name,
        inventory_categories.name AS category_name
      FROM inventory_items
      LEFT JOIN suppliers ON suppliers.id = inventory_items.supplier_id
      LEFT JOIN inventory_categories ON inventory_categories.id = inventory_items.category_id
      WHERE inventory_items.id = ?
    `).get(id);
  }

  findSupplierById(id) {
    return this.db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  }

  findWarehouseById(id) {
    return this.db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
  }

  findCategoryById(id) {
    return this.db.prepare('SELECT * FROM inventory_categories WHERE id = ?').get(id);
  }

  findBatchById(id) {
    return this.db.prepare('SELECT * FROM inventory_batches WHERE id = ?').get(id);
  }

  findBatchByNumber({ itemId, warehouseId, batchNumber }) {
    return this.db.prepare(`
      SELECT *
      FROM inventory_batches
      WHERE item_id = ?
        AND warehouse_id = ?
        AND batch_number = ?
    `).get(itemId, warehouseId, batchNumber);
  }

  createBatch(data) {
    const result = this.db.prepare(`
      INSERT INTO inventory_batches (
        item_id,
        warehouse_id,
        supplier_id,
        batch_number,
        purchase_cost,
        selling_price,
        quantity,
        manufacture_date,
        expiry_date,
        expiry_at
      )
      VALUES (
        @item_id,
        @warehouse_id,
        @supplier_id,
        @batch_number,
        @purchase_cost,
        @selling_price,
        @quantity,
        @manufacture_date,
        @expiry_date,
        @expiry_date
      )
    `).run(data);

    return this.findBatchById(result.lastInsertRowid);
  }

  updateBatchQuantity(batchId, quantity) {
    this.db.prepare(`
      UPDATE inventory_batches
      SET quantity = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(quantity, batchId);

    return this.findBatchById(batchId);
  }

  updateItemStock({ itemId, quantity, averageCost }) {
    this.db.prepare(`
      UPDATE inventory_items
      SET current_quantity = ?,
          average_cost = ?,
          purchase_cost = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(quantity, averageCost, averageCost, itemId);

    return this.findItemById(itemId);
  }

  createInventoryTransaction(data) {
    const result = this.db.prepare(`
      INSERT INTO inventory_transactions (
        item_id,
        batch_id,
        warehouse_id,
        transaction_type,
        direction,
        reference_type,
        reference_id,
        quantity,
        unit_cost,
        average_cost_after,
        quantity_after,
        notes,
        created_by
      )
      VALUES (
        @item_id,
        @batch_id,
        @warehouse_id,
        @transaction_type,
        @direction,
        @reference_type,
        @reference_id,
        @quantity,
        @unit_cost,
        @average_cost_after,
        @quantity_after,
        @notes,
        @created_by
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  createStockAdjustment(data) {
    const result = this.db.prepare(`
      INSERT INTO stock_adjustments (
        adjustment_number,
        item_id,
        batch_id,
        warehouse_id,
        adjustment_type,
        quantity,
        unit_cost,
        reason,
        created_by
      )
      VALUES (
        @adjustment_number,
        @item_id,
        @batch_id,
        @warehouse_id,
        @adjustment_type,
        @quantity,
        @unit_cost,
        @reason,
        @created_by
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  createStockTransfer(data) {
    const result = this.db.prepare(`
      INSERT INTO stock_transfers (
        transfer_number,
        item_id,
        batch_id,
        from_warehouse_id,
        to_warehouse_id,
        quantity,
        unit_cost,
        notes,
        created_by
      )
      VALUES (
        @transfer_number,
        @item_id,
        @batch_id,
        @from_warehouse_id,
        @to_warehouse_id,
        @quantity,
        @unit_cost,
        @notes,
        @created_by
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  stockSummary() {
    return this.db.prepare(`
      SELECT
        inventory_items.id,
        inventory_items.sku,
        inventory_items.item_name,
        inventory_items.current_quantity,
        inventory_items.reorder_level,
        inventory_items.average_cost,
        inventory_items.selling_price,
        inventory_items.unit_of_measure,
        COALESCE(SUM(inventory_batches.quantity), 0) AS batch_quantity
      FROM inventory_items
      LEFT JOIN inventory_batches ON inventory_batches.item_id = inventory_items.id
      GROUP BY inventory_items.id
      ORDER BY inventory_items.item_name
    `).all();
  }

  stockValuation() {
    return this.db.prepare(`
      SELECT
        id,
        sku,
        item_name,
        current_quantity,
        average_cost,
        ROUND(current_quantity * average_cost, 2) AS stock_value
      FROM inventory_items
      WHERE is_active = 1
      ORDER BY item_name
    `).all();
  }

  inventoryMovements({ itemId } = {}) {
    const where = itemId ? 'WHERE inventory_transactions.item_id = ?' : '';
    const params = itemId ? [itemId] : [];

    return this.db.prepare(`
      SELECT
        inventory_transactions.*,
        inventory_items.sku,
        inventory_items.item_name,
        warehouses.name AS warehouse_name
      FROM inventory_transactions
      JOIN inventory_items ON inventory_items.id = inventory_transactions.item_id
      JOIN warehouses ON warehouses.id = inventory_transactions.warehouse_id
      ${where}
      ORDER BY inventory_transactions.id DESC
    `).all(...params);
  }

  lowStock() {
    return this.db.prepare(`
      SELECT id, sku, item_name, current_quantity, reorder_level, unit_of_measure
      FROM inventory_items
      WHERE is_active = 1
        AND current_quantity <= reorder_level
      ORDER BY item_name
    `).all();
  }

  expiringStock({ asOf, days }) {
    return this.db.prepare(`
      SELECT
        inventory_batches.*,
        inventory_items.sku,
        inventory_items.item_name,
        warehouses.name AS warehouse_name
      FROM inventory_batches
      JOIN inventory_items ON inventory_items.id = inventory_batches.item_id
      JOIN warehouses ON warehouses.id = inventory_batches.warehouse_id
      WHERE inventory_batches.quantity > 0
        AND inventory_batches.expiry_date IS NOT NULL
        AND DATE(inventory_batches.expiry_date) <= DATE(?, '+' || ? || ' days')
      ORDER BY inventory_batches.expiry_date
    `).all(asOf, days);
  }
}
