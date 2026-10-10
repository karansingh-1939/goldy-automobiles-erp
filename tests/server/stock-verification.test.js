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

test('Physical Stock Verification workflow checks', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);

    // 1. Create a dummy inventory item
    const itemResult = await context.request('/api/v1/inventory/items', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        sku: 'TEST-VERIFY-ITEM',
        item_name: 'Test Verify Spare Part',
        category: 'Spare Parts',
        purchase_cost: 100.0,
        selling_price: 150.0,
        gst_rate: 18.0,
        unit: 'pcs',
        unit_of_measure: 'pcs',
      }),
    });
    assert.equal(itemResult.response.status, 201, JSON.stringify(itemResult.body));
    const item = itemResult.body.data;

    // Retrieve MAIN warehouse ID
    const warehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
    assert.ok(warehouse);

    // 2. Establish opening stock (10 units)
    const openingStockResult = await context.request('/api/v1/inventory/opening-stock', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        item_id: item.id,
        warehouse_id: warehouse.id,
        quantity: 10.0,
        unit_cost: 100.0,
        batch_number: 'BATCH-OPENING',
        notes: 'Initial stock',
      }),
    });
    assert.equal(openingStockResult.response.status, 201, JSON.stringify(openingStockResult.body));

    // Get the batch ID created
    const batch = context.db
      .prepare('SELECT id, quantity FROM inventory_batches WHERE item_id = ?')
      .get(item.id);
    assert.ok(batch);
    assert.equal(batch.quantity, 10.0);

    // 3. Post stock verification showing a shortage (counted 8.0 units instead of 10.0)
    const verificationResult = await context.request('/api/v1/inventory/verifications', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        verification_type: 'Single Item',
        warehouse_id: warehouse.id,
        item_id: item.id,
        batch_id: batch.id,
        counted_quantity: 8.0,
        notes: 'Shortage detected',
      }),
    });
    assert.equal(verificationResult.response.status, 201, JSON.stringify(verificationResult.body));
    // Approve the shortage verification
    const ver1 = context.db
      .prepare('SELECT id FROM stock_verifications WHERE verification_number = ?')
      .get(verificationResult.body.data.items[0].verification_number);
    const approve1 = await context.request(`/api/v1/inventory/verifications/${ver1.id}/approve`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    assert.equal(approve1.response.status, 200);

    // Verify system stock is adjusted to 8.0
    const updatedBatch = context.db
      .prepare('SELECT quantity FROM inventory_batches WHERE id = ?')
      .get(batch.id);
    assert.equal(updatedBatch.quantity, 8.0);

    const updatedItem = context.db
      .prepare('SELECT current_quantity FROM inventory_items WHERE id = ?')
      .get(item.id);
    assert.equal(updatedItem.current_quantity, 8.0);

    // 4. Post stock verification showing an overage (counted 12.0 units instead of 8.0)
    const verificationOverageResult = await context.request('/api/v1/inventory/verifications', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        verification_type: 'Single Item',
        warehouse_id: warehouse.id,
        item_id: item.id,
        batch_id: batch.id,
        counted_quantity: 12.0,
        notes: 'Overage detected',
      }),
    });
    assert.equal(
      verificationOverageResult.response.status,
      201,
      JSON.stringify(verificationOverageResult.body),
    );

    // Approve the overage verification
    const ver2 = context.db
      .prepare('SELECT id FROM stock_verifications WHERE verification_number = ?')
      .get(verificationOverageResult.body.data.items[0].verification_number);
    const approve2 = await context.request(`/api/v1/inventory/verifications/${ver2.id}/approve`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    assert.equal(approve2.response.status, 200);

    // Verify system stock is adjusted to 12.0
    const finalBatch = context.db
      .prepare('SELECT quantity FROM inventory_batches WHERE id = ?')
      .get(batch.id);
    assert.equal(finalBatch.quantity, 12.0);

    // 5. Query verification history list
    const historyResult = await context.request('/api/v1/inventory/verifications?pageSize=10', {
      headers: authHeaders(token),
    });
    assert.equal(historyResult.response.status, 200);
    assert.ok(historyResult.body.data.length >= 2);

    // Assert audit trail columns
    const firstVerify = historyResult.body.data[0];
    assert.ok(firstVerify.verification_number);
    assert.equal(firstVerify.sku, 'TEST-VERIFY-ITEM');
    assert.equal(firstVerify.warehouse_id, warehouse.id);
  } finally {
    await context.close();
  }
});
