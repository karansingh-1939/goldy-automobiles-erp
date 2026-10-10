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

async function createExpense(context, token, payload) {
  const result = await context.request('/api/v1/expenses', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

test('expense APIs create, update, list with filters, and delete expenses with audit logs', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const rent = await createExpense(context, token, {
      date: '2026-06-01',
      category: 'Rent',
      amount: 15000,
      description: 'Workshop monthly rent',
    });
    const fuel = await createExpense(context, token, {
      expense_date: '2026-06-04',
      category: 'Fuel',
      amount: 1200.5,
      description: 'Fuel for parts pickup',
    });
    await createExpense(context, token, {
      expense_date: '2026-05-28',
      category: 'Maintenance',
      amount: 850,
      description: 'Compressor repair',
    });

    assert.equal(rent.category, 'Rent');
    assert.equal(rent.expense_date, '2026-06-01');
    assert.equal(rent.amount, 15000);
    assert.ok(rent.created_by);

    const byCategory = await context.request('/api/v1/expenses?category=Fuel', {
      headers: authHeaders(token),
    });

    assert.equal(byCategory.response.status, 200);
    assert.equal(byCategory.body.pagination.total, 1);
    assert.equal(byCategory.body.data[0].id, fuel.id);

    const byDateRange = await context.request(
      '/api/v1/expenses?dateFrom=2026-06-01&dateTo=2026-06-30',
      {
        headers: authHeaders(token),
      },
    );

    assert.equal(byDateRange.response.status, 200);
    assert.equal(byDateRange.body.pagination.total, 2);

    const updated = await context.request(`/api/v1/expenses/${fuel.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        amount: 1300.75,
        description: 'Fuel and toll for parts pickup',
      }),
    });

    assert.equal(updated.response.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.amount, 1300.75);
    assert.equal(updated.body.data.description, 'Fuel and toll for parts pickup');

    const deleted = await context.request(`/api/v1/expenses/${rent.id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });

    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.body.success, true);

    const missing = await context.request(`/api/v1/expenses/${rent.id}`, {
      headers: authHeaders(token),
    });

    assert.equal(missing.response.status, 404);

    const auditCount = context.db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM audit_logs
      WHERE entity_type = 'expenses'
        AND action IN ('CREATE', 'UPDATE', 'DELETE')
    `,
      )
      .get().count;

    assert.equal(auditCount, 5);
  } finally {
    await context.close();
  }
});

test('expense APIs enforce authentication and validation', async () => {
  const context = await createTestContext();

  try {
    const unauthenticated = await context.request('/api/v1/expenses');
    assert.equal(unauthenticated.response.status, 401);

    const token = await login(context);
    const invalidCategory = await context.request('/api/v1/expenses', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        expense_date: '2026-06-04',
        category: 'Tea',
        amount: 100,
      }),
    });

    assert.equal(invalidCategory.response.status, 400);
    assert.equal(invalidCategory.body.error.code, 'VALIDATION_ERROR');

    const invalidAmount = await context.request('/api/v1/expenses', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        expense_date: '2026-06-04',
        category: 'Miscellaneous',
        amount: 0,
      }),
    });

    assert.equal(invalidAmount.response.status, 400);
    assert.equal(invalidAmount.body.error.code, 'VALIDATION_ERROR');

    const invalidRange = await context.request(
      '/api/v1/expenses?dateFrom=2026-06-05&dateTo=2026-06-01',
      {
        headers: authHeaders(token),
      },
    );

    assert.equal(invalidRange.response.status, 400);
    assert.equal(invalidRange.body.error.code, 'VALIDATION_ERROR');
  } finally {
    await context.close();
  }
});
