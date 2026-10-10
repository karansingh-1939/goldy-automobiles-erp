import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { DirectBillingService } from '../../src/server/modules/accounting/direct-billing.service.js';
import { InventoryService } from '../../src/server/modules/inventory/inventory.service.js';
import { JobCardService } from '../../src/server/modules/job-cards/job-card.service.js';
import { CustomerReceiptService } from '../../src/server/modules/accounting/customer-receipt.service.js';
import { ProfitService } from '../../src/server/modules/profit/profit.service.js';

test('counter sale costs match movements and cancellation restores every consumed batch', async () => {
  const c = await createTestContext();
  try {
    const customerId = c.db
      .prepare("INSERT INTO customers (name) VALUES ('Counter customer')")
      .run().lastInsertRowid;
    const inventory = new InventoryService(c.db);
    const item = inventory.createItem(
      {
        sku: 'WAC-TEST',
        item_name: 'Test part',
        purchase_cost: 100,
        selling_price: 300,
        gst_rate: 0,
      },
      1,
    );
    const a = inventory.createOpeningStock(
      { item_id: item.id, warehouse_id: 1, batch_number: 'A', quantity: 1, unit_cost: 100 },
      1,
    );
    const b = inventory.createOpeningStock(
      { item_id: item.id, warehouse_id: 1, batch_number: 'B', quantity: 2, unit_cost: 200 },
      1,
    );
    const openingValue = c.db
      .prepare(
        "SELECT SUM(je.amount) AS value FROM journal_entries je JOIN vouchers v ON v.id=je.voucher_id JOIN ledgers l ON l.id=je.ledger_id WHERE v.reference_table='stock_adjustments' AND l.system_key='inventory_stock' AND je.entry_type='DEBIT'",
      )
      .get().value;
    assert.equal(openingValue, 500);
    const billing = new DirectBillingService(c.db);
    const invoice = billing.createDirectInvoice({
      customerId,
      invoiceDate: '2026-06-15',
      createdBy: 1,
      items: [{ itemId: item.id, warehouseId: 1, quantity: 2, unitPrice: 300, gstRate: 0 }],
    });
    const movementCost = c.db
      .prepare(
        "SELECT ROUND(SUM(quantity * unit_cost), 2) AS cost FROM inventory_transactions WHERE reference_type = 'direct_invoices' AND reference_id = ? AND direction = 'OUT'",
      )
      .get(invoice.invoiceId).cost;
    const cogs = c.db
      .prepare("SELECT amount FROM journal_entries WHERE voucher_id = ? AND entry_type = 'DEBIT'")
      .get(invoice.cogsVoucherId).amount;
    assert.equal(cogs, movementCost);
    const xml = new ProfitService(c.db).tallyExport({
      dateFrom: '2026-06-15',
      dateTo: '2026-06-15',
    });
    assert.match(xml, /<AMOUNT>-600.00<\/AMOUNT>/);
    assert.equal(
      [...xml.matchAll(/<AMOUNT>([-\d.]+)<\/AMOUNT>/g)].reduce(
        (sum, match) => sum + Number(match[1]),
        0,
      ),
      0,
    );
    billing.cancelDirectInvoice(invoice.invoiceId, 1, 1);
    assert.equal(
      c.db.prepare('SELECT quantity FROM inventory_batches WHERE id = ?').get(a.batch.id).quantity,
      1,
    );
    assert.equal(
      c.db.prepare('SELECT quantity FROM inventory_batches WHERE id = ?').get(b.batch.id).quantity,
      2,
    );
    assert.equal(inventory.getItem(item.id).current_quantity, 3);
    assert.throws(() => billing.cancelDirectInvoice(invoice.invoiceId, 1, 1), /already cancelled/);
  } finally {
    await c.close();
  }
});

test('workshop interstate tax is posted as IGST and paid invoice cancellation is blocked', async () => {
  const c = await createTestContext();
  try {
    const jobs = new JobCardService(c.db);
    const job = jobs.create(
      {
        customer_name: 'Interstate customer',
        registration_number: 'DL01AB9876',
        odometer_reading: 1,
      },
      1,
    );
    c.db.prepare("UPDATE customers SET state = 'Delhi' WHERE id = ?").run(job.customer_id);
    jobs.addLabour(job.id, { description: 'Service', labour_charge: 100, gst_rate: 18 }, 1);
    const { invoice } = jobs.finalize(job.id, 1);
    assert.equal(invoice.igst_total, 18);
    assert.equal(invoice.cgst_total, 0);
    assert.equal(invoice.items[0].igst_amount, 18);
    const receipts = new CustomerReceiptService(c.db);
    const receipt = receipts.createReceipt({
      customerId: job.customer_id,
      receiptDate: invoice.invoice_date,
      amount: 118,
      paymentMode: 'CASH',
      createdBy: 1,
      autoAllocate: true,
    });
    assert.throws(() => jobs.cancelInvoice(invoice.id, 1), /payment|allocation/i);
    assert.equal(jobs.getInvoice(invoice.id).status, 'FINALIZED');
    receipts.cancelReceipt(receipt.receiptId);
    jobs.cancelInvoice(invoice.id, 1);
    assert.equal(jobs.getInvoice(invoice.id).status, 'CANCELLED');
  } finally {
    await c.close();
  }
});
