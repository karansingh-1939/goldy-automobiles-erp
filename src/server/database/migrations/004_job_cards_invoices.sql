PRAGMA foreign_keys = OFF;

ALTER TABLE profit_records RENAME TO profit_records_legacy;
ALTER TABLE invoice_items RENAME TO invoice_items_legacy;
ALTER TABLE invoices RENAME TO invoices_legacy;
ALTER TABLE job_card_items RENAME TO job_card_items_legacy;
ALTER TABLE job_cards RENAME TO job_cards_legacy;

CREATE TABLE job_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  vehicle_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
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

CREATE TABLE job_card_items (
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

CREATE TABLE invoices (
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

CREATE TABLE invoice_items (
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

CREATE TABLE profit_records (
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

INSERT INTO job_cards (
  id,
  job_card_number,
  customer_id,
  vehicle_id,
  status,
  complaint,
  diagnosis,
  odometer_reading,
  estimated_amount,
  opened_at,
  closed_at,
  assigned_to,
  created_by,
  created_at,
  updated_at
)
SELECT
  id,
  job_card_number,
  customer_id,
  vehicle_id,
  CASE
    WHEN status = 'OPEN' THEN 'DRAFT'
    WHEN status = 'READY' THEN 'COMPLETED'
    WHEN status = 'DELIVERED' THEN 'COMPLETED'
    WHEN status = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'IN_PROGRESS'
  END,
  complaint,
  diagnosis,
  odometer_reading,
  estimated_amount,
  opened_at,
  closed_at,
  assigned_to,
  created_by,
  created_at,
  updated_at
FROM job_cards_legacy;

INSERT INTO job_card_items (
  id,
  job_card_id,
  item_type,
  inventory_item_id,
  batch_id,
  description,
  quantity,
  selling_price,
  purchase_cost_snapshot,
  gst_rate,
  gst_amount,
  line_total
)
SELECT
  id,
  job_card_id,
  item_type,
  inventory_item_id,
  batch_id,
  description,
  quantity,
  selling_price,
  purchase_cost_snapshot,
  gst_rate,
  gst_amount,
  line_total
FROM job_card_items_legacy;

INSERT INTO invoices (
  id,
  invoice_number,
  job_card_id,
  customer_id,
  vehicle_id,
  invoice_date,
  subtotal,
  discount_total,
  taxable_amount,
  cgst_total,
  sgst_total,
  igst_total,
  gst_total,
  grand_total,
  amount_paid,
  status,
  payment_status,
  revenue,
  cost_total,
  gross_profit,
  net_profit,
  created_by,
  created_at,
  updated_at
)
SELECT
  id,
  invoice_number,
  job_card_id,
  customer_id,
  vehicle_id,
  invoice_date,
  subtotal,
  discount_total,
  taxable_amount,
  cgst_total,
  sgst_total,
  igst_total,
  gst_total,
  grand_total,
  amount_paid,
  status,
  payment_status,
  revenue,
  cost_total,
  gross_profit,
  net_profit,
  created_by,
  created_at,
  updated_at
FROM invoices_legacy;

INSERT INTO invoice_items (
  id,
  invoice_id,
  item_type,
  inventory_item_id,
  batch_id,
  description,
  quantity,
  unit_price,
  purchase_cost_snapshot,
  discount_amount,
  gst_rate,
  cgst_amount,
  sgst_amount,
  igst_amount,
  line_revenue,
  line_cost,
  line_profit,
  line_total
)
SELECT
  id,
  invoice_id,
  item_type,
  inventory_item_id,
  batch_id,
  description,
  quantity,
  unit_price,
  purchase_cost_snapshot,
  discount_amount,
  gst_rate,
  cgst_amount,
  sgst_amount,
  igst_amount,
  line_revenue,
  line_cost,
  line_profit,
  line_total
FROM invoice_items_legacy;

INSERT INTO profit_records (
  id,
  invoice_id,
  revenue,
  cost_total,
  gross_profit,
  expense_total,
  net_profit,
  recorded_at
)
SELECT
  id,
  invoice_id,
  revenue,
  cost_total,
  gross_profit,
  expense_total,
  net_profit,
  recorded_at
FROM profit_records_legacy;

DROP TABLE profit_records_legacy;
DROP TABLE invoice_items_legacy;
DROP TABLE invoices_legacy;
DROP TABLE job_card_items_legacy;
DROP TABLE job_cards_legacy;

CREATE INDEX IF NOT EXISTS idx_job_cards_status ON job_cards(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date ON invoices(customer_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_job_part ON invoice_items(inventory_item_id, batch_id);

CREATE TABLE IF NOT EXISTS job_card_labour (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  labour_charge REAL NOT NULL DEFAULT 0 CHECK (labour_charge >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_card_labour_job_card_id ON job_card_labour(job_card_id);

DROP VIEW IF EXISTS invoice_headers;

CREATE VIEW invoice_headers AS
SELECT
  id,
  invoice_number,
  job_card_id,
  customer_id,
  vehicle_id,
  invoice_date,
  subtotal,
  discount_total,
  taxable_amount,
  cgst_total,
  sgst_total,
  igst_total,
  gst_total,
  grand_total,
  amount_paid,
  status,
  payment_status,
  revenue,
  cost_total,
  gross_profit,
  net_profit,
  created_by,
  created_at,
  updated_at
FROM invoices;

PRAGMA foreign_keys = ON;
