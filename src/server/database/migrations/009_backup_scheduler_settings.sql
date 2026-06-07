-- Migration: 009_backup_scheduler_settings
-- Create settings table and seed automatic backup settings

PRAGMA foreign_keys = OFF;

-- 1. Create System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Alter backup_logs to support retention tracking
-- Add 'purged' column to track if physical file has been unlinked
ALTER TABLE backup_logs ADD COLUMN purged INTEGER NOT NULL DEFAULT 0 CHECK (purged IN (0, 1));

-- 3. Seed initial backup scheduler configurations
INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('backup.auto_enabled', 'true'),
  ('backup.schedule_type', 'DAILY'),
  ('backup.interval_hours', '24'),
  ('backup.preferred_time', '02:00'),
  ('backup.weekly_day', 'Sunday'),
  ('backup.retention_count', '7'),
  ('backup.missed_recovery', 'true');

PRAGMA foreign_keys = ON;
