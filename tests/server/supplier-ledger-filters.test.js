import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { PurchasingService } from '../../src/server/modules/purchasing/purchasing.service.js';

test('supplier ledger date filters paginate matching entries without recalculating historical balances', async () => {
  const context = await createTestContext();
  try {
    const supplier = context.db
      .prepare("INSERT INTO suppliers(name) VALUES ('Dated supplier')")
      .run().lastInsertRowid;
    const service = new PurchasingService(context.db);
    for (const [date, balance] of [
      ['2026-09-30', 100],
      ['2026-10-01', 200],
      ['2026-10-10', 300],
      ['2026-10-11', 400],
    ]) {
      context.db
        .prepare(
          "INSERT INTO supplier_ledgers(supplier_id,entry_date,entry_type,debit,credit,balance_after) VALUES (?,?,'Purchase',0,100,?)",
        )
        .run(supplier, date, balance);
    }
    const query = { dateFrom: '2026-10-01', dateTo: '2026-10-10', pageSize: 1 };
    const first = service.getSupplierLedger(supplier, query);
    assert.equal(first.pagination.total, 2);
    assert.equal(first.pagination.totalPages, 2);
    assert.equal(first.data[0].balance_after, 300);
    assert.equal(
      service.getSupplierLedger(supplier, { ...query, page: 2 }).data[0].balance_after,
      200,
    );
    assert.equal(service.getSupplierLedger(supplier, { pageSize: 1 }).data[0].balance_after, 400);
    for (const dates of [
      { dateFrom: '2026-02-30' },
      { dateTo: 'garbage' },
      { dateFrom: '2026-10-10', dateTo: '2026-10-01' },
    ])
      assert.throws(() => service.getSupplierLedger(supplier, dates), /date|range/i);
  } finally {
    await context.close();
  }
});
