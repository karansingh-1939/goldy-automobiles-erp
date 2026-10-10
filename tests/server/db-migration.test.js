import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { MigrationRunner } from '../../src/server/database/migration-runner.js';
import { MigrationRepository } from '../../src/server/database/migration-repository.js';

import { initializeDatabase } from '../../src/server/database/init.js';

test('database migration framework verification', async (t) => {
  const testDir = path.resolve('./data/test_sandbox_migrations');

  // Clean setup before tests
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore locks
    }
  }

  await t.test('first-time migration runs all scripts and records correct metadata', () => {
    const subtestDir = path.join(testDir, 'subtest_1');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const migrationsDir = path.join(subtestDir, 'migrations');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });

    // Write two migrations
    fs.writeFileSync(
      path.join(migrationsDir, '001_users.sql'),
      'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);',
    );
    fs.writeFileSync(
      path.join(migrationsDir, '002_posts.sql'),
      'CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);',
    );

    const db = new Database(dbPath);
    const runner = new MigrationRunner(db, null, migrationsDir, '1.2.3');
    const applied = runner.run();

    assert.deepEqual(applied, ['001_users.sql', '002_posts.sql']);

    // Verify metadata was recorded in schema_migrations
    const repository = new MigrationRepository(db);
    const records = repository.getAppliedMigrations();

    assert.equal(records.length, 2);

    assert.equal(records[0].filename, '001_users.sql');
    assert.equal(records[0].application_version, '1.2.3');
    assert.ok(records[0].checksum);
    assert.ok(typeof records[0].execution_time_ms === 'number');
    assert.ok(records[0].execution_time_ms >= 0);

    assert.equal(records[1].filename, '002_posts.sql');
    assert.equal(records[1].application_version, '1.2.3');

    // Verify tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')")
      .all();
    assert.equal(tables.length, 2);

    db.close();
  });

  await t.test('re-run is idempotent and applies nothing', () => {
    const subtestDir = path.join(testDir, 'subtest_2');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const migrationsDir = path.join(subtestDir, 'migrations');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });

    fs.writeFileSync(
      path.join(migrationsDir, '001_users.sql'),
      'CREATE TABLE users (id INTEGER PRIMARY KEY);',
    );

    const db = new Database(dbPath);
    const runner = new MigrationRunner(db, null, migrationsDir, '1.0.0');

    const appliedFirst = runner.run();
    assert.deepEqual(appliedFirst, ['001_users.sql']);

    const appliedSecond = runner.run();
    assert.deepEqual(appliedSecond, []); // Idempotent, nothing applied

    db.close();
  });

  await t.test('failed migration rolls back the transaction and stops future migrations', () => {
    const subtestDir = path.join(testDir, 'subtest_3');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const migrationsDir = path.join(subtestDir, 'migrations');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });

    // Write migration 1 (good)
    fs.writeFileSync(
      path.join(migrationsDir, '001_users.sql'),
      'CREATE TABLE users (id INTEGER PRIMARY KEY);',
    );
    // Write migration 2 (bad - invalid table creation syntax)
    fs.writeFileSync(
      path.join(migrationsDir, '002_bad.sql'),
      'CREATE TABLE posts (id INTEGER PRIMARY KEY); INSERT INTO non_existing_table VALUES (1);',
    );
    // Write migration 3 (good, but shouldn't execute)
    fs.writeFileSync(
      path.join(migrationsDir, '003_comments.sql'),
      'CREATE TABLE comments (id INTEGER PRIMARY KEY);',
    );

    const db = new Database(dbPath);
    const runner = new MigrationRunner(db, null, migrationsDir, '1.0.0');

    assert.throws(
      () => {
        runner.run();
      },
      (err) => {
        return err.code === 'MIGRATION_EXECUTION_FAILURE' && err.message.includes('002_bad.sql');
      },
    );

    // Assert that table 'users' exists (migration 1 succeeded)
    const usersTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .all();
    assert.equal(usersTable.length, 1);

    // Assert that table 'posts' does NOT exist (migration 2 was rolled back)
    const postsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'")
      .all();
    assert.equal(postsTable.length, 0);

    // Assert that table 'comments' does NOT exist (migration 3 was not executed)
    const commentsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'")
      .all();
    assert.equal(commentsTable.length, 0);

    // Assert only migration 1 is marked as applied
    const repository = new MigrationRepository(db);
    const records = repository.getAppliedMigrations();
    assert.equal(records.length, 1);
    assert.equal(records[0].filename, '001_users.sql');

    db.close();
  });

  await t.test('checksum mismatch blocks migration and startup', () => {
    const subtestDir = path.join(testDir, 'subtest_4');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const migrationsDir = path.join(subtestDir, 'migrations');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });

    // Write migration
    fs.writeFileSync(
      path.join(migrationsDir, '001_users.sql'),
      'CREATE TABLE users (id INTEGER PRIMARY KEY);',
    );

    const db = new Database(dbPath);
    const runner = new MigrationRunner(db, null, migrationsDir, '1.0.0');
    runner.run();

    // Now tamper with the migration script
    fs.writeFileSync(
      path.join(migrationsDir, '001_users.sql'),
      'CREATE TABLE users (id INTEGER PRIMARY KEY, modified INTEGER);',
    );

    assert.throws(
      () => {
        runner.run();
      },
      (err) => {
        return err.code === 'MIGRATION_CHECKSUM_MISMATCH' && err.message.includes('001_users.sql');
      },
    );

    db.close();
  });

  await t.test('missing applied migration file throws MIGRATION_MISSING_FILE', () => {
    const subtestDir = path.join(testDir, 'subtest_5');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const migrationsDir = path.join(subtestDir, 'migrations');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });

    // Write migrations
    fs.writeFileSync(
      path.join(migrationsDir, '001_users.sql'),
      'CREATE TABLE users (id INTEGER PRIMARY KEY);',
    );
    fs.writeFileSync(
      path.join(migrationsDir, '002_posts.sql'),
      'CREATE TABLE posts (id INTEGER PRIMARY KEY);',
    );

    const db = new Database(dbPath);
    const runner = new MigrationRunner(db, null, migrationsDir, '1.0.0');
    runner.run();

    // Remove one of the applied files from the filesystem
    fs.unlinkSync(path.join(migrationsDir, '001_users.sql'));

    assert.throws(
      () => {
        runner.run();
      },
      (err) => {
        return err.code === 'MIGRATION_MISSING_FILE' && err.message.includes('001_users.sql');
      },
    );

    db.close();
  });

  await t.test('duplicate migration filenames/sequence-prefixes throw validation errors', () => {
    const subtestDir = path.join(testDir, 'subtest_6');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const migrationsDir = path.join(subtestDir, 'migrations');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });

    // Write duplicate sequence prefix migrations
    fs.writeFileSync(
      path.join(migrationsDir, '001_users.sql'),
      'CREATE TABLE users (id INTEGER PRIMARY KEY);',
    );
    fs.writeFileSync(
      path.join(migrationsDir, '001_posts.sql'),
      'CREATE TABLE posts (id INTEGER PRIMARY KEY);',
    );

    const db = new Database(dbPath);
    const runner = new MigrationRunner(db, null, migrationsDir, '1.0.0');

    assert.throws(
      () => {
        runner.run();
      },
      (err) => {
        return err.code === 'MIGRATION_DUPLICATE_PREFIX' && err.message.includes('001');
      },
    );

    db.close();
  });

  await t.test('pre-migration backup hook is executed prior to running migrations', () => {
    const subtestDir = path.join(testDir, 'subtest_7');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp.db');
    const migrationsDir = path.join(subtestDir, 'migrations');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });

    fs.writeFileSync(
      path.join(migrationsDir, '001_users.sql'),
      'CREATE TABLE users (id INTEGER PRIMARY KEY);',
    );

    let backupCalled = false;
    let backupOptions = null;
    const mockBackupService = {
      createBackup(options) {
        backupCalled = true;
        backupOptions = options;
      },
    };

    const db = new Database(dbPath);
    const runner = new MigrationRunner(db, mockBackupService, migrationsDir, '1.0.0');
    runner.run();

    assert.ok(backupCalled);
    assert.deepEqual(backupOptions, { label: 'PRE_MIGRATION' });

    db.close();
  });

  await t.test('initializeDatabase blocks startup on migration failure', async () => {
    const subtestDir = path.join(testDir, 'subtest_8');
    const dbPath = path.join(subtestDir, 'data', 'goldy_erp_temp.db');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new Database(dbPath);

    // Create schema_migrations but corrupt or tamper it
    db.exec(`
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY,
        filename TEXT UNIQUE,
        checksum TEXT,
        applied_at TEXT,
        execution_time_ms INTEGER,
        application_version TEXT
      );
      INSERT INTO schema_migrations (filename, checksum, execution_time_ms, application_version)
      VALUES ('001_initial_schema.sql', 'INCORRECT_CHECKSUM', 10, '0.1.0');
    `);

    // Booting initializeDatabase on it should throw MIGRATION_CHECKSUM_MISMATCH and block startup
    await assert.rejects(
      async () => {
        await initializeDatabase(db);
      },
      (err) => {
        return err.code === 'MIGRATION_CHECKSUM_MISMATCH';
      },
    );

    db.close();
  });

  // Clean up sandbox directory
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore locks
    }
  }
});
