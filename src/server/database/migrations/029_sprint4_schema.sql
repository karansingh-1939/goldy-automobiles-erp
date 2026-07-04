-- Migration: 029_sprint4_schema.sql
-- Description: Schema and performance indexes for Sprint 4 Purchasing and Supplier Accounting.

PRAGMA foreign_keys = ON;

-- 1. Alter suppliers table to add accounting fields
ALTER TABLE suppliers ADD COLUMN opening_balance REAL NOT NULL DEFAULT 0;

-- 2. Purchase Bills (Invoices from Suppliers)
CREATE TABLE IF NOT EXISTS purchase_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_number TEXT NOT NULL, -- Supplier's invoice number reference
  company_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  bill_date TEXT NOT NULL, -- YYYY-MM-DD
  due_date TEXT, -- YYYY-MM-DD
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  gst_total REAL NOT NULL CHECK(gst_total >= 0),
  grand_total REAL NOT NULL CHECK(grand_total >= 0),
  amount_paid REAL NOT NULL DEFAULT 0 CHECK(amount_paid >= 0),
  status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
  voucher_id INTEGER, -- Link to Accounting Purchase Voucher
  narration TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(supplier_id, bill_number) -- Prevent duplicate invoice entry from the same vendor
);

-- 3. Purchase Bill Items (Stock and Cost Additions)
CREATE TABLE IF NOT EXISTS purchase_bill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_bill_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity > 0),
  purchase_cost REAL NOT NULL CHECK(purchase_cost >= 0),
  gst_rate REAL NOT NULL CHECK(gst_rate BETWEEN 0 AND 100),
  gst_amount REAL NOT NULL CHECK(gst_amount >= 0),
  line_total REAL NOT NULL CHECK(line_total >= 0),
  warehouse_id INTEGER NOT NULL,
  batch_id INTEGER, -- resolved batch reference after insertion
  FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

-- 4. Supplier Payments
CREATE TABLE IF NOT EXISTS supplier_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_number TEXT NOT NULL UNIQUE, -- PV-YYYY-000001 format
  company_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  unallocated_amount REAL NOT NULL CHECK(unallocated_amount >= 0),
  payment_mode TEXT NOT NULL CHECK(payment_mode IN ('CASH', 'BANK')),
  bank_ledger_id INTEGER, -- Nullable if CASH
  voucher_id INTEGER, -- Link to Payment Voucher
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CANCELLED')),
  narration TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 5. Supplier Payment Allocations
CREATE TABLE IF NOT EXISTS supplier_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_payment_id INTEGER NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type = 'purchase_bill'),
  document_id INTEGER NOT NULL,
  allocated_amount REAL NOT NULL CHECK(allocated_amount > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_payment_id) REFERENCES supplier_payments(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES purchase_bills(id)
);

-- 6. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_bills_supplier ON purchase_bills(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_date ON purchase_bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_supplier_allocations_payment ON supplier_allocations(supplier_payment_id);
CREATE INDEX IF NOT EXISTS idx_supplier_allocations_doc ON supplier_allocations(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_ledger ON suppliers(ledger_id);
