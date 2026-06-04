PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  password_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  alternate_phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  registration_number TEXT NOT NULL UNIQUE,
  make TEXT,
  model TEXT,
  variant TEXT,
  fuel_type TEXT,
  year INTEGER,
  vin TEXT,
  engine_number TEXT,
  odometer_reading INTEGER NOT NULL DEFAULT 0 CHECK (odometer_reading >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  address TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  category TEXT,
  hsn_sac_code TEXT,
  purchase_cost REAL NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0),
  selling_price REAL NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  current_quantity REAL NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  minimum_stock REAL NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  gst_rate REAL NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  supplier_id INTEGER,
  batch_number TEXT NOT NULL,
  purchase_cost REAL NOT NULL CHECK (purchase_cost >= 0),
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiry_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (item_id, warehouse_id, batch_number),
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  batch_id INTEGER,
  warehouse_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'PURCHASE_IN',
    'SALE_OUT',
    'JOB_CARD_CONSUME',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'RETURN_IN'
  )),
  reference_table TEXT,
  reference_id INTEGER,
  quantity REAL NOT NULL CHECK (quantity <> 0),
  unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  balance_after REAL,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL,
  supplier_invoice_number TEXT,
  purchase_date TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  gst_total REAL NOT NULL DEFAULT 0 CHECK (gst_total >= 0),
  discount_total REAL NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  grand_total REAL NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  amount_paid REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'CANCELLED')),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  batch_number TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  purchase_cost REAL NOT NULL CHECK (purchase_cost >= 0),
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  gst_amount REAL NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

CREATE TABLE IF NOT EXISTS job_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  vehicle_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED')),
  complaint TEXT,
  diagnosis TEXT,
  odometer_reading INTEGER NOT NULL DEFAULT 0 CHECK (odometer_reading >= 0),
  estimated_amount REAL NOT NULL DEFAULT 0 CHECK (estimated_amount >= 0),
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  assigned_to INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS job_card_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('PART', 'SERVICE', 'LABOR')),
  inventory_item_id INTEGER,
  batch_id INTEGER,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
  selling_price REAL NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  purchase_cost_snapshot REAL NOT NULL DEFAULT 0 CHECK (purchase_cost_snapshot >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  gst_amount REAL NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  job_card_id INTEGER,
  customer_id INTEGER NOT NULL,
  vehicle_id INTEGER,
  invoice_date TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total REAL NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  taxable_amount REAL NOT NULL DEFAULT 0 CHECK (taxable_amount >= 0),
  cgst_total REAL NOT NULL DEFAULT 0 CHECK (cgst_total >= 0),
  sgst_total REAL NOT NULL DEFAULT 0 CHECK (sgst_total >= 0),
  igst_total REAL NOT NULL DEFAULT 0 CHECK (igst_total >= 0),
  gst_total REAL NOT NULL DEFAULT 0 CHECK (gst_total >= 0),
  grand_total REAL NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  amount_paid REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'CANCELLED')),
  payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')),
  revenue REAL NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  cost_total REAL NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  gross_profit REAL NOT NULL DEFAULT 0,
  net_profit REAL NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('PART', 'SERVICE', 'LABOR')),
  inventory_item_id INTEGER,
  batch_id INTEGER,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  purchase_cost_snapshot REAL NOT NULL DEFAULT 0 CHECK (purchase_cost_snapshot >= 0),
  discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  cgst_amount REAL NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  sgst_amount REAL NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  igst_amount REAL NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),
  line_revenue REAL NOT NULL DEFAULT 0 CHECK (line_revenue >= 0),
  line_cost REAL NOT NULL DEFAULT 0 CHECK (line_cost >= 0),
  line_profit REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN ('Rent', 'Salary', 'Electricity', 'Internet', 'Miscellaneous')),
  expense_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  payment_mode TEXT,
  vendor_name TEXT,
  description TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS gst_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('PURCHASE', 'INVOICE', 'EXPENSE')),
  source_id INTEGER NOT NULL,
  gstin TEXT,
  record_date TEXT NOT NULL,
  taxable_amount REAL NOT NULL DEFAULT 0 CHECK (taxable_amount >= 0),
  cgst_amount REAL NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  sgst_amount REAL NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  igst_amount REAL NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),
  total_gst REAL NOT NULL DEFAULT 0 CHECK (total_gst >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profit_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL UNIQUE,
  revenue REAL NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  cost_total REAL NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  gross_profit REAL NOT NULL DEFAULT 0,
  expense_total REAL NOT NULL DEFAULT 0 CHECK (expense_total >= 0),
  net_profit REAL NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  old_value_json TEXT,
  new_value_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_vehicles_registration ON vehicles(registration_number);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_item_warehouse ON inventory_batches(item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_date ON inventory_transactions(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_date ON purchases(supplier_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_job_cards_status ON job_cards(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date ON invoices(customer_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_gst_records_date ON gst_records(record_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
