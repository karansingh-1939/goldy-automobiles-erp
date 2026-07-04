PRAGMA foreign_keys = OFF;

-- 1. Alter inventory_items table
ALTER TABLE inventory_items ADD COLUMN warranty_period_months INTEGER NOT NULL DEFAULT 0;

-- 2. Create warranty_registrations table
CREATE TABLE IF NOT EXISTS warranty_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  vehicle_id INTEGER,
  invoice_id INTEGER,
  invoice_item_id INTEGER,
  item_id INTEGER NOT NULL,
  batch_number TEXT,
  serial_number TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CLAIMED', 'EXPIRED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

-- 3. Create warranty_claims table
CREATE TABLE IF NOT EXISTS warranty_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_number TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  warranty_registration_id INTEGER NOT NULL,
  claim_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'SETTLED')),
  notes TEXT,
  settlement_type TEXT CHECK(settlement_type IN ('REPLACEMENT', 'REFUND', 'REPAIR', NULL)),
  settlement_date TEXT,
  replacement_item_id INTEGER,
  replacement_batch_id INTEGER,
  replacement_qty REAL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (warranty_registration_id) REFERENCES warranty_registrations(id) ON DELETE CASCADE,
  FOREIGN KEY (replacement_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL,
  FOREIGN KEY (replacement_batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Create customer_returns table
CREATE TABLE IF NOT EXISTS customer_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL,
  return_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'APPROVED', 'COMPLETED', 'CANCELLED')),
  total_refund_amount REAL NOT NULL DEFAULT 0,
  credit_note_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  -- credit_note_id maps to vouchers(id)
  FOREIGN KEY (credit_note_id) REFERENCES vouchers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 5. Create customer_return_items table
CREATE TABLE IF NOT EXISTS customer_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_return_id INTEGER NOT NULL REFERENCES customer_returns(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  quantity REAL NOT NULL CHECK(quantity > 0),
  unit_price REAL NOT NULL CHECK(unit_price >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK(gst_rate >= 0),
  gst_amount REAL NOT NULL DEFAULT 0 CHECK(gst_amount >= 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK(line_total >= 0),
  condition TEXT NOT NULL DEFAULT 'GOOD' CHECK(condition IN ('GOOD', 'DAMAGED')),
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE CASCADE
);

-- 6. Create supplier_returns table
CREATE TABLE IF NOT EXISTS supplier_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  purchase_id INTEGER,
  return_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'APPROVED', 'COMPLETED', 'CANCELLED')),
  total_refund_amount REAL NOT NULL DEFAULT 0,
  debit_note_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL,
  -- debit_note_id maps to vouchers(id)
  FOREIGN KEY (debit_note_id) REFERENCES vouchers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. Create supplier_return_items table
CREATE TABLE IF NOT EXISTS supplier_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_return_id INTEGER NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  quantity REAL NOT NULL CHECK(quantity > 0),
  unit_cost REAL NOT NULL CHECK(unit_cost >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK(gst_rate >= 0),
  gst_amount REAL NOT NULL DEFAULT 0 CHECK(gst_amount >= 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK(line_total >= 0),
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE CASCADE
);

-- 8. Seed New System Ledgers
INSERT OR IGNORE INTO ledgers (company_id, name, group_id, opening_balance, nature, is_system, system_key) VALUES
(1, 'Warranty Expense', 13, 0, 'Debit', 1, 'warranty_expense'),
(1, 'Damaged Stock Loss', 13, 0, 'Debit', 1, 'damaged_stock_loss');

-- 9. Seed Sprint 9 Permissions
INSERT OR IGNORE INTO permissions (key, description) VALUES
('returns.read', 'View customer and supplier returns.'),
('returns.write', 'Create and edit customer and supplier returns.'),
('returns.approve', 'Approve and finalize returns and RMAs.'),
('warranty.read', 'View warranty registrations and claims.'),
('warranty.write', 'Register warranties and file claims.'),
('creditnote.write', 'Create and post Credit Notes.'),
('debitnote.write', 'Create and post Debit Notes.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE key IN ('returns.read', 'returns.write', 'returns.approve', 'warranty.read', 'warranty.write', 'creditnote.write', 'debitnote.write');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE key IN ('returns.read', 'returns.write', 'returns.approve', 'warranty.read', 'warranty.write', 'creditnote.write', 'debitnote.write');

PRAGMA foreign_keys = ON;
