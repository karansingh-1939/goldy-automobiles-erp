import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

async function login(context) {
  const result = await context.request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: 'admin',
      password: 'Admin@12345',
    }),
  });

  assert.equal(result.response.status, 200);
  return result.body.token;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

test('audit logs list enforces authentication and permissions', async () => {
  const context = await createTestContext();

  try {
    const unauthenticated = await context.request('/api/v1/audit-logs');
    assert.equal(unauthenticated.response.status, 401);

    const token = await login(context);

    // Create a record so that we generate some audit logs
    const customerResult = await context.request('/api/v1/customers', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Audit Test Customer',
        phone: '9888888888',
        city: 'Pune',
      }),
    });
    assert.equal(customerResult.response.status, 201);
    const customer = customerResult.body.data;

    // Now query the audit logs
    const auditResult = await context.request('/api/v1/audit-logs', {
      headers: authHeaders(token),
    });

    assert.equal(auditResult.response.status, 200);
    assert.ok(auditResult.body.data);
    assert.ok(auditResult.body.pagination);
    assert.ok(auditResult.body.pagination.total >= 1);

    // Let's check that our CREATE audit log is present
    const createLog = auditResult.body.data.find(
      (log) => log.entityType === 'customers' && log.entityId === customer.id && log.action === 'CREATE'
    );
    assert.ok(createLog);
    assert.equal(createLog.newValue.name, 'Audit Test Customer');

    // Test filters
    const filteredResult = await context.request('/api/v1/audit-logs?entityType=customers&action=CREATE', {
      headers: authHeaders(token),
    });
    assert.equal(filteredResult.response.status, 200);
    assert.ok(filteredResult.body.data.every((log) => log.entityType === 'customers' && log.action === 'CREATE'));

    // Test search
    const searchedResult = await context.request('/api/v1/audit-logs?search=Audit Test Customer', {
      headers: authHeaders(token),
    });
    assert.equal(searchedResult.response.status, 200);

  } finally {
    await context.close();
  }
});
