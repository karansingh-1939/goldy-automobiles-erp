import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../database/connection.js';

test('database path isolation environment and overrides verification', async (t) => {
  // Backup environment variables
  const origNodeEnv = process.env.NODE_ENV;
  const origDbFile = process.env.DB_FILE;
  const origDatabasePath = process.env.DATABASE_PATH;
  const origAppDataPath = process.env.APPDATA_PATH;

  await t.test('resolves to local file in development mode by default', async () => {
    delete process.env.DATABASE_PATH;
    delete process.env.DB_FILE;
    delete process.env.APPDATA_PATH;
    process.env.NODE_ENV = 'development';

    // Clear module cache to reload config
    const { env } = await import(`../config/env.js?update=${Date.now()}`);
    assert.match(env.dbFile, /goldy\.sqlite$/);
  });

  await t.test('resolves to AppData path in production mode', async () => {
    delete process.env.DATABASE_PATH;
    delete process.env.DB_FILE;
    delete process.env.APPDATA_PATH;
    process.env.NODE_ENV = 'production';

    const { env } = await import(`../config/env.js?update=${Date.now()}`);
    assert.match(env.dbFile, /goldy_erp\.db$/);
    assert.match(env.appDataPath, /Goldy_Automobiles/);
  });

  await t.test('respects DATABASE_PATH override variable', async () => {
    process.env.DATABASE_PATH = './custom_test_env_db.db';
    process.env.NODE_ENV = 'production';

    const { env } = await import(`../config/env.js?update=${Date.now()}`);
    assert.equal(env.dbFile, path.resolve('./custom_test_env_db.db'));
    delete process.env.DATABASE_PATH;
  });

  await t.test('respects APPDATA_PATH override variable', async () => {
    process.env.APPDATA_PATH = './custom_appdata_override';
    process.env.NODE_ENV = 'production';

    const { env } = await import(`../config/env.js?update=${Date.now()}`);
    assert.equal(env.appDataPath, path.resolve('./custom_appdata_override'));
    assert.equal(env.dbFile, path.resolve('./custom_appdata_override/data/goldy_erp.db'));
    delete process.env.APPDATA_PATH;
  });

  // Restore original environment variables
  process.env.NODE_ENV = origNodeEnv;
  process.env.DB_FILE = origDbFile;
  process.env.DATABASE_PATH = origDatabasePath;
  process.env.APPDATA_PATH = origAppDataPath;
});

test('auto-directory structure creation check', async (t) => {
  const testDir = path.resolve('./data/test_sandbox_path');
  const testDbFile = path.join(testDir, 'data', 'test_db.db');

  // Ensure clean start
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  await t.test('creates data, backups, and logs sibling folder structure on startup', () => {
    const db = createDatabase(testDbFile);
    db.close();

    assert.ok(fs.existsSync(path.join(testDir, 'data')));
    assert.ok(fs.existsSync(path.join(testDir, 'backups')));
    assert.ok(fs.existsSync(path.join(testDir, 'logs')));
    assert.ok(fs.existsSync(testDbFile));
  });

  // Cleanup sandbox folder
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
