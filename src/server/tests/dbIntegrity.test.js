import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { createDatabase } from '../database/connection.js';
import { IntegrityCheckService, HealthState } from '../database/integrityCheckService.js';

test('database integrity check system verification', async (t) => {
  const testDir = path.resolve('./data/test_sandbox_integrity');

  // Clean setup before tests
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  await t.test('verifies clean database returns healthy status', () => {
    const testDbFile = path.join(testDir, 'data', 'test_db_1.db');
    const db = createDatabase(testDbFile);

    const health = IntegrityCheckService.check(db);
    assert.equal(health.status, HealthState.HEALTHY);
    assert.equal(health.errors.length, 0);

    db.close();
  });

  await t.test('verifies corrupted database file returns failed status with error logs', () => {
    const testDbFile = path.join(testDir, 'data', 'test_db_2.db');
    
    // 1. Initialize database file
    const db = createDatabase(testDbFile);
    db.close();

    // 2. Corrupt the database file by writing random bytes directly into SQLite headers/pages
    const fd = fs.openSync(testDbFile, 'r+');
    fs.writeSync(fd, Buffer.from('CRITICAL CORRUPTED AND BROKEN DB HEADER PAGE DATA OVERWRITTEN'));
    fs.closeSync(fd);

    // 3. Open database bypass-opening checks to inspect raw file state
    const rawDb = new Database(testDbFile);

    // 4. Assert integrity scan detects anomalies
    const health = IntegrityCheckService.check(rawDb);
    assert.equal(health.status, HealthState.FAILED);
    assert.ok(health.errors.length > 0);

    rawDb.close();
  });

  await t.test('blocks startup and throws DATABASE_CORRUPTION error on integrity failure', () => {
    const testDbFile = path.join(testDir, 'data', 'test_db_3.db');
    
    // 1. Create a corrupted file directly
    const db = createDatabase(testDbFile);
    db.close();
    const fd = fs.openSync(testDbFile, 'r+');
    fs.writeSync(fd, Buffer.from('CRITICAL CORRUPTED AND BROKEN DB HEADER PAGE DATA OVERWRITTEN'));
    fs.closeSync(fd);

    // 2. Starting the app with corrupt DB must block and throw DATABASE_RECOVERY_FAILED
    assert.throws(() => {
      createDatabase(testDbFile);
    }, (err) => {
      const isRecoveryFailed = err.code === 'DATABASE_RECOVERY_FAILED';
      const health = err.diagnostics?.health || err.diagnostics;
      return isRecoveryFailed &&
             err.statusCode === 500 &&
             health?.status === HealthState.FAILED;
    });
  });

  await t.test('executes global corruption hook callback on startup validation crash', () => {
    const testDbFile = path.join(testDir, 'data', 'test_db_4.db');
    
    // 1. Create a corrupted file directly
    const db = createDatabase(testDbFile);
    db.close();
    const fd = fs.openSync(testDbFile, 'r+');
    fs.writeSync(fd, Buffer.from('CRITICAL CORRUPTED AND BROKEN DB HEADER PAGE DATA OVERWRITTEN'));
    fs.closeSync(fd);

    let hookCalled = false;
    let verifiedPath = null;
    let verifiedHealth = null;

    // Register hook
    global.onDatabaseCorruption = (filePath, health) => {
      hookCalled = true;
      verifiedPath = filePath;
      verifiedHealth = health;
    };

    try {
      assert.throws(() => {
        createDatabase(testDbFile);
      });

      assert.ok(hookCalled);
      assert.equal(verifiedPath, testDbFile);
      assert.equal(verifiedHealth.status, HealthState.FAILED);
    } finally {
      delete global.onDatabaseCorruption;
    }
  });

  // Clean up directory after all subtests complete
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup locks, directory is inside temp folder sandbox anyway
    }
  }
});
