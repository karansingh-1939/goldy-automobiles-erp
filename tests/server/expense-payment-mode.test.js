import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

test('expenses paid by UPI or bank reduce the bank account, not cash', async () => {
  const context = await createTestContext();
  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const call = (path, body, method = 'POST') =>
      context.request(path, { method, headers, body: JSON.stringify(body) });
    const creditedLedger = (voucherId) =>
      context.db
        .prepare(
          "SELECT l.system_key FROM journal_entries je JOIN ledgers l ON l.id = je.ledger_id WHERE je.voucher_id = ? AND je.entry_type = 'CREDIT'",
        )
        .get(voucherId).system_key;

    const cash = await call('/api/v1/expenses', {
      expense_date: '2026-11-10',
      category: 'Electricity',
      amount: 900,
    });
    assert.equal(cash.response.status, 201, JSON.stringify(cash.body));
    assert.equal(creditedLedger(cash.body.data.voucher_id), 'cash_in_hand');

    // With only the starting bank account, UPI goes there without asking.
    const upi = await call('/api/v1/expenses', {
      expense_date: '2026-11-10',
      category: 'Internet',
      amount: 600,
      payment_mode: 'UPI',
    });
    assert.equal(upi.response.status, 201, JSON.stringify(upi.body));
    assert.equal(creditedLedger(upi.body.data.voucher_id), 'hdfc_bank');
    assert.equal(upi.body.data.payment_mode, 'UPI');

    // With two banks, the owner must choose which one paid.
    const second = await call('/api/v1/accounting/money-accounts', { name: 'Test Second Bank' });
    const unclear = await call('/api/v1/expenses', {
      expense_date: '2026-11-10',
      category: 'Rent',
      amount: 5000,
      payment_mode: 'BANK',
    });
    assert.equal(unclear.response.status, 400);
    assert.equal(unclear.body.error.code, 'BANK_ACCOUNT_REQUIRED');
    const chosen = await call('/api/v1/expenses', {
      expense_date: '2026-11-10',
      category: 'Rent',
      amount: 5000,
      payment_mode: 'BANK',
      payment_account_id: second.body.data.id,
    });
    assert.equal(chosen.response.status, 201, JSON.stringify(chosen.body));
    assert.match(creditedLedger(chosen.body.data.voucher_id), /^bank_/);

    const invalid = await call('/api/v1/expenses', {
      expense_date: '2026-11-10',
      category: 'Rent',
      amount: 10,
      payment_mode: 'CHEQUE',
    });
    assert.equal(invalid.response.status, 400);
  } finally {
    await context.close();
  }
});
