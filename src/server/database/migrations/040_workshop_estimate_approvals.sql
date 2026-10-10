CREATE TABLE estimate_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id INTEGER NOT NULL REFERENCES job_cards(id),
  amount REAL NOT NULL CHECK(amount > 0),
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  contact_name TEXT,
  contact_method TEXT CHECK(contact_method IN ('PHONE', 'IN_PERSON', 'MESSAGE')),
  decision_notes TEXT,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT
);
CREATE INDEX idx_estimate_approvals_job ON estimate_approvals(job_card_id, id DESC);
