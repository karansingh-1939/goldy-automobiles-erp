-- Disable foreign key constraints temporarily to allow table rebuilds
PRAGMA foreign_keys = OFF;

-- Alter vehicles table to add chassis_number
ALTER TABLE vehicles ADD COLUMN chassis_number TEXT;

-- Rebuild job_card_items with expanded check constraint
ALTER TABLE job_card_items RENAME TO job_card_items_legacy;

CREATE TABLE job_card_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('PART', 'SERVICE', 'LABOR', 'LUBRICANT', 'OUTSIDE_JOB')),
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

INSERT INTO job_card_items (
  id, job_card_id, item_type, inventory_item_id, batch_id, description,
  quantity, selling_price, purchase_cost_snapshot, gst_rate, gst_amount, line_total
)
SELECT
  id, job_card_id, item_type, inventory_item_id, batch_id, description,
  quantity, selling_price, purchase_cost_snapshot, gst_rate, gst_amount, line_total
FROM job_card_items_legacy;

DROP TABLE job_card_items_legacy;

-- Rebuild invoice_items with expanded check constraint
ALTER TABLE invoice_items RENAME TO invoice_items_legacy;

CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('PART', 'SERVICE', 'LABOR', 'LUBRICANT', 'OUTSIDE_JOB')),
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

INSERT INTO invoice_items (
  id, invoice_id, item_type, inventory_item_id, batch_id, description,
  quantity, unit_price, purchase_cost_snapshot, discount_amount, gst_rate,
  cgst_amount, sgst_amount, igst_amount, line_revenue, line_cost, line_profit, line_total
)
SELECT
  id, invoice_id, item_type, inventory_item_id, batch_id, description,
  quantity, unit_price, purchase_cost_snapshot, discount_amount, gst_rate,
  cgst_amount, sgst_amount, igst_amount, line_revenue, line_cost, line_profit, line_total
FROM invoice_items_legacy;

DROP TABLE invoice_items_legacy;

-- Recreate indexes for invoice_items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_job_part ON invoice_items(inventory_item_id, batch_id);

-- Create index for chassis_number to optimize queries
CREATE INDEX IF NOT EXISTS idx_vehicles_chassis ON vehicles(chassis_number);

-- Enable foreign keys constraint checks back
PRAGMA foreign_keys = ON;
