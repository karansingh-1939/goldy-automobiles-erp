import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import { createTestContext } from './helpers.js';
import { BackupService } from '../../src/server/modules/backup/backup.service.js';
import { BackupScheduler } from '../../src/server/modules/backup/backup.scheduler.js';
import { getBackupDirectory } from '../../src/server/database/backup-service.js';

// Previous Persistence Layer Tests

test('backup scheduler persistence - settings retrieval and update', async () => {
  const context = await createTestContext();

  try {
    const service = new BackupService(context.db);

    const settings = service.getSettings();
    assert.equal(settings['backup.auto_enabled'], true);
    assert.equal(settings['backup.schedule_type'], 'DAILY');
    assert.equal(settings['backup.interval_hours'], 24);
    assert.equal(settings['backup.preferred_time'], '02:00');
    assert.equal(settings['backup.weekly_day'], 'Sunday');
    assert.equal(settings['backup.retention_count'], 7);
    assert.equal(settings['backup.missed_recovery'], true);

    const updated = service.updateSettings({
      'backup.auto_enabled': 'false',
      'backup.retention_count': '12',
      'backup.preferred_time': '23:30',
    });

    assert.equal(updated['backup.auto_enabled'], false);
    assert.equal(updated['backup.retention_count'], 12);
    assert.equal(updated['backup.preferred_time'], '23:30');

    const freshSettings = service.getSettings();
    assert.equal(freshSettings['backup.auto_enabled'], false);
    assert.equal(freshSettings['backup.retention_count'], 12);
    assert.equal(freshSettings['backup.preferred_time'], '23:30');
  } finally {
    await context.close();
  }
});

test('backup scheduler persistence - record successful run (last_run_at)', async () => {
  const context = await createTestContext();

  try {
    const service = new BackupService(context.db);

    const now = new Date().toISOString();
    service.recordSuccessfulRun(now);

    const settings = service.getSettings();
    assert.equal(settings['backup.last_run_at'], now);
  } finally {
    await context.close();
  }
});

