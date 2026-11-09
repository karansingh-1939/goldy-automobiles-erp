import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createTestContext } from './helpers.js';
import { JobCardService } from '../../src/server/modules/job-cards/job-card.service.js';
import { PurchasingService } from '../../src/server/modules/purchasing/purchasing.service.js';
import { ReturnsService } from '../../src/server/modules/returns/returns.service.js';
import { AllocationService } from '../../src/server/modules/accounting/allocation.service.js';
import { CustomerReceiptService } from '../../src/server/modules/accounting/customer-receipt.service.js';
import { DirectBillingService } from '../../src/server/modules/accounting/direct-billing.service.js';
import { localDate } from '../../src/server/shared/utils/local-date.js';

async function fixture() {
  const context = await createTestContext();
  const db = context.db;
  const user = db.prepare("SELECT id FROM users WHERE username = 'admin'").get().id;
  const customer = db
    .prepare("INSERT INTO customers(name, state) VALUES ('Audit Customer', 'Haryana')")
    .run().lastInsertRowid;
  const supplier = db
    .prepare("INSERT INTO suppliers(name, state) VALUES ('Audit Supplier', 'Haryana')")
    .run().lastInsertRowid;
  const otherSupplier = db
    .prepare("INSERT INTO suppliers(name, state) VALUES ('Other Supplier', 'Haryana')")
    .run().lastInsertRowid;
  const warehouse = db
    .prepare("INSERT INTO warehouses(name, code) VALUES ('Audit Warehouse', 'AUDIT')")
    .run().lastInsertRowid;
  const vehicle = db
    .prepare("INSERT INTO vehicles(customer_id, registration_number) VALUES (?, 'AUDIT-01')")
    .run(customer).lastInsertRowid;
  const item = db
    .prepare(
      "INSERT INTO inventory_items(sku,item_name,purchase_cost,selling_price,gst_rate) VALUES ('AUDIT','Audit Filter',100,200,18)",
    )
    .run().lastInsertRowid;
  const purchasing = new PurchasingService(db);
  const receipt = purchasing.createReceipt(
    {
      supplier_id: supplier,
      items: [
        {
          item_id: item,
          warehouse_id: warehouse,
          batch_number: 'AUDIT-A',
          quantity: 10,
          purchase_cost: 100,
          selling_price: 200,
          gst_rate: 18,
        },
        {
          item_id: item,
          warehouse_id: warehouse,
          batch_number: 'AUDIT-B',
          quantity: 10,
          purchase_cost: 100,
          selling_price: 300,
          gst_rate: 18,
        },
      ],
    },
    user,
  );
  const batches = receipt.items.map((row) => row.batch_id);
  const jobs = new JobCardService(db);
  const returns = new ReturnsService(db);
  function invoice(twoLines = false) {
    const job = jobs.create(
      { customer_id: customer, vehicle_id: vehicle, complaint: 'Audit', odometer_reading: 1 },
      user,
    );
    jobs.addPart(
      job.id,
      { inventory_item_id: item, batch_id: batches[0], quantity: 1, selling_price: 200 },
      user,
    );
    if (twoLines)
      jobs.addPart(
        job.id,
        { inventory_item_id: item, batch_id: batches[1], quantity: 2, selling_price: 300 },
        user,
      );
    const result = jobs.finalize(job.id, user).invoice;
    result.items = db
      .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id')
      .all(result.id);
    return result;
  }
  return {
    ...context,
    user,
    customer,
    supplier,
    otherSupplier,
    warehouse,
    item,
    batches,
    receipt,
    jobs,
    returns,
    invoice,
  };
}

