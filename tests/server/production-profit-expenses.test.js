import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { ExpenseService } from '../../src/server/modules/expenses/expense.service.js';
import { ProfitService } from '../../src/server/modules/profit/profit.service.js';
import { AccountingReportService } from '../../src/server/modules/accounting/accounting-report.service.js';
import { AccountingPostingEngine } from '../../src/server/modules/accounting/posting-engine.service.js';
import { DashboardService } from '../../src/server/modules/dashboard/dashboard.service.js';

const june = { dateFrom: '2026-06-01', dateTo: '2026-06-30' };

test('expense edits repost journals atomically and deletion removes both financial views', async () => {
  const context = await createTestContext();
  try {
    const expenses = new ExpenseService(context.db);
    const reports = new AccountingReportService(context.db);
    const profits = new ProfitService(context.db);
    const original = expenses.create({ expense_date: '2026-06-10', category: 'Rent', amount: 100 });
    const edited = expenses.update(original.id, { category: 'Salary', amount: 250 });
    assert.notEqual(edited.voucher_id, original.voucher_id);
    assert.equal(
      context.db.prepare('SELECT status FROM vouchers WHERE id = ?').get(original.voucher_id)
        .status,
      'CANCELLED',
    );
    assert.equal(reports.getProfitLoss(1, june.dateFrom, june.dateTo).expenses.total, 250);
    assert.equal(profits.summary(june).data.totalExpenses, 250);
    context.db
      .prepare(
        "INSERT INTO locked_periods (company_id, start_date, end_date, is_locked) VALUES (1, '2026-07-01', '2026-07-31', 1)",
      )
      .run();
    assert.throws(() => expenses.update(original.id, { expense_date: '2026-07-10', amount: 500 }), {
      code: 'PERIOD_LOCKED',
    });
    assert.equal(expenses.get(original.id).voucher_id, edited.voucher_id);
    assert.equal(reports.getProfitLoss(1, june.dateFrom, june.dateTo).expenses.total, 250);
    expenses.delete(original.id);
    assert.equal(reports.getProfitLoss(1, june.dateFrom, june.dateTo).expenses.total, 0);
    assert.equal(profits.summary(june).data.totalExpenses, 0);
  } finally {
    await context.close();
  }
});

