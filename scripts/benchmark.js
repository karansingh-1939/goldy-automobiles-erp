import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/server/database/migration-runner.js';
import { runSeeds } from '../src/server/database/seed-runner.js';
import { AccountingReportService } from '../src/server/modules/accounting/accounting-report.service.js';
import { ReconciliationService } from '../src/server/modules/accounting/reconciliation.service.js';
import { DirectBillingService } from '../src/server/modules/accounting/direct-billing.service.js';
import { CustomerReceiptService } from '../src/server/modules/accounting/customer-receipt.service.js';
import { SalesOrderService } from '../src/server/modules/sales-orders/sales-order.service.js';

// Setup file paths
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-benchmark-'));
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
const dbPath = path.join(tempDir, 'benchmark.sqlite');
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

console.log('Initializing stress benchmark database...');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

runMigrations(db);
await runSeeds(db);

// Warm admin and seed default references
const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'Admin'").get();
const bcrypt = await import('bcryptjs');
const passwordHash = await bcrypt.default.hash('Admin@12345', 12);
db.prepare(
  `
  INSERT INTO users (name, username, password_hash, role_id, is_active)
  VALUES (?, ?, ?, ?, 1)
`,
).run('System Administrator', 'admin', passwordHash, adminRole.id);

const reportService = new AccountingReportService(db);
const reconciliationService = new ReconciliationService(db);
const directBillingService = new DirectBillingService(db);
const receiptService = new CustomerReceiptService(db);
const salesOrderService = new SalesOrderService(db);

const metrics = {
  customerCount: 10000,
  itemCount: 10000,
  invoiceCount: 25000,
  receiptCount: 10000,
  salesOrderCount: 1000,
  databaseSizeMB: 0,
  durations: {
    seedingCustomers: 0,
    seedingInventory: 0,
    postingInvoices: 0,
    postingReceipts: 0,
    salesOrderCycles: 0,
    trialBalance: 0,
    profitLoss: 0,
    balanceSheet: 0,
    ledgerStatement: 0,
    reconciliationScan: 0,
  },
  results: {
    tbBalanced: false,
    bsBalanced: false,
    reconciliationHealthy: false,
  },
};