test('returns identify original invoice lines, and reject ambiguous legacy SKU selection', async () => {
  const f = await fixture();
  try {
    const inv = f.invoice(true);
    assert.throws(
      () =>
        f.returns.createCustomerReturn(
          { invoiceId: inv.id, items: [{ itemId: f.item, quantity: 1 }] },
          f.user,
        ),
      /invoice line/i,
    );
    for (const line of inv.items) {
      const ret = f.returns.createCustomerReturn(
        { invoiceId: inv.id, items: [{ invoiceItemId: line.id, quantity: line.quantity }] },
        f.user,
      );
      assert.equal(ret.items[0].invoice_item_id, line.id);
      assert.equal(ret.total_refund_amount, line.line_total);
      f.returns.completeCustomerReturn(ret.id, f.user);
    }
    assert.throws(
      () =>
        f.returns.createCustomerReturn(
          { invoiceId: inv.id, items: [{ invoiceItemId: inv.items[1].id, quantity: 1 }] },
          f.user,
        ),
      /remaining: 0/,
    );
  } finally {
    await f.close();
  }
});

test('credit notes reduce document balances, receipt ceilings and payment status', async () => {
  const f = await fixture();
  try {
    const inv = f.invoice();
    const allocations = new AllocationService(f.db);
    const ret = f.returns.createCustomerReturn(
      { invoiceId: inv.id, items: [{ itemId: f.item, quantity: 0.5 }] },
      f.user,
    );
    f.returns.completeCustomerReturn(ret.id, f.user);
    assert.equal(allocations.getOutstandingReceivables(1, f.customer)[0].outstandingAmount, 118);
    const payment = new CustomerReceiptService(f.db).createReceipt({
      customerId: f.customer,
      receiptDate: localDate(),
      amount: 236,
      paymentMode: 'CASH',
      createdBy: f.user,
    });
    assert.throws(
      () =>
        allocations.allocateReceiptManual(payment.receiptId, [
          { documentType: 'job_card_invoice', documentId: inv.id, allocatedAmount: 236 },
        ]),
      /outstanding/,
    );
    allocations.allocateReceiptManual(payment.receiptId, [
      { documentType: 'job_card_invoice', documentId: inv.id, allocatedAmount: 118 },
    ]);
    assert.equal(
      f.db.prepare('SELECT payment_status FROM invoices WHERE id=?').get(inv.id).payment_status,
      'PAID',
    );
    new CustomerReceiptService(f.db).cancelReceipt(payment.receiptId);
    assert.equal(allocations.getOutstandingReceivables(1, f.customer)[0].outstandingAmount, 118);
  } finally {
    await f.close();
  }
});

test('return after full payment preserves cash receipt and leaves customer credit unallocated', async () => {
  const f = await fixture();
  try {
    const inv = f.invoice();
    const payment = new CustomerReceiptService(f.db).createReceipt({
      customerId: f.customer,
      receiptDate: localDate(),
      amount: 236,
      paymentMode: 'CASH',
      autoAllocate: true,
      createdBy: f.user,
    });
    const ret = f.returns.createCustomerReturn(
      { invoiceId: inv.id, items: [{ itemId: f.item, quantity: 1 }] },
      f.user,
    );
    f.returns.completeCustomerReturn(ret.id, f.user);
    assert.equal(
      f.db
        .prepare('SELECT unallocated_amount FROM customer_receipts WHERE id=?')
        .get(payment.receiptId).unallocated_amount,
      236,
    );
    assert.equal(
      f.db.prepare('SELECT amount_paid, payment_status FROM invoices WHERE id=?').get(inv.id)
        .amount_paid,
      0,
    );
    assert.equal(
      f.db.prepare('SELECT payment_status FROM invoices WHERE id=?').get(inv.id).payment_status,
      'PAID',
    );
    assert.deepEqual(new AllocationService(f.db).getOutstandingReceivables(1, f.customer), []);
  } finally {
    await f.close();
  }
});

