-- Migration: 025_financial_years_and_period_locks
-- Description: Creates financial_years and locked_periods tables to support active year lookup and period lock validations.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS financial_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL, -- YYYY-MM-DD
  end_date TEXT NOT NULL, -- YYYY-MM-DD
  is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0, 1)),
  is_closed INTEGER NOT NULL DEFAULT 0 CHECK(is_closed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Seed initial default Financial Year (FY 2026-27)
INSERT OR IGNORE INTO financial_years (id, company_id, name, start_date, end_date, is_active, is_closed) VALUES
(1, 1, 'FY 2026-27', '2026-04-01', '2027-03-31', 1, 0);

CREATE TABLE IF NOT EXISTS locked_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  start_date TEXT NOT NULL, -- YYYY-MM-DD
  end_date TEXT NOT NULL, -- YYYY-MM-DD
  is_locked INTEGER NOT NULL DEFAULT 1 CHECK(is_locked IN (0, 1)),
  locked_by INTEGER,
  locked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL
);

PRAGMA foreign_keys = ON;
