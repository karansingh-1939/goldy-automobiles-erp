import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';
import { AccountingReportService } from '../../src/server/modules/accounting/accounting-report.service.js';
import { ReconciliationService } from '../../src/server/modules/accounting/reconciliation.service.js';
import { DirectBillingService } from '../../src/server/modules/accounting/direct-billing.service.js';
import { CustomerReceiptService } from '../../src/server/modules/accounting/customer-receipt.service.js';

test('Accounting - Large Scale Stress & Reconciliation Audits', async () => {
  const context = await createTestContext();
  const db = context.db;

  const reportService = new AccountingReportService(db);
  const reconciliationService = new ReconciliationService(db);
  const directBillingService = new DirectBillingService(db);
  const receiptService = new CustomerReceiptService(db);

  try {
    const startSetup = Date.now();

    // 1. Seed 1,000 Customers in a single transaction block
    db.transaction(() => {
      const insertCustomer = db.prepare(`
        INSERT INTO customers (name, phone, email)
        VALUES (?, ?, ?)
      `);
      for (let i = 1; i <= 1000; i++) {
        insertCustomer.run(
          `Customer ${i}`,
          `9999000${String(i).padStart(3, '0')}`,
          `customer${i}@test.com`,
        );
      }
    })();

    // 2. Seed 1,000 Inventory Items & Warehouse Stock in a single transaction block
    db.transaction(() => {
      const insertItem = db.prepare(`
        INSERT INTO inventory_items (sku, item_name, purchase_cost, selling_price, current_quantity, average_cost, gst_rate, is_active)
        VALUES (?, ?, ?, ?, ?, 100, 18, 1)
      `);
      const insertBatch = db.prepare(`
        INSERT INTO inventory_batches (item_id, warehouse_id, batch_number, purchase_cost, selling_price, quantity)
        VALUES (?, 1, 'BATCH-01', ?, ?, ?)
      `);

      for (let i = 1; i <= 1000; i++) {
        insertItem.run(`SKU-${i}`, `Spare Part ${i}`, 100, 150, 50);
        insertBatch.run(i, 100, 150, 50);
      }
    })();

    // 3. Generate 1,000 Direct counter sales invoices (each selling parts and labor)
    // Run in a single transaction block to optimize SQLite disk writes
    db.transaction(() => {
      for (let i = 1; i <= 1000; i++) {
        directBillingService.createDirectInvoice({
          companyId: 1,
          customerId: i,
          invoiceDate: '2026-06-20',
          narration: `Stress test counter invoice ${i}`,
          createdBy: 1,
          items: [
            {
              itemId: i,
              description: `Spare Part ${i}`,
              quantity: 2,
              unitPrice: 150,
              gstRate: 18,
              warehouseId: 1,
            },
            {
              itemId: null,
              description: 'Fitting Labor Charge',
              quantity: 1,
              unitPrice: 50,
              gstRate: 18,
            },
          ],
        });
      }
    })();

    // 4. Generate 1,000 Customer Receipts (matching invoices using FIFO auto-allocation)
    db.transaction(() => {
      for (let i = 1; i <= 1000; i++) {
        receiptService.createReceipt({
          companyId: 1,
          customerId: i,
          receiptDate: '2026-06-21',
          amount: 413, // (300 parts + 50 labor) * 1.18 = 413
          paymentMode: 'CASH',
          narration: `Payment for invoice ${i}`,
          createdBy: 1,
          autoAllocate: true,
        });
      }
    })();

    const setupTime = Date.now() - startSetup;
    console.log(`STRESS TEST SETUP completed. Loaded 4,000+ vouchers in ${setupTime}ms.`);

    // Assert database contains large amount of rows
    const countVouchers = db.prepare('SELECT COUNT(*) as count FROM vouchers').get().count;
    const countJournals = db.prepare('SELECT COUNT(*) as count FROM journal_entries').get().count;
    assert.ok(countVouchers >= 3000, `Vouchers count should be large: ${countVouchers}`);
    assert.ok(countJournals >= 8000, `Journal entries count should be large: ${countJournals}`);

    // 5. Benchmark live reporting queries with this dataset (should execute in < 25ms due to indexes)
    const tbStart = Date.now();
    const tb = reportService.getTrialBalance(1, '2026-06-30');
    const tbDuration = Date.now() - tbStart;
    console.log(`BENCHMARK: Trial Balance generated in ${tbDuration}ms.`);
    assert.ok(tbDuration < 100, `Trial Balance execution is too slow: ${tbDuration}ms`);
    assert.equal(tb.totals.isBalanced, true, 'Trial Balance debits must equal credits');

    const plStart = Date.now();
    const pl = reportService.getProfitLoss(1, '2026-06-01', '2026-06-30');
    const plDuration = Date.now() - plStart;
    console.log(`BENCHMARK: Profit & Loss generated in ${plDuration}ms.`);
    assert.ok(plDuration < 100, `Profit & Loss execution is too slow: ${plDuration}ms`);
    assert.equal(
      pl.netProfit,
      150000,
      'Net profit check: (150-100)*2 parts profit + 50 labor profit = 150 per invoice * 1000 = 150000 gross. Wait, revenue is 350000, cost is 200000. Net profit is 150000.',
    );

    const bsStart = Date.now();
    const bs = reportService.getBalanceSheet(1, '2026-06-30');
    const bsDuration = Date.now() - bsStart;
    console.log(`BENCHMARK: Balance Sheet generated in ${bsDuration}ms.`);
    assert.ok(bsDuration < 100, `Balance Sheet execution is too slow: ${bsDuration}ms`);
    assert.equal(
      bs.totals.isBalanced,
      true,
      'Balance sheet equation Assets = Liabilities + Equity must balance',
    );

    // 6. Run Reconciliation Service and verify 100% data integrity health
    const recon = reconciliationService.runReconciliation(1);
    assert.equal(recon.isHealthy, true, 'System reconciliation audit must report 100% healthy');
    assert.equal(recon.checks.ledgers.passed, true);
    assert.equal(recon.checks.allocations.passed, true);
  } finally {
    await context.close();
  }
});
