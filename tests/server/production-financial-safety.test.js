import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { AccountingPostingEngine } from '../../src/server/modules/accounting/posting-engine.service.js';
import { AllocationService } from '../../src/server/modules/accounting/allocation.service.js';
import { PurchaseBillService } from '../../src/server/modules/accounting/purchase-bill.service.js';
import { SupplierPaymentService } from '../../src/server/modules/accounting/supplier-payment.service.js';
import { SupplierService } from '../../src/server/modules/accounting/supplier.service.js';
import { InventoryService } from '../../src/server/modules/inventory/inventory.service.js';
import { ReturnsService } from '../../src/server/modules/returns/returns.service.js';
import { PurchasingService } from '../../src/server/modules/purchasing/purchasing.service.js';
import { GstService } from '../../src/server/modules/gst/gst.service.js';
import { ProfitService } from '../../src/server/modules/profit/profit.service.js';

function fixtures(db) {
  const customerId = db
    .prepare("INSERT INTO customers(name, phone) VALUES ('Financial safety', '9000000011')")
    .run().lastInsertRowid;
  const itemId = db
    .prepare(
      "INSERT INTO inventory_items(sku,item_name,purchase_cost,selling_price,current_quantity,average_cost) VALUES ('SAFETY','Safety part',100,200,10,100)",
    )
    .run().lastInsertRowid;
  const warehouseId = db.prepare('SELECT id FROM warehouses LIMIT 1').get().id;
  const batchId = db
    .prepare(
      "INSERT INTO inventory_batches(item_id,warehouse_id,batch_number,purchase_cost,selling_price,quantity) VALUES (?,?,'SAFE',100,200,10)",
    )
    .run(itemId, warehouseId).lastInsertRowid;
  const invoiceId = db
    .prepare(
      "INSERT INTO invoices(invoice_number,customer_id,invoice_date,status,grand_total) VALUES ('SAFE-INV',?,'2026-10-01','FINALIZED',236)",
    )
    .run(customerId).lastInsertRowid;
  db.prepare(
    "INSERT INTO invoice_items(invoice_id,item_type,inventory_item_id,batch_id,description,quantity,unit_price,purchase_cost_snapshot,gst_rate,cgst_amount,sgst_amount,line_total) VALUES (?,'PART',?,?,'Safety part',1,200,100,18,18,18,236)",
  ).run(invoiceId, itemId, batchId);
  return { customerId, itemId, warehouseId, batchId, invoiceId };
}

test('untouched mixed-cost purchase cancellation tolerates WAC rounding and reverses its voucher', async () => {
  const context = await createTestContext();
  try {
    const { db } = context;
    const engine = new AccountingPostingEngine(db);
    const inventory = new InventoryService(db);
    const item = inventory.createItem(
      { sku: 'MIXED-CANCEL', item_name: 'Mixed cost', purchase_cost: 0, selling_price: 300 },
      1,
    );
    const supplier = new SupplierService(db, engine).createSupplier(1, {
      name: 'Mixed cost supplier',
    });
    const bills = new PurchaseBillService(db, engine, inventory);
    const bill = bills.createPurchaseBill(1, {
      supplierId: supplier.id,
      billNumber: 'MIXED-BILL',
      billDate: '2026-10-01',
      createdBy: 1,
      items: [
        {
          itemId: item.id,
          warehouseId: 1,
          quantity: 5,
          purchaseCost: 200,
          gstRate: 0,
          batchNumber: 'MIXED-HIGH',
        },
        {
          itemId: item.id,
          warehouseId: 1,
          quantity: 1,
          purchaseCost: 100,
          gstRate: 0,
          batchNumber: 'MIXED-LOW',
        },
      ],
    });
    assert.equal(inventory.getItem(item.id).average_cost, 183.33);
    bills.cancelPurchaseBill(1, bill.id, 1);
    assert.equal(inventory.getItem(item.id).current_quantity, 0);
    assert.equal(inventory.getItem(item.id).average_cost, 0);
    const secondBill = bills.createPurchaseBill(1, {
      supplierId: supplier.id,
      billNumber: 'THREE-LINE-BILL',
      billDate: '2026-10-01',
      createdBy: 1,
      items: [
        {
          itemId: item.id,
          warehouseId: 1,
          quantity: 1,
          purchaseCost: 100,
          gstRate: 0,
          batchNumber: 'THREE-A',
        },
        {
          itemId: item.id,
          warehouseId: 1,
          quantity: 1,
          purchaseCost: 200,
          gstRate: 0,
          batchNumber: 'THREE-B',
        },
        {
          itemId: item.id,
          warehouseId: 1,
          quantity: 11,
          purchaseCost: 300,
          gstRate: 0,
          batchNumber: 'THREE-C',
        },
      ],
    });
    bills.cancelPurchaseBill(1, secondBill.id, 1);
    assert.equal(inventory.getItem(item.id).current_quantity, 0);
    assert.equal(inventory.getItem(item.id).average_cost, 0);
    assert.equal(
      db.prepare('SELECT status FROM vouchers WHERE id=?').get(bill.voucher_id).status,
      'CANCELLED',
    );
  } finally {
    await context.close();
  }
});

