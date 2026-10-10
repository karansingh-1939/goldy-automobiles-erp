import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BackupService } from '../../src/server/database/backup-service.js';

test('startup backups include committed WAL data and never overwrite a previous snapshot', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-wal-backup-'));
  const dbFile = path.join(directory, 'data', 'workshop.sqlite');
  fs.mkdirSync(path.dirname(dbFile));
  const db = new Database(dbFile);
  let snapshot;
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('wal_autocheckpoint = 0');
    db.exec('CREATE TABLE records (id INTEGER PRIMARY KEY);');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.prepare('INSERT INTO records (id) VALUES (?)').run(42);
    const service = new BackupService(db);
    const first = service.createBackup({ label: 'DAILY' });
    const second = service.createBackup({ label: 'PRE_MIGRATION' });
    assert.notEqual(first, second);
    snapshot = new Database(first, { readonly: true });
    assert.deepEqual(snapshot.prepare('SELECT id FROM records').all(), [{ id: 42 }]);
    assert.equal(service.verifyBackup(first), true);
  } finally {
    snapshot?.close();
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
