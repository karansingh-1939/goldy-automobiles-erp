import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { BackupService } from '../../src/server/modules/backup/backup.service.js';

function healthDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE backup_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, filepath TEXT,
      type TEXT, file_size INTEGER, status TEXT, error_message TEXT, created_by INTEGER,
      created_at TEXT, updated_at TEXT, purged INTEGER DEFAULT 0);
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  return db;
}
const log = (db, status, createdAt, error = null) =>
  db
    .prepare(
      "INSERT INTO backup_logs (filename, filepath, type, status, error_message, created_at) VALUES ('b.db', 'b.db', 'AUTO', ?, ?, ?)",
    )
    .run(status, error, createdAt);
const setting = (db, key, value) =>
  db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(key, value);
const now = new Date('2026-11-11T10:00:00Z');

test('backup health warns when there is no backup, an old one, or a failed latest attempt', () => {
  const db = healthDb();
  try {
    const service = new BackupService(db);
    assert.deepEqual(service.getHealth(now).warnings, ['No backup has been made yet.']);

    log(db, 'SUCCESS', '2026-11-08 09:00:00');
    assert.match(service.getHealth(now).warnings[0], /3 days old/);

    log(db, 'SUCCESS', '2026-11-11 08:00:00');
    assert.equal(service.getHealth(now).ok, true);

    log(db, 'FAILED', '2026-11-11 09:00:00', 'Disk full');
    const failed = service.getHealth(now);
    assert.equal(failed.ok, false);
    assert.match(failed.warnings.join(' '), /last backup failed: Disk full/);
  } finally {
    db.close();
  }
});

test('backup health reports scheduler and USB copy problems in plain words', () => {
  const db = healthDb();
  try {
    const service = new BackupService(db);
    log(db, 'SUCCESS', '2026-11-11 08:00:00');
    setting(db, 'backup.external_directory', 'E:\\GoldyBackups');
    assert.match(service.getHealth(now).warnings[0], /USB\/external folder in the last 2 days/);

    setting(db, 'backup.external_last_error', 'Drive not found');
    assert.match(service.getHealth(now).warnings[0], /Drive not found.*connected/);

    setting(db, 'backup.external_last_error', '');
    setting(db, 'backup.external_last_success', '2026-11-11T07:00:00.000Z');
    setting(db, 'backup.last_auto_error', 'Locked');
    const health = service.getHealth(now);
    assert.deepEqual(health.warnings, ['Automatic backup problem: Locked.']);
    assert.equal(health.externalConfigured, true);
  } finally {
    db.close();
  }
});
