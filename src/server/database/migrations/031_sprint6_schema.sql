-- Migration: 031_sprint6_schema
-- Description: Extends warehouses, stock verifications, and stock adjustments, adds user_warehouses, inventory_reservations, and recreates stock_transfers for full lifecycle tracking.

PRAGMA foreign_keys = OFF;

-- 1. Extend warehouses table
ALTER TABLE warehouses ADD COLUMN parent_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE warehouses ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1));

-- 2. Create user_warehouses mapping table
CREATE TABLE IF NOT EXISTS user_warehouses (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, warehouse_id)
);

-- 3. Create inventory_reservations table
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES inventory_batches(id) ON DELETE SET NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  reference_table TEXT NOT NULL,
  reference_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONSUMED', 'RELEASED', 'CANCELLED')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Extend stock_adjustments table
ALTER TABLE stock_adjustments ADD COLUMN category TEXT CHECK (category IN ('DAMAGED', 'LOST', 'EXPIRED', 'OPENING_CORRECTION', 'NORMAL')) DEFAULT 'NORMAL';
ALTER TABLE stock_adjustments ADD COLUMN voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL;

-- 5. Extend stock_verifications table
ALTER TABLE stock_verifications ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE stock_verifications ADD COLUMN approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stock_verifications ADD COLUMN approved_at TEXT;

-- 6. Recreate stock_transfers to support extended status and partial transfers
CREATE TABLE stock_transfers_temp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_number TEXT NOT NULL UNIQUE,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  batch_id INTEGER REFERENCES inventory_batches(id),
  from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  shipped_quantity REAL,
  received_quantity REAL,
  unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED', 'POSTED')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at TEXT,
  CHECK (from_warehouse_id <> to_warehouse_id)
);

-- Copy existing data from stock_transfers if any exists
INSERT OR IGNORE INTO stock_transfers_temp (
  id, transfer_number, item_id, batch_id, from_warehouse_id, to_warehouse_id,
  quantity, shipped_quantity, received_quantity, unit_cost, status, notes, created_by, created_at
)
SELECT
  id, transfer_number, item_id, batch_id, from_warehouse_id, to_warehouse_id,
  quantity, quantity, quantity, unit_cost, status, notes, created_by, created_at
FROM stock_transfers;

DROP TABLE stock_transfers;
ALTER TABLE stock_transfers_temp RENAME TO stock_transfers;

-- 7. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_item ON inventory_reservations(item_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_ref ON inventory_reservations(reference_table, reference_id);
CREATE INDEX IF NOT EXISTS idx_user_warehouses_user ON user_warehouses(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status);

-- 8. Seed Default Stock Adjustments System Ledger
INSERT OR IGNORE INTO ledgers (id, company_id, name, group_id, opening_balance, nature, is_system, system_key)
VALUES (21, 1, 'Stock Adjustments Account', 13, 0, 'Debit', 1, 'stock_adjustments');

PRAGMA foreign_keys = ON;
