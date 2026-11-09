import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { localDate } from '../../src/server/shared/utils/local-date.js';

test('expense summaries aggregate every matching row beyond pagination and reject invalid ranges', async () => {
  const context = await createTestContext();
  try {
    const today = localDate();
    const insert = context.db.prepare(
      'INSERT INTO expenses(expense_date,category,amount) VALUES (?,?,?)',
    );
    for (let i = 0; i < 150; i++) insert.run(today, 'Fuel', 1.25);
    insert.run(today, 'Rent', 500);
    insert.run('2000-01-01', 'Fuel', 25);
    const anonymous = await context.request('/api/v1/expenses/summary');
    assert.equal(anonymous.response.status, 401);
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const result = await context.request(
      `/api/v1/expenses/summary?category=Fuel&dateFrom=${today}&dateTo=${today}`,
      { headers },
    );
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.data, {
      todayTotal: 187.5,
      monthTotal: 187.5,
      total: 187.5,
      byCategory: [{ category: 'Fuel', amount: 187.5 }],
    });
    const all = await context.request('/api/v1/expenses/summary', { headers });
    assert.equal(all.body.data.total, 712.5);
    assert.equal(all.body.data.todayTotal, 687.5);
    const invalid = await context.request(
      '/api/v1/expenses/summary?dateFrom=2026-10-15&dateTo=2026-09-01',
      { headers },
    );
    assert.equal(invalid.response.status, 400);
  } finally {
    await context.close();
  }
});
