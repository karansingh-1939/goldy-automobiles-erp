import assert from 'node:assert/strict';
import test from 'node:test';

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { verifyBackupSnapshot } from '../../src/server/modules/backup/snapshot-verification.js';
import { createTestContext } from './helpers.js';
import { BackupService } from '../../src/server/modules/backup/backup.service.js';

test('external backups verify restore compatibility and retain local copies when disconnected', async () => {
  const context = await createTestContext();
  const directory = path.join(path.dirname(context.db.name), 'external');
  fs.mkdirSync(directory);
  try {
    const service = new BackupService(context.db);
    service.updateSettings({ 'backup.external_directory': directory });
    const before = context.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const backup = await service.backupDatabase({ type: 'MANUAL', userId: 1 });
    assert.equal(backup.external.status, 'SUCCESS');
    assert.ok(fs.existsSync(backup.external.filepath));
    assert.equal((await service.verifyBackup(backup.id)).verified, true);
    assert.equal(context.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before);
    fs.rmSync(directory, { recursive: true });
    const disconnected = await service.backupDatabase({ type: 'AUTO', userId: 1 });
    assert.equal(disconnected.status, 'SUCCESS');
    assert.equal(disconnected.external.status, 'FAILED');
    assert.ok(fs.existsSync(disconnected.filepath));
    assert.ok(!fs.existsSync(directory));
    fs.writeFileSync(disconnected.filepath, 'corrupted snapshot');
    await assert.rejects(() => service.verifyBackup(disconnected.id), { code: 'BACKUP_INVALID' });
    const impostorPath = path.join(path.dirname(context.db.name), 'not-an-erp.sqlite');
    const impostor = new Database(impostorPath);
    impostor.exec('CREATE TABLE schema_migrations (id INTEGER)');
    impostor.close();
    await assert.rejects(() => verifyBackupSnapshot(impostorPath), /not an ERP backup/);
  } finally {
    await context.close();
  }
});

