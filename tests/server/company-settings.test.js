import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

async function adminHeaders(context) {
  const result = await context.request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
  });
  return { Authorization: `Bearer ${result.body.token}`, 'Content-Type': 'application/json' };
}

test('owner can save company details that bills and GST state logic use', async () => {
  const context = await createTestContext();
  try {
    const before = await context.request('/api/v1/settings/company');
    assert.equal(before.response.status, 200);
    assert.equal(before.body.data.state, 'Haryana');

    const anonymous = await context.request('/api/v1/settings/company', {
      method: 'PUT',
      body: JSON.stringify({ name: 'X' }),
    });
    assert.equal(anonymous.response.status, 401);

    const headers = await adminHeaders(context);
    const saved = await context.request('/api/v1/settings/company', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: 'Test Workshop',
        address: '1 Test Road, Karnal',
        phone: '9000000000',
        gstin: '06abcde1234f1z5',
        state: 'Haryana',
      }),
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.data.gstin, '06ABCDE1234F1Z5');
    assert.equal(saved.body.data.stateCode, '06');

    const company = context.db
      .prepare('SELECT name, gstin, state FROM companies WHERE id = 1')
      .get();
    assert.deepEqual(company, {
      name: 'Test Workshop',
      gstin: '06ABCDE1234F1Z5',
      state: 'Haryana',
    });
    assert.ok(
      context.db.prepare("SELECT 1 FROM audit_logs WHERE entity_type = 'company_settings'").get(),
    );

    for (const [body, message] of [
      [{ gstin: '07ABCDE1234F1Z5' }, /does not match Haryana/],
      [{ gstin: 'BAD' }, /15 characters/],
      [{ address: '  ' }, /Address is required/],
      [{ state: 'Atlantis' }, /valid Indian state/],
    ]) {
      const rejected = await context.request('/api/v1/settings/company', {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(rejected.response.status, 400);
      assert.match(rejected.body.error.message, message);
    }
  } finally {
    await context.close();
  }
});