test('partial return releases only excess allocations and receipt cancellation preserves the credit', async () => {
  const f = await fixture();
  try {
    const inv = f.invoice();
    const receipts = new CustomerReceiptService(f.db);
    const first = receipts.createReceipt({
      customerId: f.customer,
      receiptDate: localDate(),
      amount: 100,
      paymentMode: 'CASH',
      autoAllocate: true,
      createdBy: f.user,
    });
    const second = receipts.createReceipt({
      customerId: f.customer,
      receiptDate: localDate(),
      amount: 136,
      paymentMode: 'CASH',
      autoAllocate: true,
      createdBy: f.user,
    });
    const ret = f.returns.createCustomerReturn(
      { invoiceId: inv.id, items: [{ invoiceItemId: inv.items[0].id, quantity: 0.5 }] },
      f.user,
    );
    f.returns.completeCustomerReturn(ret.id, f.user);
    assert.equal(
      f.db.prepare('SELECT amount_paid FROM invoices WHERE id=?').get(inv.id).amount_paid,
      118,
    );
    assert.equal(
      f.db
        .prepare('SELECT allocated_amount FROM receipt_allocations WHERE customer_receipt_id=?')
        .get(second.receiptId).allocated_amount,
      18,
    );
    assert.equal(
      f.db
        .prepare('SELECT unallocated_amount FROM customer_receipts WHERE id=?')
        .get(second.receiptId).unallocated_amount,
      118,
    );
    receipts.cancelReceipt(second.receiptId);
    assert.equal(
      new AllocationService(f.db).getOutstandingReceivables(1, f.customer)[0].outstandingAmount,
      18,
    );
    receipts.cancelReceipt(first.receiptId);
    assert.equal(
      new AllocationService(f.db).getOutstandingReceivables(1, f.customer)[0].outstandingAmount,
      118,
    );
  } finally {
    await f.close();
  }
});

test('supplier returns require purchase ownership and immutable source valuation', async () => {
  const f = await fixture();
  try {
    assert.throws(
      () =>
        f.returns.createSupplierReturn(
          {
            supplierId: f.otherSupplier,
            items: [{ itemId: f.item, batchId: f.batches[0], quantity: 1 }],
          },
          f.user,
        ),
      /supplier/i,
    );
    f.db.prepare('UPDATE inventory_items SET gst_rate=28 WHERE id=?').run(f.item);
    f.db.prepare('UPDATE inventory_batches SET purchase_cost=150 WHERE id=?').run(f.batches[0]);
    const ret = f.returns.createSupplierReturn(
      { supplierId: f.supplier, items: [{ itemId: f.item, batchId: f.batches[0], quantity: 1 }] },
      f.user,
    );
    assert.equal(ret.total_refund_amount, 118);
    assert.equal(ret.items[0].unit_cost, 100);
    f.returns.completeSupplierReturn(ret.id, f.user);
  } finally {
    await f.close();
  }
});

test('direct invoices enforce customer credit limit and rollback documents and stock', async () => {
  const f = await fixture();
  try {
    f.db.prepare('UPDATE customers SET credit_limit=0 WHERE id=?').run(f.customer);
    const before = f.db
      .prepare('SELECT quantity FROM inventory_batches WHERE id=?')
      .get(f.batches[0]).quantity;
    assert.throws(
      () =>
        new DirectBillingService(f.db).createDirectInvoice({
          customerId: f.customer,
          invoiceDate: localDate(),
          items: [{ itemId: f.item, warehouseId: f.warehouse, quantity: 1, unitPrice: 200 }],
          createdBy: f.user,
        }),
      /credit limit/,
    );
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM direct_invoices').get().n, 0);
    assert.equal(
      f.db.prepare('SELECT quantity FROM inventory_batches WHERE id=?').get(f.batches[0]).quantity,
      before,
    );
  } finally {
    await f.close();
  }
});

