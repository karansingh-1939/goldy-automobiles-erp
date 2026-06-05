import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import { createDatabase } from '../database/connection.js';
import { DbSafetyService } from '../database/dbSafetyService.js';

test('database connection production safety pragma configuration validation', async (t) => {
  const testDir = path.resolve('./data/test_sandbox_safety');
  const testDbFile = path.join(testDir, 'data', 'test_db.db');

  // Clean setup
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  const db = createDatabase(testDbFile);

  await t.test('verifies WAL journal_mode is active', () => {
    const journalMode = db.pragma('journal_mode', { simple: true });
    assert.equal(journalMode, 'wal');
  });

  await t.test('verifies synchronous mode is NORMAL', () => {
    const synchronous = db.pragma('synchronous', { simple: true });
    assert.equal(Number(synchronous), 1); // 1 = NORMAL
  });

  await t.test('verifies busy_timeout is set to 10000ms', () => {
    const busyTimeout = db.pragma('busy_timeout', { simple: true });
    assert.equal(Number(busyTimeout), 10000);
  });

  await t.test('verifies foreign key constraints are enforced', () => {
    // 1. Create a dummy parent and child table in temp DB
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_parent (
        id INTEGER PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS test_child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER,
        FOREIGN KEY (parent_id) REFERENCES test_parent(id)
      );
    `);

    // 2. Attempt to insert orphan child record
    assert.throws(() => {
      db.prepare('INSERT INTO test_child (id, parent_id) VALUES (1, 999)').run();
    }, (err) => {
      return err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
    });
  });

  await t.test('fails database safety initialization if pragma configuration is invalid', () => {
    // Mock database with invalid pragma response (e.g. foreign_keys disabled)
    const mockDb = {
      pragma(name) {
        if (name === 'foreign_keys') return 0; // Invalid setting
        if (name === 'journal_mode') return 'wal';
        if (name === 'synchronous') return 1;
        if (name === 'busy_timeout') return 10000;
        return 0;
      }
    };

    assert.throws(() => {
      DbSafetyService.verifyConfiguration(mockDb);
    }, (err) => {
      return err.code === 'DATABASE_CONFIG_ERROR' && err.statusCode === 500;
    });
  });

  // Clean up connection & directory
  db.close();
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
