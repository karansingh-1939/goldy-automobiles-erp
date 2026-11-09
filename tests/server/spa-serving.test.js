import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestContext } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('retired workshop pages preserve authenticated links and record selectors into React', async () => {
  const context = await createTestContext();
  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    for (const [legacy, target] of [
      ['audit-logs', 'audit-logs'],
      ['tally-export', 'reports'],
      ['dashboard', ''],
      ['assets', 'assets'],
      ['expenses', 'expenses'],
      ['gst-reports', 'reports'],
      ['inventory', 'inventory'],
      ['invoices', 'invoices'],
      ['job-cards', 'job-cards'],
      ['masters', 'masters'],
      ['purchasing', 'purchasing'],
      ['service-history', 'service-history'],
      ['settings', 'settings'],
      ['stock-verification', 'stock-verification'],
      ['supplier-ledger', 'supplier-ledger'],
      ['technicians', 'technicians'],
    ]) {
      const anonymous = await context.request(`/${legacy}.html`, { redirect: 'manual' });
      assert.equal(anonymous.response.status, 302);
      assert.equal(anonymous.response.headers.get('location'), '/index.html');
      const authenticated = await context.request(`/${legacy}.html`, {
        redirect: 'manual',
        headers: { Cookie: `goldy_session_token=${login.body.token}` },
      });
      assert.equal(authenticated.response.status, 302);
      assert.equal(authenticated.response.headers.get('location'), `/index.html#/${target}`);
    }
    const record = await context.request('/invoices.html?id=42', {
      redirect: 'manual',
      headers: { Cookie: `goldy_session_token=${login.body.token}` },
    });
    assert.equal(record.response.headers.get('location'), '/index.html#/invoices?id=42');
  } finally {
    await context.close();
  }
});

test('React application serves its compiled shell and assets', async () => {
  const context = await createTestContext();

  try {
    // 1. Verify index.html exists in public directory
    const publicPath = path.resolve(__dirname, '../../dist/renderer');
    const indexPath = path.join(publicPath, 'index.html');
    assert.ok(fs.existsSync(indexPath), 'index.html must exist in public folder');

    // 2. Fetch index.html from static server
    const res = await context.request('/');
    assert.equal(res.response.status, 200);
    assert.ok(
      res.body.includes('<div id="root"></div>'),
      'index.html must contain root div target',
    );
    assert.ok(
      res.body.includes('main.jsx') || res.body.includes('/assets/main'),
      'index.html must reference compilation asset',
    );

    // 3. Extract the assets folder mapping if built
    const assetsDir = path.join(publicPath, 'assets');
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      const jsFile = files.find((f) => f.endsWith('.js'));
      const cssFile = files.find((f) => f.endsWith('.css'));

      if (jsFile) {
        const jsRes = await context.request(`/assets/${jsFile}`);
        assert.equal(jsRes.response.status, 200, 'JS compiled bundle should be served');
      }
      if (cssFile) {
        const cssRes = await context.request(`/assets/${cssFile}`);
        assert.equal(cssRes.response.status, 200, 'CSS compiled bundle should be served');
      }
    }
  } finally {
    await context.close();
  }
});