test('external backup settings reject relative folders and verification is administrator-only', async () => {
  const context = await createTestContext();
  try {
    const service = new BackupService(context.db);
    assert.throws(
      () => service.updateSettings({ 'backup.external_directory': 'relative-folder' }),
      { code: 'VALIDATION_ERROR' },
    );
    const unauthenticated = await context.request('/api/v1/backups/1/verify', { method: 'POST' });
    assert.equal(unauthenticated.response.status, 401);
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const backup = await context.request('/api/v1/backups/manual', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.body.token}` },
    });
    const verified = await context.request(`/api/v1/backups/${backup.body.data.id}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.body.token}` },
    });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.body.data.verified, true);
  } finally {
    await context.close();
  }
});

test('backup engine - manual backup API integration and file validation', async () => {
  const context = await createTestContext();

  try {
    // 1. Log in as admin to get auth token
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'Admin@12345',
      }),
    });

    assert.equal(login.response.status, 200);
    const token = login.body.token;
    assert.ok(token);

    // 2. Perform manual backup via API
    const backupRes = await context.request('/api/v1/backups/manual', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(backupRes.response.status, 201);
    const backupLog = backupRes.body.data;
    assert.ok(backupLog);
    assert.ok(backupLog.id);
    assert.equal(backupLog.status, 'SUCCESS');
    assert.equal(backupLog.type, 'MANUAL');
    assert.ok(backupLog.filename);
    assert.ok(backupLog.filepath);
    assert.ok(backupLog.file_size > 0);
    assert.equal(backupLog.error_message, null);
    assert.equal(backupLog.created_by_name, 'System Administrator');

    // 3. Verify backup file exists and size matches
    assert.ok(fs.existsSync(backupLog.filepath), 'Backup file must exist on disk');
    const stat = fs.statSync(backupLog.filepath);
    assert.equal(stat.size, backupLog.file_size, 'File size on disk must match database record');
    assert.ok(stat.size > 0, 'Backup file size must be greater than zero');

    // 4. Verify listing backup logs via API
    const listRes = await context.request('/api/v1/backups', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(listRes.response.status, 200);
    const listData = listRes.body.data;
    assert.ok(Array.isArray(listData));
    const found = listData.find((log) => log.id === backupLog.id);
    assert.ok(found, 'Should find the created backup log in the backup logs list');
    assert.equal(found.status, 'SUCCESS');
    assert.equal(found.created_by_name, 'System Administrator');
  } finally {
    await context.close();
  }
});

test('backup engine - RBAC permissions protection', async () => {
  const context = await createTestContext();

  try {
    // 1. Create a mechanic user
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('Mechanic@12345', 12);
    const mechanicRole = context.db.prepare("SELECT id FROM roles WHERE name = 'Mechanic'").get();

    context.db
      .prepare(
        `
      INSERT INTO users (name, username, password_hash, role_id)
      VALUES ('Test Mechanic', 'mechanic', ?, ?)
    `,
      )
      .run(passwordHash, mechanicRole.id);

    // 2. Log in as mechanic
    const loginMech = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'mechanic',
        password: 'Mechanic@12345',
      }),
    });

    assert.equal(loginMech.response.status, 200);
    const mechToken = loginMech.body.token;
    assert.ok(mechToken);

    // 3. Attempt to trigger backup as mechanic (should fail with 403 Forbidden)
    const backupRes = await context.request('/api/v1/backups/manual', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mechToken}`,
      },
    });
    assert.equal(backupRes.response.status, 403);
    assert.equal(backupRes.body.error.code, 'PERMISSION_DENIED');

    // 4. Attempt to list backups as mechanic (should fail with 403 Forbidden)
    const listRes = await context.request('/api/v1/backups', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${mechToken}`,
      },
    });
    assert.equal(listRes.response.status, 403);
    assert.equal(listRes.body.error.code, 'PERMISSION_DENIED');
  } finally {
    await context.close();
  }
});

test('backup engine - failure handling and log recording', async () => {
  const context = await createTestContext();

  try {
    // Save original backup method
    const originalBackup = context.db.backup;

    try {
      // Stub the backup method to simulate a physical backup failure
      context.db.backup = async () => {
        throw new Error('Simulated I/O failure (Disk Full)');
      };

      const service = new BackupService(context.db);

      // Verify backupDatabase throws BACKUP_FAILED AppError
      await assert.rejects(
        async () => {
          await service.backupDatabase({ type: 'MANUAL', userId: 1 });
        },
        (err) => {
          return err.code === 'BACKUP_FAILED' && err.message.includes('Simulated I/O failure');
        },
      );

      // Verify a failed log entry was recorded in DB
      const latestLog = context.db
        .prepare('SELECT * FROM backup_logs ORDER BY id DESC LIMIT 1')
        .get();
      assert.ok(latestLog, 'A backup log should still be recorded');
      assert.equal(latestLog.status, 'FAILED');
      assert.equal(latestLog.error_message, 'Simulated I/O failure (Disk Full)');
      assert.equal(latestLog.file_size, null);
    } finally {
      context.db.backup = originalBackup;
    }
  } finally {
    await context.close();
  }
});

test('backup engine - fallback method (VACUUM INTO)', async () => {
  const context = await createTestContext();

  try {
    // Delete/Hide the native backup function to force fallback strategy
    const originalBackup = context.db.backup;
    delete context.db.backup;

    const service = new BackupService(context.db);

    // Perform backup using service directly (forcing VACUUM INTO)
    const backupLog = await service.backupDatabase({
      type: 'AUTO',
      userId: 1,
    });

    assert.ok(backupLog);
    assert.equal(backupLog.status, 'SUCCESS');
    assert.equal(backupLog.type, 'AUTO');
    assert.ok(backupLog.filename);
    assert.ok(backupLog.filepath);
    assert.ok(backupLog.file_size > 0);

    // Verify backup file was created on disk
    assert.ok(fs.existsSync(backupLog.filepath), 'Backup file must exist on disk');
    const stat = fs.statSync(backupLog.filepath);
    assert.equal(stat.size, backupLog.file_size, 'File size on disk must match database record');

    // Clean up backup file
    if (fs.existsSync(backupLog.filepath)) {
      fs.unlinkSync(backupLog.filepath);
    }

    // Restore native method
    context.db.backup = originalBackup;
  } finally {
    await context.close();
  }
});
