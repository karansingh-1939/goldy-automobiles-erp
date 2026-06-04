PRAGMA foreign_keys = OFF;

ALTER TABLE inventory_items ADD COLUMN barcode TEXT;
ALTER TABLE inventory_items ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE inventory_items ADD COLUMN hsn_code TEXT;
ALTER TABLE inventory_items ADD COLUMN reorder_level REAL NOT NULL DEFAULT 0 CHECK (reorder_level >= 0);
ALTER TABLE inventory_items ADD COLUMN unit_of_measure TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE inventory_items ADD COLUMN average_cost REAL NOT NULL DEFAULT 0 CHECK (average_cost >= 0);

UPDATE inventory_items
SET reorder_level = minimum_stock,
    unit_of_measure = unit,
    average_cost = purchase_cost,
    hsn_code = hsn_sac_code
WHERE reorder_level = 0
  AND unit_of_measure = 'pcs'
  AND average_cost = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_items_supplier_id ON inventory_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_reorder ON inventory_items(reorder_level);

ALTER TABLE inventory_batches ADD COLUMN manufacture_date TEXT;
ALTER TABLE inventory_batches ADD COLUMN expiry_date TEXT;

UPDATE inventory_batches
SET expiry_date = expiry_at
WHERE expiry_date IS NULL
  AND expiry_at IS NOT NULL;

ALTER TABLE inventory_transactions RENAME TO inventory_transactions_legacy;

CREATE TABLE inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  batch_id INTEGER,
  warehouse_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'Purchase',
    'Consumption',
    'Transfer',
    'Adjustment',
    'Return',
    'Opening Stock'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  reference_type TEXT,
  reference_id INTEGER,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  average_cost_after REAL NOT NULL DEFAULT 0 CHECK (average_cost_after >= 0),
  quantity_after REAL NOT NULL DEFAULT 0 CHECK (quantity_after >= 0),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO inventory_transactions (
  id,
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
  created_by,
  created_at
)
SELECT
  inventory_transactions_legacy.id,
  inventory_transactions_legacy.item_id,
  inventory_transactions_legacy.batch_id,
  inventory_transactions_legacy.warehouse_id,
  CASE
    WHEN transaction_type = 'PURCHASE_IN' THEN 'Purchase'
    WHEN transaction_type IN ('SALE_OUT', 'JOB_CARD_CONSUME') THEN 'Consumption'
    WHEN transaction_type IN ('TRANSFER_IN', 'TRANSFER_OUT') THEN 'Transfer'
    WHEN transaction_type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') THEN 'Adjustment'
    WHEN transaction_type = 'RETURN_IN' THEN 'Return'
    ELSE 'Adjustment'
  END,
  CASE
    WHEN transaction_type IN ('PURCHASE_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN_IN') THEN 'IN'
    ELSE 'OUT'
  END,
  inventory_transactions_legacy.reference_table,
  inventory_transactions_legacy.reference_id,
  ABS(inventory_transactions_legacy.quantity),
  inventory_transactions_legacy.unit_cost,
  inventory_items.purchase_cost,
  COALESCE(inventory_transactions_legacy.balance_after, inventory_items.current_quantity),
  inventory_transactions_legacy.notes,
  inventory_transactions_legacy.created_by,
  inventory_transactions_legacy.created_at
FROM inventory_transactions_legacy
JOIN inventory_items ON inventory_items.id = inventory_transactions_legacy.item_id;

DROP TABLE inventory_transactions_legacy;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_date ON inventory_transactions(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference ON inventory_transactions(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_number TEXT NOT NULL UNIQUE,
  item_id INTEGER NOT NULL,
  batch_id INTEGER,
  warehouse_id INTEGER NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('IN', 'OUT', 'OPENING')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reason TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_number TEXT NOT NULL UNIQUE,
  item_id INTEGER NOT NULL,
  batch_id INTEGER,
  from_warehouse_id INTEGER NOT NULL,
  to_warehouse_id INTEGER NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL,
  order_date TEXT NOT NULL,
  expected_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  gst_total REAL NOT NULL DEFAULT 0 CHECK (gst_total >= 0),
  grand_total REAL NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT NOT NULL UNIQUE,
  purchase_order_id INTEGER,
  supplier_id INTEGER NOT NULL,
  receipt_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  gst_total REAL NOT NULL DEFAULT 0 CHECK (gst_total >= 0),
  grand_total REAL NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

ALTER TABLE purchases ADD COLUMN purchase_receipt_id INTEGER REFERENCES purchase_receipts(id);
ALTER TABLE purchases ADD COLUMN invoice_date TEXT;
ALTER TABLE purchases ADD COLUMN outstanding_amount REAL NOT NULL DEFAULT 0 CHECK (outstanding_amount >= 0);

ALTER TABLE purchase_items RENAME TO purchase_items_legacy;

CREATE TABLE purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER,
  purchase_order_id INTEGER,
  purchase_receipt_id INTEGER,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  batch_id INTEGER,
  batch_number TEXT,
  manufacture_date TEXT,
  expiry_date TEXT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  purchase_cost REAL NOT NULL CHECK (purchase_cost >= 0),
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  gst_amount REAL NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_receipt_id) REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);

INSERT INTO purchase_items (
  id,
  purchase_id,
  item_id,
  warehouse_id,
  batch_number,
  quantity,
  purchase_cost,
  selling_price,
  gst_rate,
  gst_amount,
  line_total
)
SELECT
  id,
  purchase_id,
  item_id,
  warehouse_id,
  batch_number,
  quantity,
  purchase_cost,
  selling_price,
  gst_rate,
  gst_amount,
  line_total
FROM purchase_items_legacy;

DROP TABLE purchase_items_legacy;

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_order_id ON purchase_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_receipt_id ON purchase_items(purchase_receipt_id);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number TEXT NOT NULL UNIQUE,
  purchase_id INTEGER,
  supplier_id INTEGER NOT NULL,
  return_date TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  gst_total REAL NOT NULL DEFAULT 0 CHECK (gst_total >= 0),
  grand_total REAL NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_return_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  batch_id INTEGER,
  warehouse_id INTEGER NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  gst_amount REAL NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

CREATE TABLE IF NOT EXISTS supplier_ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('Purchase', 'Payment', 'Return')),
  reference_type TEXT,
  reference_id INTEGER,
  debit REAL NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit REAL NOT NULL DEFAULT 0 CHECK (credit >= 0),
  balance_after REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledgers_supplier_date ON supplier_ledgers(supplier_id, entry_date);

PRAGMA foreign_keys = ON;
