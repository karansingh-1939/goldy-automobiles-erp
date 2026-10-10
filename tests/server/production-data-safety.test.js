import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createTestContext } from './helpers.js';
import { DemoController } from '../../src/server/modules/demo/demo.controller.js';
import { BackupController } from '../../src/server/modules/backup/backup.controller.js';
import { BackupService } from '../../src/server/modules/backup/backup.service.js';
import { BackupService as StartupBackupService } from '../../src/server/database/backup-service.js';
import { RestoreService } from '../../src/server/modules/restore/restore.service.js';
import {
  closeDatabase,
  createDatabase,
  getDatabase,
  demoDbFile,
  toggleDemoMode,
} from '../../src/server/database/connection.js';
import { runMigrations } from '../../src/server/database/migration-runner.js';
import { runSeeds } from '../../src/server/database/seed-runner.js';
import { seedDemoDatabase } from '../../src/server/database/demo-seeder.js';
import {
  CorruptionRecoveryService,
  RecoveryStatus,
} from '../../src/server/database/corruption-recovery-service.js';
import {
  IntegrityCheckService,
  HealthState,
} from '../../src/server/database/integrity-check-service.js';

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader() {},
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = JSON.parse(body);
      return this;
    },
  };
}

test('maintenance routes reject non-admin even when granted backup permission', async () => {
  const context = await createTestContext();
  try {
    const role = context.db.prepare("SELECT id FROM roles WHERE name = 'Mechanic'").get();
    const admin = context.db
      .prepare("SELECT password_hash FROM users WHERE username = 'admin'")
      .get();
    context.db
      .prepare('INSERT INTO users (name, username, password_hash, role_id) VALUES (?, ?, ?, ?)')
      .run('Mechanic', 'maintenance-mechanic', admin.password_hash, role.id);
    context.db
      .prepare(
        `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
      SELECT ?, id FROM permissions WHERE key = 'backups.write'`,
      )
      .run(role.id);
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'maintenance-mechanic', password: 'Admin@12345' }),
    });
    for (const [endpoint, method] of [
      ['demo/export', 'GET'],
      ['demo/import', 'POST'],
      ['demo/toggle', 'POST'],
      ['backups/manual', 'POST'],
      ['backups/purge-demo', 'POST'],
    ]) {
      const result = await context.request(`/api/v1/${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${login.body.token}` },
        ...(method === 'POST' ? { body: JSON.stringify({ enable: false, customers: [] }) } : {}),
      });
      assert.equal(result.response.status, 403, endpoint);
    }
  } finally {
    await context.close();
  }
});

test('JSON import and heuristic demo purge cannot alter production', async () => {
  const context = await createTestContext();
  try {
    const supplier = context.db
      .prepare("INSERT INTO suppliers (name) VALUES ('Real supplier')")
      .run();
    const settingsBefore = context.db.prepare('SELECT * FROM system_settings ORDER BY key').all();
    let error;
    const res = response();
    await new DemoController(context.db).importJsonData(
      { body: { system_settings: [] } },
      res,
      (err) => {
        error = err;
      },
    );
    assert.ok(error || res.statusCode >= 400);
    assert.deepEqual(
      context.db.prepare('SELECT * FROM system_settings ORDER BY key').all(),
      settingsBefore,
    );
    error = undefined;
    await new BackupController(new BackupService(context.db)).purgeDemoData(
      {},
      response(),
      (err) => {
        error = err;
      },
    );
    assert.ok(error);
    assert.equal(
      context.db.prepare('SELECT name FROM suppliers WHERE id = ?').get(supplier.lastInsertRowid)
        .name,
      'Real supplier',
    );
  } finally {
    await context.close();
  }
});

test('business JSON export excludes credentials and database control tables', async () => {
  const context = await createTestContext();
  try {
    context.db.exec('CREATE TABLE unexpected_secrets (password_hash TEXT)');
    const res = response();
    await new DemoController(context.db).exportJsonData({}, res, (err) => {
      throw err;
    });
    assert.ok(Array.isArray(res.body.customers));
    for (const table of [
      'users',
      'user_sessions',
      'roles',
      'permissions',
      'role_permissions',
      'system_settings',
      'schema_migrations',
      'backup_logs',
      'restore_logs',
      'audit_logs',
      'unexpected_secrets',
    ]) {
      assert.equal(res.body[table], undefined, table);
    }
  } finally {
    await context.close();
  }
});

