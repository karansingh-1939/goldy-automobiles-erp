import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { SalesOrderService } from '../../src/server/modules/sales-orders/sales-order.service.js';
import fs from 'node:fs';
import Database from 'better-sqlite3';

function fixtures(db) {
  const customerId = db
    .prepare("INSERT INTO customers(name) VALUES ('Inclusive customer')")
    .run().lastInsertRowid;
  const itemId = db
    .prepare(
      "INSERT INTO inventory_items(sku,item_name,purchase_cost,selling_price,gst_rate,current_quantity,average_cost) VALUES ('INCLUSIVE-REGRESSION','Inclusive part',50,118,18,5,50)",
    )
    .run().lastInsertRowid;
  const warehouseId = db.prepare('SELECT id FROM warehouses LIMIT 1').get().id;
  db.prepare(
    "INSERT INTO inventory_batches(item_id,warehouse_id,batch_number,purchase_cost,selling_price,quantity) VALUES (?,?,'INCLUSIVE-BATCH',50,118,5)",
  ).run(itemId, warehouseId);
  return { customerId, itemId, warehouseId };
}

test('inclusive quotation preserves its price through revision, conversion, shipment and invoice', async () => {
  const context = await createTestContext();
  try {
    const { customerId, itemId, warehouseId } = fixtures(context.db);
    const service = new SalesOrderService(context.db);
    const quote = service.createQuotation(
      {
        customerId,
        quotationDate: '2026-10-14',
        validUntil: '2026-10-20',
        taxType: 'INCLUSIVE',
        items: [{ itemId, quantity: 1, unitPrice: 118, gstRate: 18 }],
      },
      1,
    );
    const revised = service.reviseQuotation(quote.id, { termsConditions: 'Agreed' }, 1);
    assert.equal(revised.grand_total, 118);
    assert.equal(revised.tax_type, 'INCLUSIVE');
    const order = service.convertQuotationToSalesOrder(revised.id, { warehouseId }, 1);
    assert.equal(order.grand_total, 118);
    assert.equal(order.tax_type, 'INCLUSIVE');
    service.confirmSalesOrder(order.id, 1);
    const shipment = service.createShipment(
      order.id,
      { shipmentDate: '2026-10-14', items: [{ salesOrderItemId: order.items[0].id, quantity: 1 }] },
      1,
    );
    const invoice = service.createInvoiceForShipment(shipment.id, 1);
    assert.equal(invoice.grand_total, 118);
    assert.equal(invoice.subtotal, 100);
    assert.equal(invoice.gst_total, 18);
    assert.equal(
      context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id=?').get(itemId)
        .current_quantity,
      4,
    );
  } finally {
    await context.close();
  }
});

test('sales API searches customer/order names and reports reachable pages', async () => {
  const context = await createTestContext();
  try {
    const { customerId, itemId, warehouseId } = fixtures(context.db);
    const service = new SalesOrderService(context.db);
    for (let i = 0; i < 3; i++)
      service.createSalesOrder(
        {
          customerId,
          orderDate: '2026-10-14',
          items: [{ itemId, warehouseId, quantity: 1, unitPrice: 118 }],
        },
        1,
      );
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const empty = await context.request('/api/v1/sales-orders?search=unmatched-unique-search', {
      headers,
    });
    assert.equal(empty.response.status, 200);
    assert.equal(empty.body.data.length, 0);
    const page = await context.request('/api/v1/sales-orders?search=Inclusive&page=2&pageSize=2', {
      headers,
    });
    assert.equal(page.body.data.length, 1);
    assert.deepEqual(page.body.pagination, { page: 2, pageSize: 2, total: 3, totalPages: 2 });
  } finally {
    await context.close();
  }
});

test('tax-basis migration recovers historical inclusive pricing without rewriting totals', () => {
  const db = new Database(':memory:');
  try {
    for (const [header, lines, parent] of [
      ['quotations', 'quotation_items', 'quotation_id'],
      ['sales_orders', 'sales_order_items', 'sales_order_id'],
    ]) {
      db.exec(`CREATE TABLE ${header} (id INTEGER PRIMARY KEY, grand_total REAL);
        CREATE TABLE ${lines} (${parent} INTEGER,quantity REAL,unit_price REAL,discount_amount REAL,gst_amount REAL,line_total REAL);
        INSERT INTO ${header} VALUES (1,118),(2,139),(3,100);
        INSERT INTO ${lines} VALUES (1,1,128,10,18,118),(2,1,118,0,21.24,139.24),(3,1,100,0,0,100);`);
    }
    db.exec(
      fs.readFileSync(
        new URL('../../src/server/database/migrations/044_sales_tax_basis.sql', import.meta.url),
        'utf8',
      ),
    );
    for (const header of ['quotations', 'sales_orders']) {
      assert.deepEqual(db.prepare(`SELECT grand_total,tax_type FROM ${header} ORDER BY id`).all(), [
        { grand_total: 118, tax_type: 'INCLUSIVE' },
        { grand_total: 139, tax_type: 'EXCLUSIVE' },
        { grand_total: 100, tax_type: 'EXCLUSIVE' },
      ]);
    }
  } finally {
    db.close();
  }
});