test('backup scheduler persistence - retention enforcement & missing file handling', async (t) => {
  const context = await createTestContext();

  try {
    const service = new BackupService(context.db);
    const tempDir = getBackupDirectory(context.db.name);
    fs.mkdirSync(tempDir, { recursive: true });

    await t.test(
      'retention limits: keeps newest N backups, deletes older, and logs purges',
      async () => {
        service.updateSettings({ 'backup.retention_count': '3' });

        const filePaths = [];
        const logIds = [];

        for (let i = 1; i <= 5; i++) {
          const filePath = path.join(tempDir, `backup_auto_${i}.db`);
          fs.writeFileSync(filePath, `backup content version ${i}`);
          filePaths.push(filePath);

          const log = service.repository.createBackupLog({
            filename: path.basename(filePath),
            filepath: filePath,
            type: 'AUTO',
            status: 'SUCCESS',
          });
          logIds.push(log.id);
        }

        const result = service.enforceRetentionPolicy();
        assert.equal(result.success, true);
        assert.equal(result.purgedCount, 2);

        assert.ok(fs.existsSync(filePaths[4]));
        assert.ok(fs.existsSync(filePaths[3]));
        assert.ok(fs.existsSync(filePaths[2]));
        assert.ok(!fs.existsSync(filePaths[1]));
        assert.ok(!fs.existsSync(filePaths[0]));

        const log1 = service.repository.findById(logIds[0]);
        const log2 = service.repository.findById(logIds[1]);
        const log3 = service.repository.findById(logIds[2]);
        const log4 = service.repository.findById(logIds[3]);
        const log5 = service.repository.findById(logIds[4]);

        assert.equal(log1.purged, 1);
        assert.equal(log2.purged, 1);
        assert.equal(log3.purged, 0);
        assert.equal(log4.purged, 0);
        assert.equal(log5.purged, 0);
      },
    );

    await t.test('gracefully handles missing files on disk during retention', async () => {
      service.updateSettings({ 'backup.retention_count': '1' });

      const activeBackups = service.repository.getUnpurgedSuccessfulAutoBackups();
      const oldestActive = activeBackups[activeBackups.length - 1];

      if (fs.existsSync(oldestActive.filepath)) {
        fs.unlinkSync(oldestActive.filepath);
      }

      const result = service.enforceRetentionPolicy();
      assert.equal(result.success, true);
      assert.equal(result.purgedCount, 2);

      const log3 = service.repository.findById(oldestActive.id);
      assert.equal(log3.purged, 1);
    });

    await t.test('retention boundary conditions: retention_count = 1', async () => {
      service.updateSettings({ 'backup.retention_count': '1' });

      const files = [];
      const ids = [];
      for (let i = 10; i <= 12; i++) {
        const filePath = path.join(tempDir, `backup_boundary_${i}.db`);
        fs.writeFileSync(filePath, `boundary content ${i}`);
        files.push(filePath);
        const log = service.repository.createBackupLog({
          filename: path.basename(filePath),
          filepath: filePath,
          type: 'AUTO',
          status: 'SUCCESS',
        });
        ids.push(log.id);
      }

      const result = service.enforceRetentionPolicy();
      assert.equal(result.success, true);

      assert.ok(fs.existsSync(files[2]));
      assert.ok(!fs.existsSync(files[1]));
      assert.ok(!fs.existsSync(files[0]));

      assert.equal(service.repository.findById(ids[2]).purged, 0);
      assert.equal(service.repository.findById(ids[1]).purged, 1);
      assert.equal(service.repository.findById(ids[0]).purged, 1);
    });

    await t.test('retention boundary conditions: no backups or large retention count', async () => {
      service.updateSettings({ 'backup.retention_count': '100' });

      const unpurgedBefore = service.repository.getUnpurgedSuccessfulAutoBackups().length;
      const result = service.enforceRetentionPolicy();
      assert.equal(result.success, true);
      assert.equal(result.purgedCount, 0);

      const unpurgedAfter = service.repository.getUnpurgedSuccessfulAutoBackups().length;
      assert.equal(unpurgedBefore, unpurgedAfter);
    });

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* Temporary directory cleanup can fail on Windows while a handle is closing. */
    }
  } finally {
    await context.close();
  }
});

// Scheduler Engine Integration & Lifecycle Tests

test('backup scheduler - lifecycle controls (start, stop, restart)', async () => {
  const context = await createTestContext();

  try {
    const service = new BackupService(context.db);
    const scheduler = new BackupScheduler(service);

    assert.equal(scheduler.isRunning, false);

    // Start scheduler
    scheduler.start();
    assert.equal(scheduler.isRunning, true);
    assert.ok(scheduler.activeTimeout);

    // Duplicate start has no effect
    const firstTimeout = scheduler.activeTimeout;
    scheduler.start();
    assert.equal(scheduler.activeTimeout, firstTimeout);

    // Stop scheduler
    scheduler.stop();
    assert.equal(scheduler.isRunning, false);
    assert.equal(scheduler.activeTimeout, null);

    // Restart scheduler
    scheduler.restart();
    assert.equal(scheduler.isRunning, true);
    assert.ok(scheduler.activeTimeout);

    scheduler.stop();
  } finally {
    await context.close();
  }
});

test('backup scheduler - concurrency protection (overlapping executions)', async () => {
  const context = await createTestContext();

  try {
    const service = new BackupService(context.db);
    const scheduler = new BackupScheduler(service);

    // Set lock to true
    scheduler.isExecutionLocked = true;

    // Record last successful run count in DB
    const beforeCount = context.db.prepare('SELECT COUNT(*) as count FROM backup_logs').get().count;

    // Trigger run. It should skip due to active lock
    await scheduler.runScheduledBackup();

    const afterCount = context.db.prepare('SELECT COUNT(*) as count FROM backup_logs').get().count;
    assert.equal(
      beforeCount,
      afterCount,
      'Should not execute backup if concurrency lock is active',
    );
  } finally {
    await context.close();
  }
});