test('purchase cancellation still rejects consumed-value conflicts and rolls back journals', async () => {
  const context = await createTestContext();
  try {
    const { db } = context;
    const f = fixtures(db);
    const engine = new AccountingPostingEngine(db);
    const inventory = new InventoryService(db);
    const supplier = new SupplierService(db, engine).createSupplier(1, {
      name: 'Consumed supplier',
    });
    const bills = new PurchaseBillService(db, engine, inventory);
    const bill = bills.createPurchaseBill(1, {
      supplierId: supplier.id,
      billNumber: 'CONSUMED-BILL',
      billDate: '2026-10-01',
      createdBy: 1,
      items: [
        {
          itemId: f.itemId,
          warehouseId: f.warehouseId,
          quantity: 10,
          purchaseCost: 200,
          gstRate: 0,
          batchNumber: 'CONSUMED-HIGH',
        },
      ],
    });
    inventory.stockOut({
      itemId: f.itemId,
      warehouseId: f.warehouseId,
      batchId: f.batchId,
      quantity: 10,
      transactionType: 'Consumption',
      userId: 1,
    });
    assert.throws(
      () => bills.cancelPurchaseBill(1, bill.id, 1),
      (error) => error.code === 'PURCHASE_VALUATION_CONFLICT',
    );
    assert.equal(inventory.getItem(f.itemId).current_quantity, 10);
    assert.equal(
      db.prepare('SELECT status FROM vouchers WHERE id=?').get(bill.voucher_id).status,
      'ACTIVE',
    );
  } finally {
    await context.close();
  }
});

test('purchase bill and supplier payment retain voucher links and cancellation reverses them', async () => {
  const context = await createTestContext();
  try {
    const { db } = context;
    const f = fixtures(db);
    const engine = new AccountingPostingEngine(db);
    const supplier = new SupplierService(db, engine).createSupplier(1, { name: 'Safety supplier' });
    const bills = new PurchaseBillService(db, engine, new InventoryService(db));
    const bill = bills.createPurchaseBill(1, {
      supplierId: supplier.id,
      billNumber: 'SAFE-BILL',
      billDate: '2026-10-01',
      createdBy: 1,
      items: [
        {
          itemId: f.itemId,
          warehouseId: f.warehouseId,
          quantity: 1,
          purchaseCost: 100,
          gstRate: 18,
          description: 'Safety part',
        },
      ],
    });
    assert.ok(bill.voucher_id);
    const payments = new SupplierPaymentService(db, engine, new AllocationService(db));
    const payment = payments.createPayment(1, {
      supplierId: supplier.id,
      paymentDate: '2026-10-01',
      amount: 118,
      paymentMode: 'CASH',
      createdBy: 1,
    });
    assert.ok(payment.voucher_id);
    payments.cancelPayment(1, payment.id);
    bills.cancelPurchaseBill(1, bill.id, 1);
    for (const id of [payment.voucher_id, bill.voucher_id])
      assert.equal(
        db.prepare('SELECT status FROM vouchers WHERE id=?').get(id).status,
        'CANCELLED',
      );
  } finally {
    await context.close();
  }
});

test('manual receipt allocation cannot resurrect a cancelled invoice', async () => {
  const context = await createTestContext();
  try {
    const { db } = context;
    const f = fixtures(db);
    const invoiceId = db
      .prepare(
        "INSERT INTO direct_invoices(invoice_number,company_id,customer_id,invoice_date,subtotal,gst_total,grand_total,status) VALUES ('CANCELLED-SAFE',1,?,'2026-10-01',100,0,100,'CANCELLED')",
      )
      .run(f.customerId).lastInsertRowid;
    const receiptId = db
      .prepare(
        "INSERT INTO customer_receipts(receipt_number,company_id,customer_id,receipt_date,amount,payment_mode,unallocated_amount,status) VALUES ('SAFE-REC',1,?,'2026-10-01',100,'CASH',100,'ACTIVE')",
      )
      .run(f.customerId).lastInsertRowid;
    assert.throws(
      () =>
        db.transaction(() =>
          new AllocationService(db).allocateReceiptManual(receiptId, [
            { documentType: 'direct_invoice', documentId: invoiceId, allocatedAmount: 100 },
          ]),
        )(),
      /cancelled|active/i,
    );
    assert.equal(
      db.prepare('SELECT status FROM direct_invoices WHERE id=?').get(invoiceId).status,
      'CANCELLED',
    );
  } finally {
    await context.close();
  }
});