test('startup backups and daily backup detection isolate database identities', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-backup-isolation-'));
  fs.mkdirSync(path.join(directory, 'data'));
  const production = new Database(path.join(directory, 'data', 'goldy.sqlite'));
  const demo = new Database(path.join(directory, 'data', 'goldy_demo.sqlite'));
  try {
    production.exec('CREATE TABLE records (id INTEGER); INSERT INTO records VALUES (1)');
    demo.exec('CREATE TABLE records (id INTEGER); INSERT INTO records VALUES (2)');
    const demoBackup = new StartupBackupService(demo).createBackup({ label: 'DAILY' });
    const service = new StartupBackupService(production);
    service.checkAndRunDailyBackup();
    const productionBackup = service.createBackup();
    assert.notEqual(path.dirname(productionBackup), path.dirname(demoBackup));
    assert.ok(fs.readdirSync(path.dirname(productionBackup)).length >= 2);
  } finally {
    production.close();
    demo.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('retention never deletes a file outside the managed backup directory', async () => {
  const context = await createTestContext();
  const service = new BackupService(context.db);
  const outside = path.join(path.dirname(context.db.name), 'do-not-delete.txt');
  try {
    fs.writeFileSync(outside, 'production data');
    service.updateSettings({ 'backup.retention_count': 1 });
    service.repository.createBackupLog({
      filename: 'do-not-delete.txt',
      filepath: outside,
      type: 'AUTO',
      status: 'SUCCESS',
    });
    await service.backupDatabase({ type: 'AUTO', userId: 1 });
    assert.equal(fs.readFileSync(outside, 'utf8'), 'production data');
  } finally {
    await context.close();
  }
});

test('restore includes committed source WAL rows and accepts a missing audit actor', async () => {
  const context = await createTestContext();
  const sourcePath = path.join(path.dirname(context.db.name), 'source-wal.sqlite');
  let source;
  const restore = new RestoreService(context.db, new BackupService(context.db));
  try {
    await context.db.backup(sourcePath);
    source = new Database(sourcePath);
    source.pragma('journal_mode = WAL');
    source.pragma('wal_autocheckpoint = 0');
    source.pragma('wal_checkpoint(TRUNCATE)');
    source.prepare("INSERT INTO customers (name) VALUES ('WAL customer')").run();
    const result = await restore.restoreDatabase({ backupFilePath: sourcePath, userId: 987654 });
    assert.equal(result.success, true);
    assert.equal(
      restore.db.prepare("SELECT name FROM customers WHERE name = 'WAL customer'").get().name,
      'WAL customer',
    );
    assert.equal(
      restore.db
        .prepare("SELECT created_by FROM restore_logs WHERE status = 'SUCCESS' ORDER BY id DESC")
        .get().created_by,
      null,
    );
  } finally {
    source?.close();
    closeDatabase();
    await context.close();
  }
});

test('restore rejects non-ERP SQLite before changing production', async () => {
  const context = await createTestContext();
  const sourcePath = path.join(path.dirname(context.db.name), 'unrelated.sqlite');
  try {
    context.db.prepare("INSERT INTO customers (name) VALUES ('Original customer')").run();
    const source = new Database(sourcePath);
    source.exec('CREATE TABLE unrelated (id INTEGER)');
    source.close();
    const restore = new RestoreService(context.db, new BackupService(context.db));
    await assert.rejects(
      restore.restoreDatabase({ backupFilePath: sourcePath, userId: 1 }),
      (err) => err.code === 'RESTORE_SCHEMA_INVALID',
    );
    assert.equal(
      context.db.prepare("SELECT name FROM customers WHERE name = 'Original customer'").get().name,
      'Original customer',
    );
  } finally {
    closeDatabase();
    await context.close();
  }
});

test('restore rejects a demo snapshot and an incomplete ERP schema without changing production', async () => {
  const context = await createTestContext();
  const sourcePath = path.join(path.dirname(context.db.name), 'demo.sqlite');
  try {
    await context.db.backup(sourcePath);
    let source = new Database(sourcePath);
    source
      .prepare("INSERT INTO system_settings (key, value) VALUES ('database.mode', 'demo')")
      .run();
    source.close();
    const restore = new RestoreService(context.db, new BackupService(context.db));
    await assert.rejects(
      restore.restoreDatabase({ backupFilePath: sourcePath }),
      (error) => error.code === 'RESTORE_MODE_MISMATCH',
    );
    source = new Database(sourcePath);
    source.exec(
      "DELETE FROM system_settings WHERE key = 'database.mode'; DROP TABLE customer_returns;",
    );
    source.close();
    await assert.rejects(
      restore.restoreDatabase({ backupFilePath: sourcePath }),
      (error) => error.code === 'RESTORE_SCHEMA_INVALID',
    );
    assert.equal(context.db.open, true);
  } finally {
    closeDatabase();
    await context.close();
  }
});

test('restore rolls back when the success audit write fails', async () => {
  const context = await createTestContext();
  const sourcePath = path.join(path.dirname(context.db.name), 'audit-failure.sqlite');
  const restore = new RestoreService(context.db, new BackupService(context.db));
  try {
    await context.db.backup(sourcePath);
    const source = new Database(sourcePath);
    source.exec(`CREATE TRIGGER fail_restore_audit BEFORE INSERT ON restore_logs
      WHEN NEW.status = 'SUCCESS' BEGIN SELECT RAISE(ABORT, 'audit failure'); END;`);
    source.close();
    context.db
      .prepare("INSERT INTO customers (name) VALUES ('Original survives audit failure')")
      .run();
    await assert.rejects(
      restore.restoreDatabase({ backupFilePath: sourcePath, userId: 1 }),
      (error) => error.code === 'RESTORE_FAILED',
    );
    assert.equal(
      restore.db
        .prepare("SELECT name FROM customers WHERE name = 'Original survives audit failure'")
        .get().name,
      'Original survives audit failure',
    );
    assert.equal(
      restore.db.prepare('SELECT status FROM restore_logs ORDER BY id DESC').get().status,
      'FAILED',
    );
  } finally {
    closeDatabase();
    await context.close();
  }
});

test('demo initialize, clear and reset preserve production and leave a valid demo database', async () => {
  assert.ok(process.env.DATABASE_PATH, 'Run with an isolated DATABASE_PATH');
  const production = getDatabase();
  runMigrations(production);
  await runSeeds(production);
  production
    .prepare("INSERT INTO customers (name) VALUES ('Production survives demo maintenance')")
    .run();
  const proxy = new Proxy(
    {},
    {
      get(target, key) {
        const active = getDatabase();
        const value = active[key];
        return typeof value === 'function' ? value.bind(active) : value;
      },
    },
  );
  const controller = new DemoController(proxy);
  const next = (error) => {
    throw error;
  };
  try {
    await assert.rejects(seedDemoDatabase(production), /marked demo database/);
    await controller.toggleMode({ body: { enable: true } }, response(), next);
    assert.equal(path.resolve(getDatabase().name), path.resolve(demoDbFile));
    assert.equal(getDatabase().pragma('foreign_key_check').length, 0);
    assert.ok(getDatabase().prepare('SELECT COUNT(*) AS count FROM customers').get().count > 0);
    const before = getDatabase().prepare('SELECT COUNT(*) AS count FROM invoice_items').get().count;
    const stock = getDatabase()
      .prepare('SELECT SUM(quantity) AS quantity FROM inventory_batches')
      .get().quantity;
    const vouchers = getDatabase().prepare('SELECT COUNT(*) AS count FROM vouchers').get().count;
    await controller.loadData({}, response(), next);
    await controller.loadData({}, response(), next);
    assert.equal(
      getDatabase().prepare('SELECT COUNT(*) AS count FROM invoice_items').get().count,
      before,
    );
    assert.equal(
      getDatabase().prepare('SELECT SUM(quantity) AS quantity FROM inventory_batches').get()
        .quantity,
      stock,
    );
    assert.equal(
      getDatabase().prepare('SELECT COUNT(*) AS count FROM vouchers').get().count,
      vouchers,
    );
    const demoIncome = getDatabase()
      .prepare(
        `SELECT SUM(CASE WHEN j.entry_type = 'CREDIT' THEN j.amount ELSE -j.amount END) AS total
      FROM journal_entries j JOIN ledgers l ON l.id = j.ledger_id WHERE l.system_key IN ('parts_sales', 'labour_sales')`,
      )
      .get().total;
    assert.equal(demoIncome, 3145);
    await controller.clearData({}, response(), next);
    assert.equal(getDatabase().prepare('SELECT COUNT(*) AS count FROM customers').get().count, 0);
    assert.equal(
      getDatabase().prepare("SELECT value FROM system_settings WHERE key = 'database.mode'").get()
        .value,
      'demo',
    );
    await controller.resetDb({}, response(), next);
    assert.ok(getDatabase().prepare('SELECT COUNT(*) AS count FROM customers').get().count > 0);
    toggleDemoMode(false);
    assert.equal(
      getDatabase()
        .prepare("SELECT name FROM customers WHERE name = 'Production survives demo maintenance'")
        .get().name,
      'Production survives demo maintenance',
    );
    const originalRename = fs.renameSync;
    try {
      fs.renameSync = (source, destination) => {
        if (String(destination).endsWith('app_config.json'))
          throw new Error('Simulated mode config failure');
        return originalRename(source, destination);
      };
      assert.throws(
        () => toggleDemoMode(true),
        (error) => error.code === 'CONFIG_WRITE_FAILED',
      );
      assert.equal(
        getDatabase()
          .prepare("SELECT name FROM customers WHERE name = 'Production survives demo maintenance'")
          .get().name,
        'Production survives demo maintenance',
      );
      assert.equal(getDatabase().name.endsWith('_demo.sqlite'), false);
    } finally {
      fs.renameSync = originalRename;
    }
  } finally {
    toggleDemoMode(false);
    closeDatabase();
  }
});

test('a failed integrity scan invokes the recovery hook once after closing the connection', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-recovery-hook-'));
  const file = path.join(directory, 'database.sqlite');
  let calls = 0;
  const originalCheck = IntegrityCheckService.check;
  const originalHook = global.onDatabaseCorruption;
  try {
    IntegrityCheckService.check = () => ({
      status: HealthState.FAILED,
      errors: ['Simulated integrity failure'],
    });
    global.onDatabaseCorruption = () => {
      calls += 1;
      return { status: RecoveryStatus.FAILED, errors: ['Recovery unavailable'] };
    };
    assert.throws(
      () => createDatabase(file),
      (error) => error.code === 'DATABASE_RECOVERY_FAILED',
    );
    assert.equal(calls, 1);
  } finally {
    IntegrityCheckService.check = originalCheck;
    if (originalHook === undefined) delete global.onDatabaseCorruption;
    else global.onDatabaseCorruption = originalHook;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('automatic recovery uses only the active identity and includes backup WAL frames', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-recovery-isolation-'));
  const active = path.join(directory, 'data', 'production.sqlite');
  fs.mkdirSync(path.dirname(active));
  const db = new Database(active);
  db.exec('CREATE TABLE records (id INTEGER); INSERT INTO records VALUES (1)');
  const service = new StartupBackupService(db);
  const backup = service.createBackup();
  db.close();
  const source = new Database(backup);
  try {
    source.pragma('journal_mode = WAL');
    source.pragma('wal_autocheckpoint = 0');
    source.pragma('wal_checkpoint(TRUNCATE)');
    source.exec('INSERT INTO records VALUES (2)');
    fs.writeFileSync(active, 'damaged database retained for forensic recovery');
    const shared = path.join(directory, 'backups', 'newest-demo.db');
    const demo = new Database(shared);
    demo.exec('CREATE TABLE records (id INTEGER); INSERT INTO records VALUES (99)');
    demo.close();
    const recovered = CorruptionRecoveryService.recover(active);
    assert.equal(recovered.status, RecoveryStatus.SUCCESS);
    const restored = new Database(active, { readonly: true });
    assert.deepEqual(restored.prepare('SELECT id FROM records ORDER BY id').all(), [
      { id: 1 },
      { id: 2 },
    ]);
    restored.close();
    assert.equal(
      fs.readFileSync(path.join(path.dirname(active), recovered.corruptedFilename), 'utf8'),
      'damaged database retained for forensic recovery',
    );
  } finally {
    source.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('startup refuses to create a blank database after an interrupted restore', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-interrupted-restore-'));
  const active = path.join(directory, 'workshop.sqlite');
  const rollback = `${active}.preserved.rollback`;
  let unexpected;
  try {
    fs.writeFileSync(path.join(directory, 'restore.lock'), 'interrupted restore');
    fs.writeFileSync(rollback, 'preserved original');
    assert.throws(
      () => {
        unexpected = createDatabase(active);
      },
      (error) => error.code === 'DATABASE_MAINTENANCE_PENDING',
    );
    assert.equal(fs.existsSync(active), false);
    assert.equal(fs.readFileSync(rollback, 'utf8'), 'preserved original');
  } finally {
    unexpected?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
