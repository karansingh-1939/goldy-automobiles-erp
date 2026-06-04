PRAGMA foreign_keys = OFF;

ALTER TABLE expenses RENAME TO expenses_legacy;

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN (
    'Rent',
    'Salary',
    'Electricity',
    'Internet',
    'Fuel',
    'Maintenance',
    'Miscellaneous'
  )),
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

INSERT INTO expenses (
  id,
  category,
  expense_date,
  amount,
  payment_mode,
  vendor_name,
  description,
  created_by,
  created_at,
  updated_at
)
SELECT
  id,
  category,
  expense_date,
  amount,
  payment_mode,
  vendor_name,
  description,
  created_by,
  created_at,
  updated_at
FROM expenses_legacy;

DROP TABLE expenses_legacy;

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

PRAGMA foreign_keys = ON;
