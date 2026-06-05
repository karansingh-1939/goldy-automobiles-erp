-- Migration: 006_technician_management
-- Create Technician Master and Job Card Assignment tracking

PRAGMA foreign_keys = OFF;

-- 1. Create technicians table
CREATE TABLE IF NOT EXISTS technicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  technician_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  specialization TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create job_card_assignments table for history tracking
CREATE TABLE IF NOT EXISTS job_card_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id INTEGER NOT NULL,
  technician_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by INTEGER NOT NULL,
  notes TEXT,
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON DELETE CASCADE,
  FOREIGN KEY (technician_id) REFERENCES technicians(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);

-- 3. Alter job_cards to add technician_id
-- In SQLite, we can simply run ALTER TABLE ADD COLUMN
-- Note: SQLite does not support adding constraints directly to ADD COLUMN in older versions, but simple column addition with constraint is allowed in newer ones.
-- To ensure full compatibility, we add the column, then define foreign key references.
ALTER TABLE job_cards ADD COLUMN technician_id INTEGER REFERENCES technicians(id);

-- 4. Create Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_technicians_code ON technicians(technician_code);
CREATE INDEX IF NOT EXISTS idx_job_card_assignments_jc ON job_card_assignments(job_card_id);
CREATE INDEX IF NOT EXISTS idx_job_card_assignments_tech ON job_card_assignments(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_technician ON job_cards(technician_id);

PRAGMA foreign_keys = ON;
