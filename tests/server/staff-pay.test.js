import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

test('owner sets salary, gives an advance and pays salary with the advance recovered', async () => {
  const context = await createTestContext();
  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const call = (path, body, method = body ? 'POST' : 'GET') =>
      context.request(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const staffId = context.db
      .prepare(
        "INSERT INTO technicians (technician_code, full_name, phone_number) VALUES ('T-PAY', 'Test Mechanic', '9000090001')",
      )
      .run().lastInsertRowid;
    const cash = (await call('/api/v1/accounting/money-accounts')).body.data.find(
      (row) => row.kind === 'CASH',
    );

    const salary = await call(
      `/api/v1/staff-pay/${staffId}/salary`,
      { monthlySalary: 15000 },
      'PATCH',
    );
    assert.equal(salary.body.data.monthlySalary, 15000);

    const advance = await call(`/api/v1/staff-pay/${staffId}/advance`, {
      amount: 3000,
      accountId: cash.id,
      date: '2026-11-05',
    });
    assert.equal(advance.response.status, 201, JSON.stringify(advance.body));

    const tooMuch = await call(`/api/v1/staff-pay/${staffId}/pay`, {
      month: '2026-11',
      advanceDeducted: 5000,
      accountId: cash.id,
      date: '2026-11-11',
    });
    assert.equal(tooMuch.response.status, 400);

    const paid = await call(`/api/v1/staff-pay/${staffId}/pay`, {
      month: '2026-11',
      advanceDeducted: 3000,
      accountId: cash.id,
      date: '2026-11-11',
    });
    assert.equal(paid.response.status, 201, JSON.stringify(paid.body));
    assert.equal(paid.body.data.gross_amount, 15000);
    assert.equal(paid.body.data.net_paid, 12000);

    const entries = context.db
      .prepare(
        `SELECT l.system_key, je.entry_type, je.amount FROM journal_entries je
         JOIN ledgers l ON l.id = je.ledger_id WHERE je.voucher_id = ? ORDER BY je.id`,
      )
      .all(paid.body.data.voucher_id);
    assert.deepEqual(entries, [
      { system_key: 'salary_expense', entry_type: 'DEBIT', amount: 15000 },
      { system_key: 'staff_advances', entry_type: 'CREDIT', amount: 3000 },
      { system_key: 'cash_in_hand', entry_type: 'CREDIT', amount: 12000 },
    ]);

    const again = await call(`/api/v1/staff-pay/${staffId}/pay`, {
      month: '2026-11',
      accountId: cash.id,
    });
    assert.equal(again.response.status, 409);

    const summary = (await call('/api/v1/staff-pay?month=2026-11')).body.data.find(
      (row) => row.id === Number(staffId),
    );
    assert.equal(summary.advanceDue, 0);
    assert.equal(summary.salaryPaid, true);
    assert.equal((await call(`/api/v1/staff-pay/${staffId}/history`)).body.data.length, 2);
    assert.equal(
      (await call('/api/v1/accounting/money-accounts')).body.data.find((row) => row.kind === 'CASH')
        .balance,
      -15000,
    );
  } finally {
    await context.close();
  }
});
