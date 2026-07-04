PRAGMA foreign_keys = OFF;

-- 1. Create Quotations Table
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_number TEXT NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 0,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  quotation_date TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  gst_total REAL NOT NULL DEFAULT 0 CHECK (gst_total >= 0),
  grand_total REAL NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  terms_conditions TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (quotation_number, revision_number)
);

-- 2. Create Quotation Items Table
CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  description TEXT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  gst_amount REAL NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0)
);

-- 3. Create Sales Orders Table
CREATE TABLE IF NOT EXISTS sales_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
  order_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED')),
  customer_reference TEXT,
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  gst_total REAL NOT NULL DEFAULT 0 CHECK (gst_total >= 0),
  grand_total REAL NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  terms_conditions TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Sales Order Items Table
CREATE TABLE IF NOT EXISTS sales_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
  description TEXT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  allocated_quantity REAL NOT NULL DEFAULT 0 CHECK (allocated_quantity >= 0),
  fulfilled_quantity REAL NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  gst_rate REAL NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  gst_amount REAL NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  CHECK (allocated_quantity <= quantity),
  CHECK (fulfilled_quantity <= quantity)
);

-- 5. Create Sales Shipments Table
CREATE TABLE IF NOT EXISTS sales_shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_number TEXT NOT NULL UNIQUE,
  sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  shipment_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SHIPPED' CHECK (status IN ('SHIPPED', 'CANCELLED')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create Sales Shipment Items Table
CREATE TABLE IF NOT EXISTS sales_shipment_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_shipment_id INTEGER NOT NULL REFERENCES sales_shipments(id) ON DELETE CASCADE,
  sales_order_item_id INTEGER NOT NULL REFERENCES sales_order_items(id),
  item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  batch_id INTEGER NOT NULL REFERENCES inventory_batches(id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  cost_price REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0)
);

-- 7. Extend Direct Invoices with Link to Sales Orders & Shipments
ALTER TABLE direct_invoices ADD COLUMN sales_order_id INTEGER REFERENCES sales_orders(id) ON DELETE SET NULL;
ALTER TABLE direct_invoices ADD COLUMN sales_shipment_id INTEGER REFERENCES sales_shipments(id) ON DELETE SET NULL;
ALTER TABLE direct_invoice_items ADD COLUMN sales_order_item_id INTEGER REFERENCES sales_order_items(id) ON DELETE SET NULL;
ALTER TABLE direct_invoice_items ADD COLUMN sales_shipment_item_id INTEGER REFERENCES sales_shipment_items(id) ON DELETE SET NULL;

-- 8. Add Search Indexes
CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(quotation_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_number ON sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_shipments_order ON sales_shipments(sales_order_id);

-- 9. Seed RBAC Permissions
INSERT OR IGNORE INTO permissions (key, description) VALUES 
('sales_orders.read', 'View quotations and sales orders.'),
('sales_orders.write', 'Create and edit quotations and sales orders.'),
('sales_orders.confirm', 'Confirm sales orders and allocate stock reservations.'),
('sales_orders.fulfill', 'Fulfill sales orders and generate counter invoices.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE key IN ('sales_orders.read', 'sales_orders.write', 'sales_orders.confirm', 'sales_orders.fulfill');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE key IN ('sales_orders.read', 'sales_orders.write', 'sales_orders.confirm', 'sales_orders.fulfill');

PRAGMA foreign_keys = ON;
