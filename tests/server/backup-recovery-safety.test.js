import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createDatabase } from '../../src/server/database/connection.js';
import { runMigrations } from '../../src/server/database/migration-runner.js';
import { BackupService } from '../../src/server/modules/backup/backup.service.js';
import { BackupScheduler } from '../../src/server/modules/backup/backup.scheduler.js';

function isolatedDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gbr-'));
  const dbPath = path.join(directory, 'data', 'a.db');
  const db = createDatabase(dbPath);
  runMigrations(db);
  return { directory, dbPath, db, lockPath: `${dbPath}.backup.lock` };
}

function clean(context) {
  if (context.db.open) context.db.close();
  assert.equal(path.dirname(context.directory), path.resolve(os.tmpdir()));
  fs.rmSync(context.directory, { recursive: true, force: true });
}

function exitedPid() {
  const child = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  assert.equal(child.status, 0, child.stderr);
  const pid = Number(child.stdout.trim());
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  return pid;
}

test('startup recovers a backup lock only when its process has exited', () => {
  const context = isolatedDatabase();
  try {
    context.db.close();
    fs.writeFileSync(context.lockPath, String(exitedPid()));
    context.db = createDatabase(context.dbPath);
    assert.equal(fs.existsSync(context.lockPath), false);
  } finally {
    clean(context);
  }
});

test('manual backup recovers an orphan lock created since startup', async () => {
  const context = isolatedDatabase();
  try {
    fs.writeFileSync(context.lockPath, String(exitedPid()));
    const backup = await new BackupService(context.db).backupDatabase({ type: 'MANUAL' });
    assert.equal(backup.status, 'SUCCESS');
    assert.equal(fs.existsSync(context.lockPath), false);
  } finally {
    clean(context);
  }
});

test('backup retains active, reused-PID and malformed locks', async () => {
  const context = isolatedDatabase();
  try {
    const service = new BackupService(context.db);
    for (const marker of [String(process.pid), 'not-a-pid', '0', '{"pid":-1}']) {
      fs.writeFileSync(context.lockPath, marker);
      await assert.rejects(() => service.backupDatabase({ type: 'MANUAL' }), {
        code: 'BACKUP_IN_PROGRESS',
      });
      assert.equal(fs.readFileSync(context.lockPath, 'utf8'), marker);
    }
  } finally {
    clean(context);
  }
});

test('an uninspectable PID does not authorize deleting a backup lock', async (t) => {
  const context = isolatedDatabase();
  try {
    fs.writeFileSync(context.lockPath, String(process.pid));
    t.mock.method(process, 'kill', () => {
      throw Object.assign(new Error('denied'), { code: 'EPERM' });
    });
    await assert.rejects(() => new BackupService(context.db).backupDatabase({ type: 'MANUAL' }), {
      code: 'BACKUP_IN_PROGRESS',
    });
    assert.equal(fs.readFileSync(context.lockPath, 'utf8'), String(process.pid));
  } finally {
    clean(context);
  }
});

test('backup completion cannot delete a replacement owner lock', async () => {
  const context = isolatedDatabase();
  try {
    const backup = context.db.backup.bind(context.db);
    context.db.backup = async (file) => {
      await backup(file);
      fs.writeFileSync(context.lockPath, 'replacement-owner');
    };
    await new BackupService(context.db).backupDatabase({ type: 'MANUAL' });
    assert.equal(fs.readFileSync(context.lockPath, 'utf8'), 'replacement-owner');
  } finally {
    clean(context);
  }
});

test('overdue interval backups wait before retrying a disk failure', async (t) => {
  const lastSuccess = '2000-01-01T00:00:00.000Z';
  const settings = {
    'backup.auto_enabled': true,
    'backup.schedule_type': 'INTERVAL',
    'backup.interval_hours': 24,
    'backup.last_run_at': lastSuccess,
  };
  const scheduler = new BackupScheduler({
    db: { name: ':memory:' },
    getSettings: () => settings,
    backupDatabase: async () => {
      throw new Error('simulated disk full');
    },
    recordSuccessfulRun: () => assert.fail('a failed attempt is not a successful backup'),
  });
  let delay;
  t.mock.method(global, 'setTimeout', (_callback, milliseconds) => {
    delay = milliseconds;
  });
  t.mock.method(console, 'error', () => {});
  scheduler.isRunning = true;
  await scheduler.runScheduledBackup();
  scheduler.scheduleNextRun();
  assert.ok(delay >= 60000 && delay <= 3600000, `expected bounded retry, got ${delay}`);
  assert.equal(settings['backup.last_run_at'], lastSuccess);
  scheduler.stop();
});