test('profit combines workshop and direct sales and active journal expenses without duplicating legacy rows', async () => {
  const context = await createTestContext();
  try {
    const db = context.db;
    const customerId = db
      .prepare("INSERT INTO customers (name, phone) VALUES ('Profit customer', '9876543210')")
      .run().lastInsertRowid;
    const itemId = db
      .prepare("INSERT INTO inventory_items (sku, item_name) VALUES ('PROFIT-PART', 'Profit part')")
      .run().lastInsertRowid;
    const invoiceId = db
      .prepare(
        "INSERT INTO invoices (invoice_number, customer_id, invoice_date, status, revenue, cost_total, gross_profit) VALUES ('PROFIT-WORKSHOP', ?, '2026-06-10', 'FINALIZED', 200, 80, 120)",
      )
      .run(customerId).lastInsertRowid;
    db.prepare(
      'INSERT INTO profit_records (invoice_id, revenue, cost_total, gross_profit) VALUES (?, 200, 80, 120)',
    ).run(invoiceId);
    db.prepare(
      "INSERT INTO invoice_items (invoice_id, item_type, inventory_item_id, description, line_revenue, line_cost, line_profit) VALUES (?, 'PART', ?, 'Part', 200, 80, 120)",
    ).run(invoiceId, itemId);
    const directId = db
      .prepare(
        "INSERT INTO direct_invoices (invoice_number, company_id, customer_id, invoice_date, subtotal, gst_total, grand_total) VALUES ('PROFIT-DIRECT', 1, ?, '2026-06-11', 300, 0, 300)",
      )
      .run(customerId).lastInsertRowid;
    db.prepare(
      "INSERT INTO direct_invoice_items (direct_invoice_id, item_id, description, quantity, unit_price, gst_rate, gst_amount, line_total, cost_price) VALUES (?, ?, 'Part', 1, 300, 0, 0, 300, 90)",
    ).run(directId, itemId);
    db.prepare('UPDATE direct_invoice_items SET line_cost = 90 WHERE direct_invoice_id = ?').run(
      directId,
    );
    db.prepare(
      "INSERT INTO direct_invoices (invoice_number, company_id, customer_id, invoice_date, subtotal, gst_total, grand_total, status) VALUES ('PROFIT-CANCELLED', 1, ?, '2026-06-11', 900, 0, 900, 'CANCELLED')",
    ).run(customerId);
    const engine = new AccountingPostingEngine(db);
    const ledger = (key) => engine.ledgerResolver.getLedgerId(1, key);
    engine.post({
      companyId: 1,
      voucherType: 'Sales',
      voucherDate: '2026-06-10',
      entries: [
        { ledgerId: ledger('cash_in_hand'), type: 'DEBIT', amount: 500 },
        { ledgerId: ledger('parts_sales'), type: 'CREDIT', amount: 500 },
      ],
    });
    engine.post({
      companyId: 1,
      voucherType: 'Journal',
      voucherDate: '2026-06-10',
      entries: [
        { ledgerId: ledger('cogs'), type: 'DEBIT', amount: 170 },
        { ledgerId: ledger('inventory_stock'), type: 'CREDIT', amount: 170 },
      ],
    });
    new ExpenseService(db).create({ expense_date: '2026-06-10', category: 'Rent', amount: 40 });
    engine.post({
      companyId: 1,
      voucherType: 'Payment',
      voucherDate: '2026-06-10',
      entries: [
        { ledgerId: ledger('misc_expense'), type: 'DEBIT', amount: 10 },
        { ledgerId: ledger('cash_in_hand'), type: 'CREDIT', amount: 10 },
      ],
    });
    const profits = new ProfitService(db);
    const summary = profits.summary(june).data;
    assert.deepEqual(summary, {
      totalRevenue: 500,
      totalCost: 170,
      grossProfit: 330,
      totalExpenses: 50,
      netProfit: 280,
    });
    assert.equal(
      new AccountingReportService(db).getProfitLoss(1, june.dateFrom, june.dateTo).netProfit,
      summary.netProfit,
    );
    assert.deepEqual(profits.byMonth(june).data, [
      { month: '2026-06', revenue: 500, cost: 170, grossProfit: 330, expenses: 50, netProfit: 280 },
    ]);
    assert.equal(profits.byCustomer(june).data[0].profit, 330);
    assert.equal(profits.byInventoryItem(june).data[0].profit, 330);
    const dashboard = new DashboardService(db);
    assert.equal(dashboard.getSalesMetrics('2026-06-30').summary.invoicesThisMonth, 2);
    assert.equal(dashboard.getFinancialMetrics('2026-06-30').outstandingAmount, 300);
    db.prepare(
      "INSERT INTO expenses (expense_date, category, amount) VALUES ('2026-06-10', 'Rent', 25)",
    ).run();
    assert.equal(profits.summary(june).data.totalExpenses, 75);
  } finally {
    await context.close();
  }
});

test('expense-only months include active journal expenses once and exclude cancelled postings', async () => {
  const context = await createTestContext();
  try {
    const db = context.db;
    const expenses = new ExpenseService(db);
    const expense = expenses.create({ expense_date: '2026-06-10', category: 'Rent', amount: 40 });
    // Older imports may retain the voucher reference without the expense-side link.
    db.prepare('UPDATE expenses SET voucher_id = NULL WHERE id = ?').run(expense.id);
    const profits = new ProfitService(db);
    assert.equal(profits.summary(june).data.totalExpenses, 40);
    assert.deepEqual(profits.byMonth(june).data, [
      { month: '2026-06', revenue: 0, cost: 0, grossProfit: 0, expenses: 40, netProfit: -40 },
    ]);
    new AccountingPostingEngine(db).deleteVoucher(1, expense.voucher_id);
    assert.equal(profits.summary(june).data.totalExpenses, 0);
    const other = expenses.create({ expense_date: '2026-06-12', category: 'Salary', amount: 20 });
    db.prepare('UPDATE expenses SET voucher_id = NULL WHERE id = ?').run(other.id);
    expenses.update(other.id, { amount: 30 });
    assert.equal(profits.summary(june).data.totalExpenses, 30);
  } finally {
    await context.close();
  }
});