test('backup scheduler - restore lock file detection', async () => {
  const context = await createTestContext();

  try {
    const service = new BackupService(context.db);
    const scheduler = new BackupScheduler(service);

    const dbDir = path.dirname(context.db.name);
    const lockFilePath = path.join(dbDir, 'restore.lock');

    // Create restore lock file
    fs.writeFileSync(lockFilePath, 'RESTORE_ACTIVE');

    const beforeCount = context.db.prepare('SELECT COUNT(*) as count FROM backup_logs').get().count;

    // Trigger backup. It should skip due to lock file existence
    await scheduler.runScheduledBackup();

    const afterCount = context.db.prepare('SELECT COUNT(*) as count FROM backup_logs').get().count;
    assert.equal(beforeCount, afterCount, 'Should skip run if restore.lock file exists on disk');

    // Remove lock file
    fs.unlinkSync(lockFilePath);
  } finally {
    await context.close();
  }
});

test('backup scheduler - failure handling & resilience', async () => {
  const context = await createTestContext();

  try {
    const service = new BackupService(context.db);
    const scheduler = new BackupScheduler(service);

    // Mock backup database execution to fail
    const originalBackupDatabase = service.backupDatabase;
    service.backupDatabase = async () => {
      throw new Error('Disk full simulated error');
    };

    // Trigger execution. It should log error but NOT crash the scheduler or parent thread
    await scheduler.runScheduledBackup();

    // Verify lock is released so future scheduled backups can run
    assert.equal(
      scheduler.isExecutionLocked,
      false,
      'Lock must be released even after run failure',
    );

    service.backupDatabase = originalBackupDatabase;
  } finally {
    await context.close();
  }
});

test('backup scheduler - catch-up execution checks', async () => {
  const context = await createTestContext();

  try {
    const service = new BackupService(context.db);
    const scheduler = new BackupScheduler(service);

    // Mock Time setup (Time Mocking helper)
    const OriginalDate = global.Date;
    let mockTimeMs = new Date('2026-06-06T12:00:00.000Z').getTime();

    class MockDate extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          super(mockTimeMs);
        } else {
          super(...args);
        }
      }
    }
    global.Date = MockDate;
    global.Date.now = () => mockTimeMs;

    try {
      // 1. If NO backup is recorded in settings, catch-up must trigger
      service.updateSettings({
        'backup.missed_recovery': 'true',
        'backup.schedule_type': 'DAILY',
        'backup.preferred_time': '02:00',
      });

      // Clear any last run settings
      context.db.prepare("DELETE FROM system_settings WHERE key = 'backup.last_run_at'").run();

      let backupTriggered = false;
      const originalRunScheduledBackup = scheduler.runScheduledBackup;
      scheduler.runScheduledBackup = async () => {
        backupTriggered = true;
      };

      scheduler.isRunning = true;
      await scheduler.checkAndRunCatchup();
      assert.equal(backupTriggered, true, 'Should run catch-up if no last_run_at is recorded');

      // 2. Mock state: Last run was yesterday 01:50, today is past preferred time (12:00). Must catch-up.
      backupTriggered = false;
      service.updateSettings({
        'backup.last_run_at': new OriginalDate('2026-06-05T01:50:00.000Z').toISOString(),
      });

      await scheduler.checkAndRunCatchup();
      assert.equal(
        backupTriggered,
        true,
        'Should run catch-up if last run was yesterday before preferred time',
      );

      // 3. Mock state: Last run was today 02:05 (past preferred time 02:00). No catch-up required today.
      backupTriggered = false;
      service.updateSettings({
        'backup.last_run_at': new OriginalDate('2026-06-06T02:05:00.000Z').toISOString(),
      });

      await scheduler.checkAndRunCatchup();
      assert.equal(
        backupTriggered,
        false,
        'Should not run catch-up if last run was today after preferred time',
      );

      // 4. Mock state: Today is Wednesday, preferred day is Sunday. Last run was Sunday 02:05. No catch-up.
      // 2026-06-06 is Saturday. Sunday is 2026-06-07.
      // Let's set time to Monday 2026-06-08 12:00.
      mockTimeMs = new OriginalDate('2026-06-08T12:00:00.000Z').getTime();
      service.updateSettings({
        'backup.schedule_type': 'WEEKLY',
        'backup.weekly_day': 'Sunday',
        'backup.preferred_time': '02:00',
        'backup.last_run_at': new OriginalDate('2026-06-07T02:05:00.000Z').toISOString(),
      });

      backupTriggered = false;
      await scheduler.checkAndRunCatchup();
      assert.equal(
        backupTriggered,
        false,
        'Weekly schedule should not catch up if already run on Sunday',
      );

      // 5. Mock state: Last run was two weeks ago. Weekly schedule should catch up.
      service.updateSettings({
        'backup.last_run_at': new OriginalDate('2026-05-25T02:00:00.000Z').toISOString(),
      });
      await scheduler.checkAndRunCatchup();
      assert.equal(
        backupTriggered,
        true,
        'Weekly schedule should catch up if last run was in a previous week',
      );

      scheduler.runScheduledBackup = originalRunScheduledBackup;
    } finally {
      // Restore Date
      global.Date = OriginalDate;
    }
  } finally {
    await context.close();
  }
});