try {
  // 1. Seed Customers
  console.log(`Seeding ${metrics.customerCount} customers...`);
  const t0 = Date.now();
  db.transaction(() => {
    const insertCust = db.prepare(`
      INSERT INTO customers (name, phone, email)
      VALUES (?, ?, ?)
    `);
    for (let i = 1; i <= metrics.customerCount; i++) {
      insertCust.run(`Customer ${i}`, `9999000${String(i).padStart(4, '0')}`, `cust${i}@goldy.com`);
    }
  })();
  metrics.durations.seedingCustomers = Date.now() - t0;

  const maxBefore = db.prepare('SELECT COALESCE(MAX(id), 0) as max FROM inventory_items').get().max;

  // 2. Seed 1,000 Inventory Items & Warehouse Stock in a single transaction block
  console.log(`Seeding ${metrics.itemCount} inventory items...`);
  const t1 = Date.now();
  db.transaction(() => {
    const insertItem = db.prepare(`
      INSERT INTO inventory_items (sku, item_name, purchase_cost, selling_price, current_quantity, gst_rate, is_active)
      VALUES (?, ?, ?, ?, ?, 18, 1)
    `);
    const insertBatch = db.prepare(`
      INSERT INTO inventory_batches (item_id, warehouse_id, batch_number, purchase_cost, selling_price, quantity)
      VALUES (?, 1, 'BATCH-BENCH', ?, ?, ?)
    `);
    for (let i = 1; i <= metrics.itemCount; i++) {
      insertItem.run(`SKU-${i}`, `Part ${i}`, 100, 150, 100);
      insertBatch.run(maxBefore + i, 100, 150, 100);
    }
  })();
  metrics.durations.seedingInventory = Date.now() - t1;

  // 3. Post Invoices
  console.log(`Posting ${metrics.invoiceCount} direct invoices (Sales + COGS journals)...`);
  const t2 = Date.now();
  db.transaction(() => {
    for (let i = 1; i <= metrics.invoiceCount; i++) {
      // Map to rotating customer and item
      const custId = ((i - 1) % metrics.customerCount) + 1;
      const itemId = maxBefore + (((i - 1) % metrics.itemCount) + 1);

      directBillingService.createDirectInvoice({
        companyId: 1,
        customerId: custId,
        invoiceDate: '2026-06-20',
        narration: `Stress billing invoice ${i}`,
        createdBy: 1,
        items: [
          {
            itemId,
            description: `Part ${itemId}`,
            quantity: 2,
            unitPrice: 150,
            gstRate: 18,
            warehouseId: 1,
          },
          {
            itemId: null,
            description: 'Fitting Labor Service',
            quantity: 1,
            unitPrice: 50,
            gstRate: 18,
          },
        ],
      });
    }
  })();
  metrics.durations.postingInvoices = Date.now() - t2;

  // 4. Post Receipts
  console.log(`Posting ${metrics.receiptCount} customer receipts with auto-allocations...`);
  const t3 = Date.now();
  db.transaction(() => {
    for (let i = 1; i <= metrics.receiptCount; i++) {
      const custId = ((i - 1) % metrics.customerCount) + 1;
      receiptService.createReceipt({
        companyId: 1,
        customerId: custId,
        receiptDate: '2026-06-21',
        amount: 413, // (300 parts + 50 labor) * 1.18 = 413
        paymentMode: 'CASH',
        narration: `Payment matching receipt ${i}`,
        createdBy: 1,
        autoAllocate: true,
      });
    }
  })();
  metrics.durations.postingReceipts = Date.now() - t3;

  // 4b. Benchmark Quotation -> Sales Order -> Reservation -> Fulfillment -> Invoice
  console.log(`Processing ${metrics.salesOrderCount} Quotation to Invoice lifecycles...`);
  const t4 = Date.now();
  db.transaction(() => {
    for (let i = 1; i <= metrics.salesOrderCount; i++) {
      const custId = ((i - 1) % metrics.customerCount) + 1;
      const itemId = maxBefore + (((i - 1) % metrics.itemCount) + 1);

      // Create quote
      const quote = salesOrderService.createQuotation(
        {
          customerId: custId,
          quotationDate: '2026-06-20',
          validUntil: '2026-07-20',
          items: [{ itemId, quantity: 1, unitPrice: 150, gstRate: 18 }],
        },
        1,
      );

      // Revise quote
      const revision = salesOrderService.reviseQuotation(
        quote.id,
        {
          items: [{ itemId, quantity: 2, unitPrice: 150, gstRate: 18 }],
        },
        1,
      );

      // Accept / Convert quote
      const order = salesOrderService.convertQuotationToSalesOrder(
        revision.id,
        {
          warehouseId: 1,
        },
        1,
      );

      // Confirm (allocates reservation)
      const confirmed = salesOrderService.confirmSalesOrder(order.id, 1);

      // Shipment (dispatches stock)
      const shipment = salesOrderService.createShipment(
        confirmed.id,
        {
          shipmentDate: '2026-06-22',
          items: [{ salesOrderItemId: confirmed.items[0].id, quantity: 2 }],
        },
        1,
      );

      // Invoice shipment
      salesOrderService.createInvoiceForShipment(shipment.id, 1);
    }
  })();
  metrics.durations.salesOrderCycles = Date.now() - t4;

  // 5. Gather row counts
  const totalVouchers = db.prepare('SELECT COUNT(*) as count FROM vouchers').get().count;
  const totalJournals = db.prepare('SELECT COUNT(*) as count FROM journal_entries').get().count;
  const totalStockTxs = db
    .prepare('SELECT COUNT(*) as count FROM inventory_transactions')
    .get().count;

  // Calculate file sizes
  const stats = fs.statSync(dbPath);
  metrics.databaseSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;

  // 6. Benchmark reporting queries
  console.log('Benchmarking report compilation latencies...');

  const tbT0 = Date.now();
  const tb = reportService.getTrialBalance(1, '2026-06-30');
  metrics.durations.trialBalance = Date.now() - tbT0;
  metrics.results.tbBalanced = tb.totals.isBalanced;

  const plT0 = Date.now();
  reportService.getProfitLoss(1, '2026-06-01', '2026-06-30');
  metrics.durations.profitLoss = Date.now() - plT0;

  const bsT0 = Date.now();
  const bs = reportService.getBalanceSheet(1, '2026-06-30');
  metrics.durations.balanceSheet = Date.now() - bsT0;
  metrics.results.bsBalanced = bs.totals.isBalanced;

  const lT0 = Date.now();
  reportService.getLedgerStatement(1, 1, '2026-06-01', '2026-06-30');
  metrics.durations.ledgerStatement = Date.now() - lT0;

  const rT0 = Date.now();
  const recon = reconciliationService.runReconciliation(1);
  metrics.durations.reconciliationScan = Date.now() - rT0;
  metrics.results.reconciliationHealthy = recon.isHealthy;

  // 7. Output findings into markdown file
  const reportMarkdown = `# Goldy Automobiles ERP - Scale & Stress Benchmarks Report

This report summarizes stress benchmark measurements performed on a simulated high-volume SQLite database.

## 1. Dataset Dimensions
- **Customers**: ${metrics.customerCount.toLocaleString()}
- **Inventory Items**: ${metrics.itemCount.toLocaleString()}
- **Counter Invoices**: ${metrics.invoiceCount.toLocaleString()}
- **Customer Receipts**: ${metrics.receiptCount.toLocaleString()}
- **Vouchers Created**: ${totalVouchers.toLocaleString()}
- **Journal Entries Created**: ${totalJournals.toLocaleString()}
- **Inventory Transactions**: ${totalStockTxs.toLocaleString()}
- **Database File Size**: ${metrics.databaseSizeMB} MB

## 2. Ingestion Performance (Throughput)
- **Customer Seeding**: ${metrics.durations.seedingCustomers} ms (${Math.round(metrics.customerCount / (metrics.durations.seedingCustomers / 1000))} inserts/sec)
- **Inventory Seeding**: ${metrics.durations.seedingInventory} ms (${Math.round(metrics.itemCount / (metrics.durations.seedingInventory / 1000))} inserts/sec)
- **Invoice Generation**: ${metrics.durations.postingInvoices} ms (${Math.round(metrics.invoiceCount / (metrics.durations.postingInvoices / 1000))} vouchers/sec)
- **Receipt Postings & FIFO Allocations**: ${metrics.durations.postingReceipts} ms (${Math.round(metrics.receiptCount / (metrics.durations.postingReceipts / 1000))} receipts/sec)
- **Sales Order Lifecycles (Quote -> Revise -> Confirm -> Ship -> Invoice)**: ${metrics.durations.salesOrderCycles} ms (${Math.round(metrics.salesOrderCount / (metrics.durations.salesOrderCycles / 1000))} orders/sec)

## 3. Financial Reporting Latencies (Read Benchmark)
- **Trial Balance Compilation**: **${metrics.durations.trialBalance} ms** (Balanced: \`${metrics.results.tbBalanced}\`)
- **Profit & Loss Aggregation**: **${metrics.durations.profitLoss} ms**
- **Balance Sheet Compilation**: **${metrics.durations.balanceSheet} ms** (Balanced: \`${metrics.results.bsBalanced}\`)
- **Ledger Statement Query**: **${metrics.durations.ledgerStatement} ms**
- **System Reconciliation Audit**: **${metrics.durations.reconciliationScan} ms** (Healthy: \`${metrics.results.reconciliationHealthy}\`)

## 4. Engineering Conclusion
Measurements above reflect this run and machine; compare repeated runs before drawing performance conclusions.
`;

  const reportDir = path.resolve('dist/reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const artifactPath = path.join(reportDir, 'stress-benchmark.md');
  fs.writeFileSync(artifactPath, reportMarkdown);
  console.log(`Stress benchmark complete. Report written to ${artifactPath}`);
} finally {
  db.close();
  try {
    fs.unlinkSync(dbPath);
    fs.rmdirSync(tempDir);
  } catch (e) {
    // Best-effort cleanup; preserve the original operation result.
  }
}