test('manual allocation rolls back earlier lines when a later target is cancelled', async () => {
  const context = await createTestContext();
  try {
    const { db } = context;
    const f = fixtures(db);
    const cancelledId = db
      .prepare(
        "INSERT INTO invoices(invoice_number,customer_id,invoice_date,status,grand_total) VALUES ('SAFE-CANCELLED',?,'2026-10-01','CANCELLED',100)",
      )
      .run(f.customerId).lastInsertRowid;
    const receiptId = db
      .prepare(
        "INSERT INTO customer_receipts(receipt_number,company_id,customer_id,receipt_date,amount,payment_mode,unallocated_amount,status) VALUES ('ROLLBACK-REC',1,?,'2026-10-01',200,'CASH',200,'ACTIVE')",
      )
      .run(f.customerId).lastInsertRowid;
    assert.throws(
      () =>
        new AllocationService(db).allocateReceiptManual(receiptId, [
          { documentType: 'job_card_invoice', documentId: f.invoiceId, allocatedAmount: 100 },
          { documentType: 'job_card_invoice', documentId: cancelledId, allocatedAmount: 100 },
        ]),
      /cancelled|active/i,
    );
    assert.equal(
      db.prepare('SELECT amount_paid FROM invoices WHERE id=?').get(f.invoiceId).amount_paid,
      0,
    );
    assert.equal(
      db
        .prepare('SELECT COUNT(*) AS n FROM receipt_allocations WHERE customer_receipt_id=?')
        .get(receiptId).n,
      0,
    );
    assert.equal(
      db.prepare('SELECT unallocated_amount FROM customer_receipts WHERE id=?').get(receiptId)
        .unallocated_amount,
      200,
    );
  } finally {
    await context.close();
  }
});

test('duplicate customer return lines cannot refund more than the invoice quantity', async () => {
  const context = await createTestContext();
  try {
    const f = fixtures(context.db);
    assert.throws(
      () =>
        new ReturnsService(context.db).createCustomerReturn(
          {
            invoiceId: f.invoiceId,
            items: [
              { itemId: f.itemId, quantity: 1 },
              { itemId: f.itemId, quantity: 1 },
            ],
          },
          1,
        ),
      /duplicate|already|remaining/i,
    );
    assert.equal(context.db.prepare('SELECT COUNT(*) AS n FROM customer_returns').get().n, 0);
  } finally {
    await context.close();
  }
});

test('customer return refunds discounted value and restores weighted-average valuation', async () => {
  const c = await createTestContext();
  try {
    const f = fixtures(c.db);
    c.db
      .prepare(
        'UPDATE invoice_items SET line_revenue=180, discount_amount=20, cgst_amount=16.2, sgst_amount=16.2, line_total=212.4 WHERE invoice_id=?',
      )
      .run(f.invoiceId);
    c.db
      .prepare('UPDATE inventory_items SET current_quantity=10, average_cost=200 WHERE id=?')
      .run(f.itemId);
    const returns = new ReturnsService(c.db);
    const ret = returns.createCustomerReturn(
      { invoiceId: f.invoiceId, items: [{ itemId: f.itemId, quantity: 1 }] },
      1,
    );
    assert.equal(ret.total_refund_amount, 212.4);
    returns.completeCustomerReturn(ret.id, 1);
    assert.equal(
      c.db.prepare('SELECT average_cost FROM inventory_items WHERE id=?').get(f.itemId)
        .average_cost,
      190.91,
    );
  } finally {
    await c.close();
  }
});

