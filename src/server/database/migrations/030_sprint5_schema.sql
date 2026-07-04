-- Migration: 030_sprint5_schema.sql
-- Description: Schema alterations for Sprint 5 GST compliance and audit reversal-based cancellations.

PRAGMA foreign_keys = ON;

-- 1. Alter vouchers table to add audit status
ALTER TABLE vouchers ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CANCELLED'));

-- 2. Alter companies table to add state and GST profiles
ALTER TABLE companies ADD COLUMN state TEXT;
ALTER TABLE companies ADD COLUMN gstin_state_code TEXT;

-- Update seeded company details (Haryana place of supply)
UPDATE companies 
SET state = 'Haryana', 
    gstin = '06AAAAA1111A1Z1', 
    gstin_state_code = '06'
WHERE id = 1;

-- 3. Create GST Period Locks table
CREATE TABLE IF NOT EXISTS gst_period_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  tax_period TEXT NOT NULL, -- Format 'YYYY-MM'
  is_locked INTEGER NOT NULL DEFAULT 1 CHECK(is_locked IN (0, 1)),
  locked_by INTEGER,
  locked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(company_id, tax_period)
);

-- Indexing for fast lock lookups
CREATE INDEX IF NOT EXISTS idx_gst_period_locks_lookup ON gst_period_locks(company_id, tax_period, is_locked);

-- 4. Alter direct_invoices and purchase_bills to store exact CGST/SGST/IGST totals
ALTER TABLE direct_invoices ADD COLUMN cgst_total REAL NOT NULL DEFAULT 0 CHECK (cgst_total >= 0);
ALTER TABLE direct_invoices ADD COLUMN sgst_total REAL NOT NULL DEFAULT 0 CHECK (sgst_total >= 0);
ALTER TABLE direct_invoices ADD COLUMN igst_total REAL NOT NULL DEFAULT 0 CHECK (igst_total >= 0);

ALTER TABLE purchase_bills ADD COLUMN cgst_total REAL NOT NULL DEFAULT 0 CHECK (cgst_total >= 0);
ALTER TABLE purchase_bills ADD COLUMN sgst_total REAL NOT NULL DEFAULT 0 CHECK (sgst_total >= 0);
ALTER TABLE purchase_bills ADD COLUMN igst_total REAL NOT NULL DEFAULT 0 CHECK (igst_total >= 0);
