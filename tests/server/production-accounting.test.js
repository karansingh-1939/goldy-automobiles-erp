import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { AccountingPostingEngine } from '../../src/server/modules/accounting/posting-engine.service.js';
import { AccountingReportService } from '../../src/server/modules/accounting/accounting-report.service.js';

test('financial statements exclude future and cancelled vouchers while preserving empty ledgers', async () => {
  const context = await createTestContext();
  try {
    const engine = new AccountingPostingEngine(context.db);
    const reports = new AccountingReportService(context.db);
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
    post('2026-05-15', 10);
    post('2026-06-15', 20);
    post('2026-07-15', 40);
    const cancelled = post('2026-06-20', 80);
    engine.deleteVoucher(1, cancelled.voucherId);
    const balances = context.db.prepare('SELECT * FROM ledger_balances ORDER BY ledger_id').all();
    assert.throws(() => engine.deleteVoucher(1, cancelled.voucherId), /already cancelled/);
    assert.deepEqual(
      context.db.prepare('SELECT * FROM ledger_balances ORDER BY ledger_id').all(),
      balances,
    );
    assert.equal(reports.getProfitLoss(1, '2026-06-01', '2026-06-30').expenses.total, 20);
    const tb = reports.getTrialBalance(1, '2026-06-30');
    assert.equal(tb.ledgers.find((l) => l.ledgerId === 13).debits, 30);
    assert.ok(tb.ledgers.some((l) => l.debits === 0 && l.credits === 0));
    assert.equal(tb.totals.isBalanced, true);
    const statement = reports.getLedgerStatement(1, 13, '2026-06-01', '2026-06-30');
    assert.equal(statement.openingBalance, 10);
    assert.equal(statement.totals.closingBalance, 30);
    assert.equal(reports.getBalanceSheet(1, '2026-06-30').totals.isBalanced, true);
  } finally {
    await context.close();
  }
});
