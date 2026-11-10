import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

async function session(context) {
  const login = await context.request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
  });
  const headers = { Authorization: `Bearer ${login.body.token}` };
  return (path, body, method = body ? 'POST' : 'GET') =>
    context.request(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

test('owner adds a bank account and records money in and out in plain terms', async () => {
  const context = await createTestContext();
  try {
    const call = await session(context);
    const bank = await call('/api/v1/accounting/money-accounts', { name: 'Test Bank Current' });
    assert.equal(bank.response.status, 201, JSON.stringify(bank.body));
    assert.equal(bank.body.data.kind, 'BANK');

    const duplicate = await call('/api/v1/accounting/money-accounts', {
      name: 'Test Bank Current',
    });
    assert.equal(duplicate.response.status, 409);

    const cash = (await call('/api/v1/accounting/money-accounts')).body.data.find(
      (row) => row.kind === 'CASH',
    );
    const moneyIn = await call('/api/v1/accounting/money-entries', {
      direction: 'IN',
      accountId: bank.body.data.id,
      party: 'owner',
      amount: 5000,
      date: '2026-11-11',
      note: 'Starting capital',
    });
    assert.equal(moneyIn.response.status, 201, JSON.stringify(moneyIn.body));
    assert.equal(moneyIn.body.data.account.balance, 5000);

    const loan = await call('/api/v1/accounting/money-entries', {
      direction: 'IN',
      accountId: cash.id,
      party: 'loan',
      amount: 2000,
      date: '2026-11-11',
    });
    assert.equal(loan.response.status, 201, JSON.stringify(loan.body));
    const moneyOut = await call('/api/v1/accounting/money-entries', {
      direction: 'OUT',
      accountId: cash.id,
      party: 'expense',
      amount: 300,
      date: '2026-11-11',
    });
    assert.equal(moneyOut.body.data.account.balance, 1700);

    for (const bad of [
      { direction: 'SIDEWAYS', accountId: cash.id, party: 'owner', amount: 1 },
      { direction: 'IN', accountId: cash.id, party: 'expense', amount: 1 },
      { direction: 'IN', accountId: cash.id, party: 'owner', amount: 0 },
      { direction: 'IN', accountId: 99999, party: 'owner', amount: 10 },
    ]) {
      assert.equal((await call('/api/v1/accounting/money-entries', bad)).response.status, 400);
    }

    // The existing customer receipt and supplier payment services accept the new bank account.
    const customerId = context.db
      .prepare("INSERT INTO customers (name, phone) VALUES ('Bank Payer', '9000080011')")
      .run().lastInsertRowid;
    const receipt = await call('/api/v1/accounting/receipts', {
      customerId,
      receiptDate: '2026-11-11',
      amount: 700,
      paymentMode: 'BANK',
      bankLedgerId: bank.body.data.id,
      autoAllocate: true,
    });
    assert.equal(receipt.response.status, 201, JSON.stringify(receipt.body));
    const supplierId = context.db
      .prepare(
        "INSERT INTO suppliers (name, phone, is_active) VALUES ('Bank Payee', '8000080011', 1)",
      )
      .run().lastInsertRowid;
    const payment = await call('/api/v1/accounting/payments', {
      supplierId,
      paymentDate: '2026-11-11',
      amount: 200,
      paymentMode: 'BANK',
      bankLedgerId: bank.body.data.id,
    });
    assert.equal(payment.response.status, 201, JSON.stringify(payment.body));
    const bankNow = (await call('/api/v1/accounting/money-accounts')).body.data.find(
      (row) => row.id === bank.body.data.id,
    );
    assert.equal(bankNow.balance, 5500);

    const renamed = await call(
      `/api/v1/accounting/money-accounts/${bank.body.data.id}`,
      { name: 'Test Bank Savings' },
      'PATCH',
    );
    assert.equal(renamed.body.data.name, 'Test Bank Savings');
    assert.equal(
      (await call(`/api/v1/accounting/money-accounts/${cash.id}`, { name: 'X' }, 'PATCH')).response
        .status,
      400,
    );
  } finally {
    await context.close();
  }
});

test('opening balances from previous books post one balanced journal', async () => {
  const context = await createTestContext();
  try {
    const call = await session(context);
    const customer = context.db
      .prepare("INSERT INTO customers (name, phone) VALUES ('Opening Customer', '9000080001')")
      .run().lastInsertRowid;
    const supplier = context.db
      .prepare(
        "INSERT INTO suppliers (name, phone, is_active) VALUES ('Opening Supplier', '8000080001', 1)",
      )
      .run().lastInsertRowid;
    const cash = (await call('/api/v1/accounting/money-accounts')).body.data.find(
      (row) => row.kind === 'CASH',
    );
    const result = await call('/api/v1/accounting/opening-balances', {
      date: '2026-11-11',
      lines: [
        { type: 'cash', id: cash.id, amount: 10000 },
        { type: 'customer', id: customer, amount: 2500 },
        { type: 'supplier', id: supplier, amount: 4000 },
      ],
    });
    assert.equal(result.response.status, 201, JSON.stringify(result.body));
    const totals = context.db
      .prepare(
        `SELECT SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS dr,
                SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) AS cr
         FROM journal_entries WHERE voucher_id = ?`,
      )
      .get(result.body.data.voucherId);
    assert.deepEqual(totals, { dr: 12500, cr: 12500 });
    const capital = context.db
      .prepare(
        "SELECT je.entry_type, je.amount FROM journal_entries je JOIN ledgers l ON l.id = je.ledger_id WHERE je.voucher_id = ? AND l.system_key = 'capital_account'",
      )
      .get(result.body.data.voucherId);
    assert.deepEqual(capital, { entry_type: 'CREDIT', amount: 8500 });
    assert.equal(
      (
        await call('/api/v1/accounting/opening-balances', {
          lines: [{ type: 'cash', id: cash.id, amount: -5 }],
        })
      ).response.status,
      400,
    );
  } finally {
    await context.close();
  }
});
