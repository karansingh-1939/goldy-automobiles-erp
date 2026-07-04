-- Migration: 028_sprint3_schema
-- Description: Creates tables for direct_invoices, direct_invoice_items, customer_receipts, and receipt_allocations.

PRAGMA foreign_keys = OFF;

-- 1. Create Direct Invoices Table
CREATE TABLE IF NOT EXISTS direct_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  invoice_date TEXT NOT NULL,
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  gst_total REAL NOT NULL CHECK(gst_total >= 0),
  grand_total REAL NOT NULL CHECK(grand_total >= 0),
  amount_paid REAL NOT NULL DEFAULT 0 CHECK(amount_paid >= 0),
  status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
  voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  cogs_voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  narration TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 2. Create Direct Invoice Items Table
CREATE TABLE IF NOT EXISTS direct_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direct_invoice_id INTEGER NOT NULL REFERENCES direct_invoices(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES inventory_items(id),
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity > 0),
  unit_price REAL NOT NULL CHECK(unit_price >= 0),
  gst_rate REAL NOT NULL CHECK(gst_rate BETWEEN 0 AND 100),
  gst_amount REAL NOT NULL CHECK(gst_amount >= 0),
  line_total REAL NOT NULL CHECK(line_total >= 0),
  cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
  warehouse_id INTEGER REFERENCES warehouses(id),
  batch_id INTEGER REFERENCES inventory_batches(id)
);

-- 3. Create Customer Receipts Table
CREATE TABLE IF NOT EXISTS customer_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  receipt_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  payment_mode TEXT NOT NULL CHECK(payment_mode IN ('CASH', 'BANK')),
  bank_ledger_id INTEGER REFERENCES ledgers(id),
  unallocated_amount REAL NOT NULL CHECK(unallocated_amount >= 0),
  voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CANCELLED')),
  narration TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Receipt Allocations Table
CREATE TABLE IF NOT EXISTS receipt_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_receipt_id INTEGER NOT NULL REFERENCES customer_receipts(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK(document_type IN ('job_card_invoice', 'direct_invoice')),
  document_id INTEGER NOT NULL,
  allocated_amount REAL NOT NULL CHECK(allocated_amount > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_direct_invoices_customer ON direct_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_direct_invoices_status ON direct_invoices(status);
CREATE INDEX IF NOT EXISTS idx_direct_invoices_date ON direct_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer ON customer_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipt_allocations_receipt ON receipt_allocations(customer_receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_allocations_document ON receipt_allocations(document_type, document_id);

PRAGMA foreign_keys = ON;