test('customer return reverses output GST and uses original invoice cost', async () => {
  const context = await createTestContext();
  try {
    const { db } = context;
    const f = fixtures(db);
    db.prepare('UPDATE inventory_batches SET purchase_cost=150 WHERE id=?').run(f.batchId);
    const service = new ReturnsService(db);
    const ret = service.createCustomerReturn(
      {
        invoiceId: f.invoiceId,
        items: [{ itemId: f.itemId, quantity: 1, warehouseId: f.warehouseId, batchId: f.batchId }],
      },
      1,
    );
    service.completeCustomerReturn(ret.id, 1);
    db.prepare("UPDATE customer_returns SET return_date='2026-11-01' WHERE id=?").run(ret.id);
    const gst = new GstService(db);
    const october = gst.gstr1({ dateFrom: '2026-10-01', dateTo: '2026-10-31' }).data;
    assert.equal(october.filter((row) => row.documentType === 'CREDIT_NOTE').length, 0);
    const november = gst.gstr1({ dateFrom: '2026-11-01', dateTo: '2026-11-30' }).data;
    assert.equal(november.length, 1);
    assert.equal(november[0].documentType, 'CREDIT_NOTE');
    assert.equal(november[0].originalInvoiceNumber, 'SAFE-INV');
    assert.equal(november[0].taxableValue, -200);
    assert.equal(november[0].totalTax, -36);
    const outward = gst.gstr3b({ dateFrom: '2026-11-01', dateTo: '2026-11-30' }).data
      .outwardSupplies;
    assert.equal(outward.taxableValue, -200);
    assert.equal(outward.totalTax, -36);
    const xml = new ProfitService(db).tallyExport({ dateFrom: '2026-11-01', dateTo: '2026-11-30' });
    assert.match(xml, /VCHTYPE="Credit Note"/);
    assert.match(xml, /<AMOUNT>236.00<\/AMOUNT>/);
    const amounts = [...xml.matchAll(/<AMOUNT>([-\d.]+)<\/AMOUNT>/g)].map((match) =>
      Number(match[1]),
    );
    assert.equal(Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100), 0);
    const entries = db
      .prepare(
        "SELECT l.system_key,je.amount FROM journal_entries je JOIN ledgers l ON l.id=je.ledger_id JOIN vouchers v ON v.id=je.voucher_id WHERE v.reference_table='customer_returns' AND v.reference_id=?",
      )
      .all(ret.id);
    for (const key of ['cgst_output', 'sgst_output'])
      assert.equal(entries.find((e) => e.system_key === key)?.amount, 18);
    assert.equal(entries.find((e) => e.system_key === 'cogs').amount, 100);
    assert.equal(
      entries.some((e) => e.system_key === 'round_off'),
      false,
    );
  } finally {
    await context.close();
  }
});

test('damaged customer returns never become available selling stock', async () => {
  const context = await createTestContext();
  try {
    const f = fixtures(context.db);
    const service = new ReturnsService(context.db);
    const ret = service.createCustomerReturn(
      { invoiceId: f.invoiceId, items: [{ itemId: f.itemId, quantity: 1, condition: 'DAMAGED' }] },
      1,
    );
    service.completeCustomerReturn(ret.id, 1);
    assert.equal(
      context.db.prepare('SELECT quantity FROM inventory_batches WHERE id=?').get(f.batchId)
        .quantity,
      10,
    );
    assert.equal(
      context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id=?').get(f.itemId)
        .current_quantity,
      10,
    );
  } finally {
    await context.close();
  }
});

test('purchase return reverses inventory, supplier payable and input GST journals', async () => {
  const context = await createTestContext();
  try {
    const { db } = context;
    const f = fixtures(db);
    const supplier = new SupplierService(db, new AccountingPostingEngine(db)).createSupplier(1, {
      name: 'Return supplier',
    });
    const service = new PurchasingService(db);
    const ret = service.createReturn(
      {
        supplier_id: supplier.id,
        return_date: '2026-10-01',
        items: [
          {
            item_id: f.itemId,
            warehouse_id: f.warehouseId,
            batch_id: f.batchId,
            quantity: 1,
            purchase_cost: 100,
            gst_rate: 18,
          },
        ],
      },
      1,
    );
    const entries = db
      .prepare(
        "SELECT l.system_key,je.entry_type,je.amount FROM journal_entries je JOIN ledgers l ON l.id=je.ledger_id JOIN vouchers v ON v.id=je.voucher_id WHERE v.reference_table='purchase_returns' AND v.reference_id=?",
      )
      .all(ret.id);
    assert.equal(entries.find((e) => e.system_key === 'inventory_stock')?.amount, 100);
    assert.equal(entries.find((e) => e.system_key === 'cgst_input')?.amount, 9);
    assert.equal(entries.find((e) => e.system_key === 'sgst_input')?.amount, 9);
    const itc = new GstService(db).gstr3b({ dateFrom: '2026-10-01', dateTo: '2026-10-01' }).data
      .eligibleItc;
    assert.equal(itc.taxableValue, -100);
    assert.equal(itc.totalTax, -18);
    assert.equal(
      entries.filter((e) => e.entry_type === 'DEBIT').reduce((sum, e) => sum + e.amount, 0),
      118,
    );
  } finally {
    await context.close();
  }
});
