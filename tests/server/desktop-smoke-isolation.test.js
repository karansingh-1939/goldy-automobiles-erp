import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertSmokeIsolation } from '../../src/desktop/smoke-check.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsm-'));
  const nonce = randomUUID();
  const previous = [process.env.GOLDY_SMOKE_ROOT, process.env.GOLDY_SMOKE_NONCE];
  process.env.GOLDY_SMOKE_ROOT = root;
  process.env.GOLDY_SMOKE_NONCE = nonce;
  fs.writeFileSync(path.join(root, '.goldy-smoke'), nonce);
  fs.mkdirSync(path.join(root, 'data'));
  fs.mkdirSync(path.join(root, 'app'));
  t.after(() => {
    for (const [index, key] of ['GOLDY_SMOKE_ROOT', 'GOLDY_SMOKE_NONCE'].entries()) {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    }
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.equal(fs.readFileSync(path.join(root, '.goldy-smoke'), 'utf8'), nonce);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    env: { dbFile: path.join(root, 'data', 'a.db'), appDataPath: path.join(root, 'app') },
  };
}

test('desktop smoke accepts only a new database and marker-owned temporary AppData', (t) => {
  const { env } = fixture(t);
  assert.doesNotThrow(() => assertSmokeIsolation(env));
  fs.writeFileSync(env.dbFile, 'existing workshop database');
  assert.throws(() => assertSmokeIsolation(env), /new, owned temporary database/);
  assert.equal(fs.readFileSync(env.dbFile, 'utf8'), 'existing workshop database');
});

test('desktop smoke refuses database and AppData overrides outside its workspace', (t) => {
  const { root, env } = fixture(t);
  assert.throws(() => assertSmokeIsolation({ ...env, dbFile: path.join(root, 'other.db') }));
  assert.throws(() => assertSmokeIsolation({ ...env, appDataPath: os.tmpdir() }));
  assert.equal(fs.existsSync(env.dbFile), false);
});

test('desktop smoke refuses a missing or mismatched ownership nonce', (t) => {
  const { env } = fixture(t);
  delete process.env.GOLDY_SMOKE_NONCE;
  assert.throws(() => assertSmokeIsolation(env));
  process.env.GOLDY_SMOKE_NONCE = randomUUID();
  assert.throws(() => assertSmokeIsolation(env));
  assert.equal(fs.existsSync(env.dbFile), false);
});
