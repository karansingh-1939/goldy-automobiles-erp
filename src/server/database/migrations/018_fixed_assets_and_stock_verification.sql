-- Migration: Fixed Assets and Stock Verification
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fixed_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'Equipment',
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  invoice_number TEXT NOT NULL,
  purchase_date TEXT NOT NULL,
  purchase_cost REAL NOT NULL CHECK (purchase_cost >= 0),
  gst_amount REAL NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  serial_number TEXT,
  warranty_info TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verification_number TEXT NOT NULL UNIQUE,
  verification_type TEXT NOT NULL CHECK (verification_type IN ('Single Item', 'Batch', 'Warehouse', 'Full Inventory Audit')),
  audit_session_id TEXT, -- To group audits together
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  batch_id INTEGER REFERENCES inventory_batches(id),
  previous_quantity REAL NOT NULL,
  counted_quantity REAL NOT NULL,
  difference REAL NOT NULL,
  adjustment_id INTEGER REFERENCES stock_adjustments(id),
  verified_by INTEGER REFERENCES users(id),
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_supplier ON fixed_assets(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_verifications_item ON stock_verifications(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_verifications_warehouse ON stock_verifications(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_verifications_session ON stock_verifications(audit_session_id);
