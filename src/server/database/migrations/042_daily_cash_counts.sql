CREATE TABLE daily_cash_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  count_date TEXT NOT NULL,
  expected_cash REAL NOT NULL,
  counted_cash REAL NOT NULL CHECK(counted_cash >= 0),
  variance REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  counted_by INTEGER NOT NULL REFERENCES users(id),
  counted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_daily_cash_counts_date ON daily_cash_counts(company_id, count_date, id DESC);
