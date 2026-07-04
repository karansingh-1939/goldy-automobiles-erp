-- Migration: 024_accounting_foundation
-- Description: Creates companies, groups, ledgers, vouchers, journal entries, and balance cache tables, and seeds the default Chart of Accounts.

PRAGMA foreign_keys = OFF;

-- 1. Create Companies Table
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  gstin TEXT,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Company
INSERT OR IGNORE INTO companies (id, name, address, phone) VALUES
(1, 'GOLDY AUTOMOBILE', 'Opp. Randhir Cinema, Kunjpura Road, KARNAL-132001', '0184-2206673, 94160-30673');

-- 2. Create Account Groups Table
CREATE TABLE IF NOT EXISTS account_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  parent_group_id INTEGER REFERENCES account_groups(id) ON DELETE SET NULL,
  nature TEXT NOT NULL CHECK(nature IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE (company_id, name)
);

-- Seed System Groups
INSERT OR IGNORE INTO account_groups (id, company_id, name, parent_group_id, nature) VALUES
(1, 1, 'Assets', NULL, 'Asset'),
(2, 1, 'Current Assets', 1, 'Asset'),
(3, 1, 'Fixed Assets', 1, 'Asset'),
(4, 1, 'Liabilities', NULL, 'Liability'),
(5, 1, 'Current Liabilities', 4, 'Liability'),
(6, 1, 'Non-Current Liabilities', 4, 'Liability'),
(7, 1, 'Equity', NULL, 'Equity'),
(8, 1, 'Revenue', NULL, 'Revenue'),
(9, 1, 'Direct Income', 8, 'Revenue'),
(10, 1, 'Indirect Income', 8, 'Revenue'),
(11, 1, 'Expenses', NULL, 'Expense'),
(12, 1, 'Direct Expenses', 11, 'Expense'),
(13, 1, 'Indirect Expenses', 11, 'Expense');

-- 3. Create Ledgers Table
CREATE TABLE IF NOT EXISTS ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  group_id INTEGER NOT NULL,
  opening_balance REAL NOT NULL DEFAULT 0,
  nature TEXT NOT NULL CHECK(nature IN ('Debit', 'Credit')),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0, 1)),
  linked_entity_type TEXT CHECK(linked_entity_type IN ('customer', 'supplier', 'technician', 'fixed_asset')),
  linked_entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES account_groups(id),
  UNIQUE (company_id, name)
);

-- Seed Default System Ledgers
INSERT OR IGNORE INTO ledgers (id, company_id, name, group_id, opening_balance, nature, is_system) VALUES
(1, 1, 'Cash in Hand', 2, 0, 'Debit', 1),
(2, 1, 'Bank Account (HDFC)', 2, 0, 'Debit', 1),
(3, 1, 'Inventory Stock', 2, 0, 'Debit', 1),
(4, 1, 'CGST Input Tax Credit', 2, 0, 'Debit', 1),
(5, 1, 'SGST Input Tax Credit', 2, 0, 'Debit', 1),
(6, 1, 'IGST Input Tax Credit', 2, 0, 'Debit', 1),
(7, 1, 'CGST Output Liability', 5, 0, 'Credit', 1),
(8, 1, 'SGST Output Liability', 5, 0, 'Credit', 1),
(9, 1, 'IGST Output Liability', 5, 0, 'Credit', 1),
(10, 1, 'Parts Sales Revenue', 9, 0, 'Credit', 1),
(11, 1, 'Labour Service Revenue', 9, 0, 'Credit', 1),
(12, 1, 'Cost of Goods Sold', 12, 0, 'Debit', 1),
(13, 1, 'Rent Expense', 13, 0, 'Debit', 1),
(14, 1, 'Salary Expense', 13, 0, 'Debit', 1),
(15, 1, 'Electricity Expense', 13, 0, 'Debit', 1),
(16, 1, 'Internet Expense', 13, 0, 'Debit', 1),
(17, 1, 'Miscellaneous Expense', 13, 0, 'Debit', 1),
(18, 1, 'Capital Account', 7, 0, 'Credit', 1),
(19, 1, 'Retained Earnings', 7, 0, 'Credit', 1),
(20, 1, 'Round Off Account', 5, 0, 'Credit', 1);

-- 4. Create Vouchers Table
CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  voucher_number TEXT NOT NULL UNIQUE,
  voucher_type TEXT NOT NULL CHECK(voucher_type IN ('Sales', 'Purchase', 'Receipt', 'Payment', 'Contra', 'Journal', 'Debit Note', 'Credit Note')),
  voucher_date TEXT NOT NULL,
  reference_table TEXT,
  reference_id INTEGER,
  narration TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 5. Create Journal Entries Table
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NOT NULL,
  ledger_id INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('DEBIT', 'CREDIT')),
  amount REAL NOT NULL CHECK(amount > 0),
  narration TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id)
);

-- 6. Create Ledger Balances Table
CREATE TABLE IF NOT EXISTS ledger_balances (
  company_id INTEGER NOT NULL,
  ledger_id INTEGER NOT NULL,
  running_balance REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, ledger_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
);

-- Seed Ledger Balances cache
INSERT OR IGNORE INTO ledger_balances (company_id, ledger_id, running_balance) VALUES
(1, 1, 0),
(1, 2, 0),
(1, 3, 0),
(1, 4, 0),
(1, 5, 0),
(1, 6, 0),
(1, 7, 0),
(1, 8, 0),
(1, 9, 0),
(1, 10, 0),
(1, 11, 0),
(1, 12, 0),
(1, 13, 0),
(1, 14, 0),
(1, 15, 0),
(1, 16, 0),
(1, 17, 0),
(1, 18, 0),
(1, 19, 0),
(1, 20, 0);

-- 7. Alter existing tables to link with Accounting Engine
ALTER TABLE customers ADD COLUMN ledger_id INTEGER REFERENCES ledgers(id);
ALTER TABLE suppliers ADD COLUMN ledger_id INTEGER REFERENCES ledgers(id);
ALTER TABLE expenses ADD COLUMN voucher_id INTEGER REFERENCES vouchers(id);

-- 8. Create database search indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_groups_parent ON account_groups(parent_group_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_group ON ledgers(group_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_linked_entity ON ledgers(linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_type_date ON vouchers(voucher_type, voucher_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_voucher ON journal_entries(voucher_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_ledger ON journal_entries(ledger_id);

PRAGMA foreign_keys = ON;
