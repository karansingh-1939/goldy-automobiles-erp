-- Migration: 008_backup_restore
-- Create Backup and Restore tracking logs, and backup permissions

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS backup_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('AUTO', 'MANUAL', 'PRE_MIGRATION')),
  file_size INTEGER,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  error_message TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS restore_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_log_id INTEGER,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  error_message TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (backup_log_id) REFERENCES backup_logs(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status);
CREATE INDEX IF NOT EXISTS idx_restore_logs_status ON restore_logs(status);

-- Seed backup permissions
INSERT INTO permissions (key, description)
VALUES 
  ('backups.read', 'View database backups and logs.'),
  ('backups.write', 'Create manual database backups.')
ON CONFLICT(key) DO NOTHING;

-- Link permissions to Admin role
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Admin' AND p.key IN ('backups.read', 'backups.write');

PRAGMA foreign_keys = ON;