test('direct profit uses exact persisted line cost instead of rounding unit costs again', async () => {
  const context = await createTestContext();
  try {
    const db = context.db;
    const customer = db
      .prepare("INSERT INTO customers (name) VALUES ('Exact cost customer')")
      .run().lastInsertRowid;
    const item = db
      .prepare(
        "INSERT INTO inventory_items (sku, item_name) VALUES ('EXACT-COST', 'Exact cost part')",
      )
      .run().lastInsertRowid;
    const invoice = db
      .prepare(
        "INSERT INTO direct_invoices (invoice_number, company_id, customer_id, invoice_date, subtotal, gst_total, grand_total) VALUES ('EXACT-COST-DIR', 1, ?, '2026-06-10', 100, 0, 100)",
      )
      .run(customer).lastInsertRowid;
    db.prepare(
      "INSERT INTO direct_invoice_items (direct_invoice_id, item_id, description, quantity, unit_price, gst_rate, gst_amount, line_total, cost_price, line_cost) VALUES (?, ?, 'Exact cost part', 3, 33.333333, 0, 0, 100, 30, 90.01)",
    ).run(invoice, item);
    const profits = new ProfitService(db);
    assert.equal(profits.summary(june).data.totalCost, 90.01);
    assert.equal(profits.byCustomer(june).data[0].profit, 9.99);
    assert.equal(profits.byInventoryItem(june).data[0].profit, 9.99);
  } finally {
    await context.close();
  }
});

