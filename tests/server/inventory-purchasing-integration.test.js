import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

async function login(context) {
  const result = await context.request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: 'admin',
      password: 'Admin@12345',
    }),
  });

  assert.equal(result.response.status, 200);
  return result.body.token;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function createSupplier(context, token, name = 'Phase 3 Supplier') {
  const result = await context.request('/api/v1/suppliers', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      name,
      phone: '9100000001',
      city: 'Pune',
    }),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

async function createInventoryItem(context, token, payload = {}) {
  const category = context.db
    .prepare('SELECT id FROM inventory_categories ORDER BY id LIMIT 1')
    .get();
  const result = await context.request('/api/v1/inventory/items', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      sku: payload.sku || 'PHASE3-FILTER',
      item_name: payload.item_name || 'Phase 3 Oil Filter',
      category_id: category.id,
      purchase_cost: payload.purchase_cost ?? 120,
      selling_price: payload.selling_price ?? 220,
      reorder_level: payload.reorder_level ?? 2,
      unit_of_measure: 'pcs',
      gst_rate: payload.gst_rate ?? 18,
      supplier_id: payload.supplier_id,
    }),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

test('inventory APIs create items and post stock movements', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const supplier = await createSupplier(context, token);
    const mainWarehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
    const oilWarehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'OIL'").get();
    const item = await createInventoryItem(context, token, { supplier_id: supplier.id });

    const updated = await context.request(`/api/v1/inventory/items/${item.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        selling_price: 240,
        reorder_level: 3,
      }),
    });

    assert.equal(updated.response.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.selling_price, 240);
    assert.equal(updated.body.data.reorder_level, 3);

    const opening = await context.request('/api/v1/inventory/opening-stock', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        item_id: item.id,
        warehouse_id: mainWarehouse.id,
        supplier_id: supplier.id,
        batch_number: 'OPEN-B1',
        quantity: 5,
        unit_cost: 120,
        reason: 'Initial physical count',
      }),
    });

    assert.equal(opening.response.status, 201, JSON.stringify(opening.body));
    assert.equal(opening.body.data.item.current_quantity, 5);
    assert.equal(opening.body.data.batch.quantity, 5);

    const adjustment = await context.request('/api/v1/inventory/adjustments', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        item_id: item.id,
        warehouse_id: mainWarehouse.id,
        batch_id: opening.body.data.batch.id,
        adjustment_type: 'OUT',
        quantity: 2,
        reason: 'Damaged item write-off',
      }),
    });

    assert.equal(adjustment.response.status, 201, JSON.stringify(adjustment.body));
    assert.equal(adjustment.body.data.item.current_quantity, 3);

    const transfer = await context.request('/api/v1/inventory/transfers', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        item_id: item.id,
        batch_id: opening.body.data.batch.id,
        from_warehouse_id: mainWarehouse.id,
        to_warehouse_id: oilWarehouse.id,
        quantity: 1,
        notes: 'Move oil filter to oil store',
      }),
    });

    assert.equal(transfer.response.status, 201, JSON.stringify(transfer.body));
    const transferId = transfer.body.data.transferId;

    // Receive the transfer to complete the workflow
    const receive = await context.request(`/api/v1/inventory/transfers/${transferId}/receive`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        received_quantity: 1,
        notes: 'Received oil filter',
      }),
    });

    assert.equal(receive.response.status, 200, JSON.stringify(receive.body));
    assert.equal(receive.body.data.in.item.current_quantity, 3);
    assert.equal(receive.body.data.in.batch.quantity, 1);

    const valuation = await context.request('/api/v1/inventory/reports/valuation', {
      headers: authHeaders(token),
    });

    assert.equal(valuation.response.status, 200);
    assert.ok(valuation.body.totals.value >= 360);

    const movements = await context.request(
      `/api/v1/inventory/reports/movements?itemId=${item.id}`,
      {
        headers: authHeaders(token),
      },
    );

    assert.equal(movements.response.status, 200);
    assert.equal(movements.body.data.length, 4);
  } finally {
    await context.close();
  }
});

test('purchasing APIs create orders, post receipts to stock, and record returns', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const supplier = await createSupplier(context, token, 'Phase 3 Purchase Supplier');
    const mainWarehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
    const item = await createInventoryItem(context, token, {
      sku: 'PHASE3-BRAKE-PAD',
      item_name: 'Phase 3 Brake Pad',
      supplier_id: supplier.id,
      purchase_cost: 200,
      selling_price: 320,
    });

    const order = await context.request('/api/v1/purchases/orders', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        supplier_id: supplier.id,
        order_date: '2026-06-04',
        items: [
          {
            item_id: item.id,
            warehouse_id: mainWarehouse.id,
            quantity: 10,
            purchase_cost: 200,
            selling_price: 320,
            gst_rate: 18,
          },
        ],
      }),
    });

    assert.equal(order.response.status, 201, JSON.stringify(order.body));
    assert.equal(order.body.data.grand_total, 2360);
    assert.equal(order.body.data.items.length, 1);

    const receipt = await context.request('/api/v1/purchases/receipts', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        supplier_id: supplier.id,
        purchase_order_id: order.body.data.id,
        receipt_date: '2026-06-04',
        items: [
          {
            item_id: item.id,
            warehouse_id: mainWarehouse.id,
            batch_number: 'GRN-B1',
            quantity: 10,
            purchase_cost: 200,
            selling_price: 320,
            gst_rate: 18,
          },
        ],
      }),
    });

    assert.equal(receipt.response.status, 201, JSON.stringify(receipt.body));
    assert.equal(receipt.body.data.grand_total, 2360);
    assert.equal(receipt.body.data.items[0].batch_id > 0, true);

    const receivedItem = context.db
      .prepare('SELECT current_quantity, average_cost FROM inventory_items WHERE id = ?')
      .get(item.id);
    assert.equal(receivedItem.current_quantity, 10);
    assert.equal(receivedItem.average_cost, 200);

    const refreshedOrder = await context.request(`/api/v1/purchases/orders/${order.body.data.id}`, {
      headers: authHeaders(token),
    });

    assert.equal(refreshedOrder.response.status, 200);
    assert.equal(refreshedOrder.body.data.status, 'RECEIVED');

    const purchaseReturn = await context.request('/api/v1/purchases/returns', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        supplier_id: supplier.id,
        return_date: '2026-06-04',
        items: [
          {
            item_id: item.id,
            warehouse_id: mainWarehouse.id,
            batch_id: receipt.body.data.items[0].batch_id,
            quantity: 2,
            unit_cost: 200,
            gst_rate: 18,
          },
        ],
      }),
    });

    assert.equal(purchaseReturn.response.status, 201, JSON.stringify(purchaseReturn.body));
    assert.equal(purchaseReturn.body.data.grand_total, 472);

    const returnedItem = context.db
      .prepare('SELECT current_quantity FROM inventory_items WHERE id = ?')
      .get(item.id);
    assert.equal(returnedItem.current_quantity, 8);

    const ledger = context.db
      .prepare(
        `
      SELECT debit, credit, balance_after
      FROM supplier_ledgers
      WHERE supplier_id = ?
      ORDER BY id DESC
      LIMIT 1
    `,
      )
      .get(supplier.id);

    assert.equal(ledger.debit, 472);
    assert.equal(ledger.credit, 0);
    assert.equal(ledger.balance_after, 1888);
  } finally {
    await context.close();
  }
});
