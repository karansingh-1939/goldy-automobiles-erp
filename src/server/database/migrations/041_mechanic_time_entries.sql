CREATE TABLE mechanic_time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id INTEGER NOT NULL REFERENCES job_cards(id),
  technician_id INTEGER NOT NULL REFERENCES technicians(id),
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  started_by INTEGER NOT NULL REFERENCES users(id),
  stopped_by INTEGER REFERENCES users(id),
  CHECK(stopped_at IS NULL OR stopped_at >= started_at)
);
CREATE UNIQUE INDEX idx_mechanic_one_running_timer ON mechanic_time_entries(technician_id) WHERE stopped_at IS NULL;
CREATE INDEX idx_mechanic_time_job ON mechanic_time_entries(job_card_id);
