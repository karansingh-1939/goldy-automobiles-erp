import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { createTestContext } from './helpers.js';
import { BackupService } from '../modules/backup/backup.service.js';
import { RestoreService } from '../modules/restore/restore.service.js';

test('database restore system - validations and missing file handling', async () => {
  const context = await createTestContext();

  try {
    const backupService = new BackupService(context.db);
    const restoreService = new RestoreService(context.db, backupService);

    // 1. Verify missing backup file path throws error
    await assert.rejects(
      async () => {
        await restoreService.restoreDatabase({ backupFilePath: null, userId: 1 });
      },
      (err) => err.code === 'RESTORE_FILE_REQUIRED'
    );

    // 2. Verify non-existent backup file throws RESTORE_FILE_NOT_FOUND
    await assert.rejects(
      async () => {
        await restoreService.restoreDatabase({ backupFilePath: 'C:\\non_existent_backup_file.db', userId: 1 });
      },
      (err) => err.code === 'RESTORE_FILE_NOT_FOUND'
    );

  } finally {
    await context.close();
  }
});

test('database restore system - corrupted backup file detection', async () => {
  const context = await createTestContext();

  try {
    const backupService = new BackupService(context.db);
    const restoreService = new RestoreService(context.db, backupService);

    const tempDir = fs.mkdtempSync(path.join(fs.realpathSync(path.dirname(context.db.name)), 'restore-corrupt-test-'));
    const badFilePath = path.join(tempDir, 'corrupt_backup.db');
    
    // Write invalid text contents (not a SQLite file)
    fs.writeFileSync(badFilePath, 'Invalid header SQLite format 3 is missing!');

    // Verify it rejects the corrupted backup before swapping
    await assert.rejects(
      async () => {
        await restoreService.restoreDatabase({ backupFilePath: badFilePath, userId: 1 });
      },
      (err) => err.code === 'RESTORE_FILE_CORRUPTED' && err.message.includes('corrupted or invalid')
    );

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  } finally {
    await context.close();
  }
});

test('database restore system - concurrent restore protection', async () => {
  const context = await createTestContext();

  try {
    const backupService = new BackupService(context.db);
    const restoreService = new RestoreService(context.db, backupService);

    const dbDir = path.dirname(context.db.name);
    const lockFilePath = path.join(dbDir, 'restore.lock');

    // Manually create restore.lock
    fs.writeFileSync(lockFilePath, 'RESTORE_RUNNING');

    // Trigger restore. It should reject immediately with RESTORE_IN_PROGRESS
    await assert.rejects(
      async () => {
        await restoreService.restoreDatabase({ backupFilePath: context.db.name, userId: 1 });
      },
      (err) => err.code === 'RESTORE_IN_PROGRESS'
    );

    // Clean lock file
    fs.unlinkSync(lockFilePath);
  } finally {
    await context.close();
  }
});

test('database restore system - successful restore and audit log creation', async () => {
  const context = await createTestContext();
  let restoreService = null;

  try {
    const backupService = new BackupService(context.db);
    restoreService = new RestoreService(context.db, backupService);

    const dbDir = path.dirname(context.db.name);
    const tempDir = fs.mkdtempSync(path.join(fs.realpathSync(dbDir), 'restore-success-test-'));
    const sourceDbPath = path.join(tempDir, 'restore_source.db');

    // 1. Create a distinct SQLite database to act as the restore source
    const sourceDb = new Database(sourceDbPath);
    sourceDb.exec('CREATE TABLE test_restore (id INTEGER PRIMARY KEY, value TEXT)');
    sourceDb.exec("INSERT INTO test_restore (value) VALUES ('restored_content_data')");
    sourceDb.exec(`
      CREATE TABLE IF NOT EXISTS restore_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_log_id INTEGER,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    sourceDb.close();

    // 2. Perform restoration
    const result = await restoreService.restoreDatabase({
      backupFilePath: sourceDbPath,
      userId: 1
    });

    assert.equal(result.success, true);

    // 3. Verify database content
    const activeDb = restoreService.db;
    const testRows = activeDb.prepare('SELECT * FROM test_restore').all();
    assert.equal(testRows.length, 1);
    assert.equal(testRows[0].value, 'restored_content_data');

    // 4. Verify audit log
    const logs = activeDb.prepare('SELECT * FROM restore_logs ORDER BY id DESC LIMIT 1').all();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, 'SUCCESS');
    assert.equal(logs[0].filename, 'restore_source.db');
    assert.equal(logs[0].created_by, 1);
    assert.equal(logs[0].error_message, null);

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  } finally {
    // Explicitly close connection handle if it was swapped to release file lock on Windows
    if (restoreService && restoreService.db) {
      try {
        restoreService.db.close();
      } catch (err) {}
    }
    await context.close();
  }
});

test('database restore system - failed verification & rollback execution', async () => {
  const context = await createTestContext();
  let restoreService = null;

  try {
    const backupService = new BackupService(context.db);
    restoreService = new RestoreService(context.db, backupService);

    // Insert a distinct record in the original database to verify it remains intact after rollback
    context.db.exec('CREATE TABLE original_check (id INTEGER PRIMARY KEY, val TEXT)');
    context.db.exec("INSERT INTO original_check (val) VALUES ('original_survives')");

    const dbDir = path.dirname(context.db.name);
    const tempDir = fs.mkdtempSync(path.join(fs.realpathSync(dbDir), 'restore-rollback-test-'));
    const badSourcePath = path.join(tempDir, 'restore_bad_source.db');

    // Create a valid source file, but we will stub Database.prototype.pragma to simulate a failed integrity check post-copy!
    const sourceDb = new Database(badSourcePath);
    sourceDb.exec(`
      CREATE TABLE IF NOT EXISTS restore_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_log_id INTEGER,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    sourceDb.close();

    // Monkey-patch Database.prototype.pragma directly (safe for ESM exports)
    const originalPragma = Database.prototype.pragma;
    Database.prototype.pragma = function (sql, ...args) {
      if (sql === 'integrity_check' && this.name && path.basename(this.name) === 'test.sqlite') {
        return [{ integrity_check: 'malformed page index' }];
      }
      return originalPragma.call(this, sql, ...args);
    };

    try {
      // Trigger restore. It should copy the badSource, fail validation, trigger rollback, and throw.
      await assert.rejects(
        async () => {
          await restoreService.restoreDatabase({
            backupFilePath: badSourcePath,
            userId: 1
          });
        },
        (err) => err.code === 'RESTORE_FAILED' && err.message.includes('integrity scan failed')
      );

      // Verify original database has been restored and contains original check record
      const reopenedDb = restoreService.db;
      const rows = reopenedDb.prepare('SELECT * FROM original_check').all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].val, 'original_survives');

      // Verify a FAILED audit log was written to restore_logs in the original database
      const logs = reopenedDb.prepare('SELECT * FROM restore_logs ORDER BY id DESC LIMIT 1').all();
      assert.equal(logs.length, 1);
      assert.equal(logs[0].status, 'FAILED');
      assert.equal(logs[0].filename, 'restore_bad_source.db');
      assert.equal(logs[0].created_by, 1);
      assert.ok(logs[0].error_message.includes('integrity scan failed'));

    } finally {
      // Restore original pragma method
      Database.prototype.pragma = originalPragma;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

  } finally {
    // Explicitly close connection handle if it was swapped to release file lock on Windows
    if (restoreService && restoreService.db) {
      try {
        restoreService.db.close();
      } catch (err) {}
    }
    await context.close();
  }
});
