-- Staff salary and advances for mechanics and other workshop staff.
ALTER TABLE technicians ADD COLUMN monthly_salary REAL NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0);

CREATE TABLE staff_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  technician_id INTEGER NOT NULL REFERENCES technicians(id),
  kind TEXT NOT NULL CHECK (kind IN ('ADVANCE', 'SALARY')),
  salary_month TEXT CHECK (salary_month IS NULL OR salary_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  gross_amount REAL NOT NULL CHECK (gross_amount > 0),
  advance_deducted REAL NOT NULL DEFAULT 0 CHECK (advance_deducted >= 0),
  net_paid REAL NOT NULL CHECK (net_paid >= 0),
  payment_ledger_id INTEGER REFERENCES ledgers(id),
  voucher_id INTEGER REFERENCES vouchers(id),
  payment_date TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (kind = 'SALARY' OR (salary_month IS NULL AND advance_deducted = 0)),
  CHECK (kind = 'ADVANCE' OR salary_month IS NOT NULL)
);

-- One salary payment per person per month.
CREATE UNIQUE INDEX idx_staff_salary_month ON staff_payments(technician_id, salary_month) WHERE kind = 'SALARY';
CREATE INDEX idx_staff_payments_technician ON staff_payments(technician_id);
