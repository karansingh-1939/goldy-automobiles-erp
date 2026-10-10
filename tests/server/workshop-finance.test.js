import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';
import { WorkshopFinanceService } from '../../src/server/modules/accounting/workshop-finance.service.js';
import { AccountingPostingEngine } from '../../src/server/modules/accounting/posting-engine.service.js';
import { localDate } from '../../src/server/shared/utils/local-date.js';

test('receivable ageing reconciles current credits and exposes unaged opening balances', async () => {
  const context = await createTestContext();
  try {
    const db = context.db;
    const service = new WorkshopFinanceService(db);
    const engine = new AccountingPostingEngine(db);
    const customerId = db
      .prepare("INSERT INTO customers (name, phone) VALUES ('Ageing Test', '9000000004')")
      .run().lastInsertRowid;
    const ledgerId = engine.getOrCreateCustomerLedger(1, customerId);
    const invoiceId = db
      .prepare(
        "INSERT INTO direct_invoices (invoice_number, company_id, customer_id, invoice_date, subtotal, gst_total, grand_total, status) VALUES ('AGE-INV', 1, ?, '2026-06-01', 100, 0, 100, 'UNPAID')",
      )
      .run(customerId).lastInsertRowid;
    engine.post({
      companyId: 1,
      voucherType: 'Sales',
      voucherDate: '2026-06-01',
      entries: [
        { ledgerId, type: 'DEBIT', amount: 100 },
        { ledgerId: 10, type: 'CREDIT', amount: 100 },
      ],
    });
    engine.post({
      companyId: 1,
      voucherType: 'Receipt',
      voucherDate: '2026-06-02',
      entries: [
        { ledgerId: 1, type: 'DEBIT', amount: 40 },
        { ledgerId, type: 'CREDIT', amount: 40 },
      ],
    });
    let result = service.ageing();
    assert.equal(result.totalDue, 60);
    assert.equal(result.documents.find((row) => row.id === invoiceId).outstanding, 60);
    assert.equal(result.customers.find((row) => row.customerId === customerId).due, 60);
    db.prepare('UPDATE ledgers SET opening_balance = 70 WHERE id = ?').run(ledgerId);
    result = service.ageing();
    assert.equal(result.totalDue, 130);
    assert.equal(result.buckets.unaged, 30);
    db.prepare("UPDATE direct_invoices SET status = 'CANCELLED' WHERE id = ?").run(invoiceId);
    assert.equal(service.ageing().documents.length, 0);
    assert.equal(service.ageing().buckets.unaged, 130);
  } finally {
    await context.close();
  }
});

test('daily cash counts exclude cancelled and future vouchers and retain immutable count snapshots', async () => {
  const context = await createTestContext();
  try {
    const engine = new AccountingPostingEngine(context.db);
    const service = new WorkshopFinanceService(context.db);
    const post = (date, amount) =>
      engine.post({
        companyId: 1,
        voucherType: 'Payment',
        voucherDate: date,
        entries: [
          { ledgerId: 13, type: 'DEBIT', amount },
          { ledgerId: 1, type: 'CREDIT', amount },
        ],
      });
    context.db.prepare('UPDATE ledgers SET opening_balance = 1000 WHERE id = 1').run();
    post('2026-06-01', 100);
    post('2026-06-02', 200);
    post('2026-06-03', 400);
    const cancelled = post('2026-06-02', 80);
    engine.deleteVoucher(1, cancelled.voucherId);
    const summary = service.cashSummary('2026-06-02');
    assert.equal(summary.opening, 900);
    assert.equal(summary.cashOut, 200);
    assert.equal(summary.expectedClosing, 700);
    assert.throws(() => service.saveCount({ date: '2026-06-02', countedCash: 690 }, 1), {
      code: 'CASH_VARIANCE_NOTE_REQUIRED',
    });
    const count = service.saveCount(
      { date: '2026-06-02', countedCash: 690, notes: 'Ten rupees short.' },
      1,
    );
    assert.equal(count.variance, -10);
    post('2026-06-02', 10);
    const updated = service.cashSummary('2026-06-02');
    assert.equal(updated.expectedClosing, 690);
    assert.equal(updated.counts[0].expected_cash, 700);
    assert.equal(updated.counts[0].variance, -10);
    assert.throws(() => service.cashSummary('2026-02-30'), { code: 'VALIDATION_ERROR' });
    assert.ok(localDate() >= '2026-06-02');
  } finally {
    await context.close();
  }
});