test('migration preserves historical invoice and cash amounts while freeing return credit', async () => {
  const f = await fixture();
  try {
    const inv = f.invoice();
    const receipt = new CustomerReceiptService(f.db).createReceipt({
      customerId: f.customer,
      receiptDate: localDate(),
      amount: 236,
      paymentMode: 'CASH',
      createdBy: f.user,
    });
    const ret = f.returns.createCustomerReturn(
      { invoiceId: inv.id, items: [{ itemId: f.item, quantity: 1 }] },
      f.user,
    );
    f.returns.completeCustomerReturn(ret.id, f.user);
    // Reproduce the legacy state: payment allocations ignored the completed credit note.
    f.db
      .prepare(
        "INSERT INTO receipt_allocations(customer_receipt_id,document_type,document_id,allocated_amount) VALUES (?,'job_card_invoice',?,236)",
      )
      .run(receipt.receiptId, inv.id);
    f.db
      .prepare("UPDATE invoices SET amount_paid=236,payment_status='PAID' WHERE id=?")
      .run(inv.id);
    f.db
      .prepare('UPDATE customer_receipts SET unallocated_amount=0 WHERE id=?')
      .run(receipt.receiptId);
    f.db.exec(
      'DROP INDEX idx_customer_return_items_invoice_line; DROP INDEX idx_supplier_return_items_source; ALTER TABLE customer_return_items DROP COLUMN invoice_item_id;',
    );
    for (const col of [
      'source_table',
      'source_item_id',
      'cgst_amount',
      'sgst_amount',
      'igst_amount',
    ])
      f.db.exec(`ALTER TABLE supplier_return_items DROP COLUMN ${col}`);
    const beforeJournal = f.db
      .prepare('SELECT SUM(amount) AS total FROM journal_entries')
      .get().total;
    f.db.exec(
      fs.readFileSync(
        new URL(
          '../../src/server/database/migrations/043_return_invoice_lines.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    assert.equal(
      f.db.prepare('SELECT grand_total,amount_paid FROM invoices WHERE id=?').get(inv.id)
        .grand_total,
      236,
    );
    assert.equal(
      f.db.prepare('SELECT amount_paid FROM invoices WHERE id=?').get(inv.id).amount_paid,
      0,
    );
    assert.equal(
      f.db
        .prepare('SELECT amount,unallocated_amount FROM customer_receipts WHERE id=?')
        .get(receipt.receiptId).amount,
      236,
    );
    assert.equal(
      f.db
        .prepare('SELECT unallocated_amount FROM customer_receipts WHERE id=?')
        .get(receipt.receiptId).unallocated_amount,
      236,
    );
    assert.equal(
      f.db
        .prepare('SELECT invoice_item_id FROM customer_return_items WHERE customer_return_id=?')
        .get(ret.id).invoice_item_id,
      inv.items[0].id,
    );
    assert.equal(
      f.db.prepare('SELECT SUM(amount) AS total FROM journal_entries').get().total,
      beforeJournal,
    );
  } finally {
    await f.close();
  }
});

test('supplier return ambiguous purchase evidence requires explicit source and retains original GST mode', async () => {
  const f = await fixture();
  try {
    const secondReceipt = new PurchasingService(f.db).createReceipt(
      {
        supplier_id: f.supplier,
        items: [
          {
            item_id: f.item,
            warehouse_id: f.warehouse,
            batch_number: 'AUDIT-A',
            quantity: 5,
            purchase_cost: 200,
            selling_price: 300,
            gst_rate: 5,
          },
        ],
      },
      f.user,
    );
    assert.throws(
      () =>
        f.returns.createSupplierReturn(
          {
            supplierId: f.supplier,
            items: [{ itemId: f.item, batchId: f.batches[0], quantity: 1 }],
          },
          f.user,
        ),
      /purchaseItemId/,
    );
    f.db.prepare("UPDATE suppliers SET state='Delhi' WHERE id=?").run(f.supplier);
    const ret = f.returns.createSupplierReturn(
      {
        supplierId: f.supplier,
        items: [
          {
            itemId: f.item,
            batchId: f.batches[0],
            purchaseItemId: secondReceipt.items[0].id,
            quantity: 1,
          },
        ],
      },
      f.user,
    );
    assert.equal(ret.total_refund_amount, 210);
    assert.equal(ret.items[0].igst_amount, 0);
    assert.equal(ret.items[0].cgst_amount, 5);
    assert.equal(ret.items[0].sgst_amount, 5);
    f.returns.completeSupplierReturn(ret.id, f.user);
  } finally {
    await f.close();
  }
});
