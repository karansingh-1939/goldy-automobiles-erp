import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { createDatabase } from '../database/connection.js';
import { CorruptionRecoveryService, RecoveryStatus } from '../database/corruptionRecoveryService.js';

test('database corruption recovery system verification', async (t) => {
  const testDir = path.resolve('./data/test_sandbox_recovery');

  // Clean setup before tests
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup locks
    }
  }

  await t.test('successful recovery from latest valid backup', () => {
    const subtestDir = path.join(testDir, 'subtest_1');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const backupsDir = path.join(subtestDir, 'backups');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });

    // 1. Create a database, insert some data, and close it
    const db = new Database(dbPath);
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    db.exec("INSERT INTO test (value) VALUES ('hello_backup')");
    db.close();

    // 2. Create two backup files in backups folder (one older, one newer)
    const oldBackupPath = path.join(backupsDir, 'goldy_erp_backup_old.db');
    const newBackupPath = path.join(backupsDir, 'goldy_erp_backup_new.db');

    // Create older backup
    fs.copyFileSync(dbPath, oldBackupPath);
    const now = Date.now();
    fs.utimesSync(oldBackupPath, new Date(now - 10000), new Date(now - 10000));

    // Create newer backup with slightly different data
    const dbNew = new Database(dbPath);
    dbNew.exec("INSERT INTO test (value) VALUES ('hello_latest')");
    dbNew.close();
    fs.copyFileSync(dbPath, newBackupPath);
    fs.utimesSync(newBackupPath, new Date(now), new Date(now));

    // 3. Now corrupt the active database
    const fd = fs.openSync(dbPath, 'r+');
    fs.writeSync(fd, Buffer.from('CRITICAL CORRUPTED AND BROKEN DB HEADER PAGE DATA OVERWRITTEN'));
    fs.closeSync(fd);

    // 4. Run createDatabase(dbPath). It should detect corruption, run recovery, and succeed!
    const activeDb = createDatabase(dbPath);

    // Verify it is a valid database connection
    const rows = activeDb.prepare('SELECT * FROM test').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].value, 'hello_backup');
    assert.equal(rows[1].value, 'hello_latest');
    activeDb.close();

    // 5. Verify the corrupted DB was renamed in the data folder
    const files = fs.readdirSync(path.join(subtestDir, 'data'));
    const corruptedFile = files.find(f => f.startsWith('goldy_erp_corrupted_') && f.endsWith('.db'));
    assert.ok(corruptedFile, 'Should have renamed the corrupted database file');
  });

  await t.test('recovery fails and blocks startup if backups directory is empty or missing', () => {
    const subtestDir = path.join(testDir, 'subtest_2');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    // Create active db and corrupt it
    const db = new Database(dbPath);
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    db.close();

    const fd = fs.openSync(dbPath, 'r+');
    fs.writeSync(fd, Buffer.from('CORRUPT HEADER'));
    fs.closeSync(fd);

    // Run createDatabase. It should fail and throw DATABASE_RECOVERY_FAILED
    assert.throws(() => {
      createDatabase(dbPath);
    }, (err) => {
      const result = err.diagnostics?.recoveryResult;
      return err.code === 'DATABASE_RECOVERY_FAILED' &&
             err.recoveryInstructions &&
             err.recoveryInstructions.includes('RECOVERY INSTRUCTIONS') &&
             result?.status === RecoveryStatus.NO_BACKUP;
    });

    // Verify corrupt file was renamed
    const files = fs.readdirSync(path.join(subtestDir, 'data'));
    const corruptedFile = files.find(f => f.startsWith('goldy_erp_corrupted_'));
    assert.ok(corruptedFile, 'Should have renamed the corrupted database file');
  });

  await t.test('skips invalid backups and fails recovery if no valid backup exists', () => {
    const subtestDir = path.join(testDir, 'subtest_3');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const backupsDir = path.join(subtestDir, 'backups');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });

    // Create active db and corrupt it
    const db = new Database(dbPath);
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    db.close();

    const fd = fs.openSync(dbPath, 'r+');
    fs.writeSync(fd, Buffer.from('CORRUPT HEADER'));
    fs.closeSync(fd);

    // Create an empty backup file
    fs.writeFileSync(path.join(backupsDir, 'goldy_erp_backup_empty.db'), '');

    // Create a backup file with invalid header
    fs.writeFileSync(path.join(backupsDir, 'goldy_erp_backup_bad_header.db'), 'Not a SQLite header signature');

    // Run createDatabase. It should fail
    assert.throws(() => {
      createDatabase(dbPath);
    }, (err) => {
      const result = err.diagnostics?.recoveryResult;
      return err.code === 'DATABASE_RECOVERY_FAILED' &&
             result?.status === RecoveryStatus.FAILED &&
             result?.errors.some(e => e.includes('Validation failed for backup'));
    });
  });

  await t.test('skips backup if it has valid header but fails PRAGMA integrity_check', () => {
    const subtestDir = path.join(testDir, 'subtest_4');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const backupsDir = path.join(subtestDir, 'backups');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });

    // Create active db and corrupt it
    const db = new Database(dbPath);
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    db.close();

    const fd = fs.openSync(dbPath, 'r+');
    fs.writeSync(fd, Buffer.from('CORRUPT HEADER'));
    fs.closeSync(fd);

    // Create a backup file that has valid SQLite header but is corrupt/malformed otherwise
    const badBackupContent = Buffer.concat([
      Buffer.from('SQLite format 3\0'),
      Buffer.alloc(1024 * 10, 0xff) // Non-zero garbage bytes
    ]);
    fs.writeFileSync(path.join(backupsDir, 'goldy_erp_backup_bad_integrity.db'), badBackupContent);

    // Run createDatabase. It should fail
    assert.throws(() => {
      createDatabase(dbPath);
    }, (err) => {
      const result = err.diagnostics?.recoveryResult;
      return err.code === 'DATABASE_RECOVERY_FAILED' &&
             result?.status === RecoveryStatus.FAILED &&
             result?.errors.some(e => e.includes('Integrity check failed') || e.includes('file is not a database') || e.includes('file is encrypted'));
    });
  });

  await t.test('renames corrupted database along with WAL and SHM files', () => {
    const subtestDir = path.join(testDir, 'subtest_5');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const backupsDir = path.join(subtestDir, 'backups');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });

    // 1. Create database and temporary WAL and SHM files
    fs.writeFileSync(dbPath, 'corrupted db content');
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    fs.writeFileSync(walPath, 'dummy WAL data');
    fs.writeFileSync(shmPath, 'dummy SHM data');

    // 2. Create a valid backup
    const backupPath = path.join(backupsDir, 'goldy_erp_backup.db');
    const backupDb = new Database(backupPath);
    backupDb.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    backupDb.close();

    // 3. Call CorruptionRecoveryService.recover directly to avoid SQLite deleting WAL/SHM on close
    const result = CorruptionRecoveryService.recover(dbPath, backupsDir);
    assert.equal(result.status, RecoveryStatus.SUCCESS);

    // 4. Verify WAL and SHM files of corrupt db were renamed
    const files = fs.readdirSync(path.join(subtestDir, 'data'));
    const corruptDb = files.find(f => f.startsWith('goldy_erp_corrupted_') && f.endsWith('.db'));
    const corruptWal = files.find(f => f.startsWith('goldy_erp_corrupted_') && f.endsWith('.db-wal'));
    const corruptShm = files.find(f => f.startsWith('goldy_erp_corrupted_') && f.endsWith('.db-shm'));

    assert.ok(corruptDb, 'Should have renamed the corrupted DB file');
    assert.ok(corruptWal, 'Should have renamed the corrupted WAL file');
    assert.ok(corruptShm, 'Should have renamed the corrupted SHM file');

    // 5. Verify the active db path was restored with backup content
    assert.ok(fs.existsSync(dbPath), 'Active database file should be restored');
    assert.ok(!fs.existsSync(walPath), 'Active WAL file should be removed/renamed');
    assert.ok(!fs.existsSync(shmPath), 'Active SHM file should be removed/renamed');
  });

  // Clean up directory after all subtests complete
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup locks
    }
  }
});