test('backup scheduler - daily and weekly scheduling calculations', async () => {
  const context = await createTestContext();

  try {
    const service = new BackupService(context.db);
    const scheduler = new BackupScheduler(service);

    // Mock Time setup using local date to remain timezone independent
    const OriginalDate = global.Date;
    const mockTimeMs = new OriginalDate(2026, 5, 6, 12, 0, 0).getTime();

    class MockDate extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          super(mockTimeMs);
        } else {
          super(...args);
        }
      }
    }
    global.Date = MockDate;
    global.Date.now = () => mockTimeMs;

    // Stub global.setTimeout
    const originalSetTimeout = global.setTimeout;
    let capturedDelay = null;
    global.setTimeout = (fn, delay) => {
      capturedDelay = delay;
      return 12345; // Dummy timeout ID
    };

    try {
      scheduler.isRunning = true;

      // 1. Daily preferred time is 13:00 (1 hour in the future)
      service.updateSettings({
        'backup.schedule_type': 'DAILY',
        'backup.preferred_time': '13:00',
      });
      scheduler.scheduleNextRun();
      assert.equal(
        capturedDelay,
        60 * 60 * 1000,
        'Should schedule daily backup for exactly 1 hour in the future',
      );

      // 2. Daily preferred time is 11:00 (yesterday/earlier today; should schedule for tomorrow 11:00)
      service.updateSettings({
        'backup.preferred_time': '11:00',
      });
      scheduler.scheduleNextRun();
      // 23 hours in the future (24 hours minus 1 hour difference from 12:00 to 11:00)
      assert.equal(
        capturedDelay,
        23 * 60 * 60 * 1000,
        'Should schedule daily backup for tomorrow if preferred time has passed today',
      );

      // 3. Weekly scheduled time is Sunday 12:00 (tomorrow)
      // Jun 06 is Saturday. Sunday Jun 07 12:00 is exactly 24 hours in the future
      service.updateSettings({
        'backup.schedule_type': 'WEEKLY',
        'backup.weekly_day': 'Sunday',
        'backup.preferred_time': '12:00',
      });
      scheduler.scheduleNextRun();
      assert.equal(
        capturedDelay,
        24 * 60 * 60 * 1000,
        'Should schedule weekly backup on target weekday',
      );
    } finally {
      global.Date = OriginalDate;
      global.setTimeout = originalSetTimeout;
    }
  } finally {
    await context.close();
  }
});