test('completed discounted returns reverse operational profit on return date and reconcile journals', async () => {
  const context = await createTestContext();
  try {
    const db = context.db;
    const customer = db
      .prepare("INSERT INTO customers (name) VALUES ('Return profit customer')")
      .run().lastInsertRowid;
    const item = db
      .prepare(
        "INSERT INTO inventory_items (sku, item_name) VALUES ('RETURN-PROFIT', 'Returned part')",
      )
      .run().lastInsertRowid;
    const warehouse = db.prepare('SELECT id FROM warehouses ORDER BY id LIMIT 1').get().id;
    const batch = db
      .prepare(
        "INSERT INTO inventory_batches (item_id, warehouse_id, batch_number, purchase_cost, selling_price, quantity) VALUES (?, ?, 'RETURN-PROFIT', 80, 250, 0)",
      )
      .run(item, warehouse).lastInsertRowid;
    const invoice = db
      .prepare(
        "INSERT INTO invoices (invoice_number, customer_id, invoice_date, status, revenue, cost_total, gross_profit) VALUES ('RETURN-PROFIT', ?, '2026-05-10', 'FINALIZED', 200, 80, 120)",
      )
      .run(customer).lastInsertRowid;
    db.prepare(
      'INSERT INTO profit_records (invoice_id, revenue, cost_total, gross_profit) VALUES (?, 200, 80, 120)',
    ).run(invoice);
    db.prepare(
      "INSERT INTO invoice_items (invoice_id, inventory_item_id, batch_id, item_type, description, quantity, unit_price, discount_amount, purchase_cost_snapshot, line_revenue, line_cost, line_profit) VALUES (?, ?, ?, 'PART', 'Returned part', 1, 250, 50, 80, 200, 80, 120)",
    ).run(invoice, item, batch);
    const ret = db
      .prepare(
        "INSERT INTO customer_returns (return_number, company_id, customer_id, invoice_id, return_date, status, total_refund_amount) VALUES ('RETURN-PROFIT', 1, ?, ?, '2026-06-10', 'COMPLETED', 200)",
      )
      .run(customer, invoice).lastInsertRowid;
    db.prepare(
      'INSERT INTO customer_return_items (customer_return_id, item_id, warehouse_id, batch_id, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, 1, 200, 200)',
    ).run(ret, item, warehouse, batch);
    const engine = new AccountingPostingEngine(db);
    const ledger = (key) => engine.ledgerResolver.getLedgerId(1, key);
    engine.post({
      companyId: 1,
      voucherType: 'Credit Note',
      voucherDate: '2026-06-10',
      referenceTable: 'customer_returns',
      referenceId: ret,
      entries: [
        { ledgerId: ledger('parts_sales'), type: 'DEBIT', amount: 200 },
        { ledgerId: ledger('cash_in_hand'), type: 'CREDIT', amount: 200 },
      ],
    });
    engine.post({
      companyId: 1,
      voucherType: 'Journal',
      voucherDate: '2026-06-10',
      referenceTable: 'customer_returns',
      referenceId: ret,
      entries: [
        { ledgerId: ledger('inventory_stock'), type: 'DEBIT', amount: 80 },
        { ledgerId: ledger('cogs'), type: 'CREDIT', amount: 80 },
      ],
    });
    const profits = new ProfitService(db);
    assert.deepEqual(profits.summary(june).data, {
      totalRevenue: -200,
      totalCost: -80,
      grossProfit: -120,
      totalExpenses: 0,
      netProfit: -120,
    });
    assert.equal(
      new AccountingReportService(db).getProfitLoss(1, june.dateFrom, june.dateTo).netProfit,
      -120,
    );
    assert.equal(profits.byMonth(june).data[0].netProfit, -120);
    for (const data of [
      profits.byCustomer(june).data,
      profits.byInventoryItem(june).data,
      profits.byVehicle(june).data,
      profits.byMechanic(june).data,
    ])
      assert.equal(data[0].profit, -120);
    assert.equal(
      new DashboardService(db).getFinancialMetrics('2026-06-30').thisMonth.revenue,
      -200,
    );
    db.prepare('UPDATE invoices SET grand_total = 200 WHERE id = ?').run(invoice);
    assert.equal(new DashboardService(db).getFinancialMetrics('2026-06-30').outstandingAmount, 0);
    assert.equal(
      profits.summary({ dateFrom: '2026-05-01', dateTo: '2026-06-30' }).data.grossProfit,
      0,
    );
    db.prepare("UPDATE customer_returns SET status = 'CANCELLED' WHERE id = ?").run(ret);
    assert.equal(profits.summary(june).data.totalRevenue, 0);
    db.prepare("UPDATE customer_returns SET status = 'DRAFT' WHERE id = ?").run(ret);
    assert.equal(profits.summary(june).data.totalRevenue, 0);
  } finally {
    await context.close();
  }
});

test('roundoff revenue belongs to operational gross and net profit', async () => {
  const context = await createTestContext();
  try {
    const engine = new AccountingPostingEngine(context.db);
    const ledger = (key) => engine.ledgerResolver.getLedgerId(1, key);
    engine.post({
      companyId: 1,
      voucherType: 'Journal',
      voucherDate: '2026-06-10',
      entries: [
        { ledgerId: ledger('cash_in_hand'), type: 'DEBIT', amount: 0.25 },
        { ledgerId: ledger('round_off'), type: 'CREDIT', amount: 0.25 },
      ],
    });
    const operational = new ProfitService(context.db).summary(june).data;
    const accounting = new AccountingReportService(context.db).getProfitLoss(
      1,
      june.dateFrom,
      june.dateTo,
    );
    assert.equal(accounting.revenue.total, 0.25);
    assert.equal(operational.totalRevenue, accounting.revenue.total);
    assert.equal(operational.grossProfit, accounting.grossProfit);
    assert.equal(operational.netProfit, accounting.netProfit);
  } finally {
    await context.close();
  }
});
