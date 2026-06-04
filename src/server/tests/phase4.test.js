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

async function createCustomer(context, token) {
  const result = await context.request('/api/v1/customers', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      name: `Phase 4 Customer ${Date.now()}`,
      phone: `98${Math.floor(10000000 + Math.random() * 89999999)}`,
      city: 'Pune',
    }),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

async function createVehicle(context, token, customerId) {
  const result = await context.request('/api/v1/vehicles', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      customer_id: customerId,
      registration_number: `MH12JC${Math.floor(1000 + Math.random() * 8999)}`,
      make: 'Maruti',
      model: 'Swift',
      odometer_reading: 45000,
    }),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

async function createSupplier(context, token) {
  const result = await context.request('/api/v1/suppliers', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      name: `Phase 4 Supplier ${Date.now()}`,
      phone: `97${Math.floor(10000000 + Math.random() * 89999999)}`,
    }),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

async function createInventoryItem(context, token, payload = {}) {
  const category = context.db.prepare('SELECT id FROM inventory_categories ORDER BY id LIMIT 1').get();
  const result = await context.request('/api/v1/inventory/items', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      sku: payload.sku,
      item_name: payload.item_name,
      category_id: category.id,
      supplier_id: payload.supplier_id,
      purchase_cost: payload.purchase_cost,
      selling_price: payload.selling_price,
      reorder_level: 1,
      gst_rate: payload.gst_rate ?? 18,
      unit_of_measure: 'pcs',
    }),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

async function createOpeningStock(context, token, payload) {
  const result = await context.request('/api/v1/inventory/opening-stock', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

async function createJobCard(context, token, { customerId, vehicleId }) {
  const admin = context.db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  const result = await context.request('/api/v1/job-cards', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      customer_id: customerId,
      vehicle_id: vehicleId,
      odometer_reading: 45100,
      complaint: 'Brake noise and regular service',
      assigned_to: admin.id,
    }),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

test('job card creation stores customer, vehicle, odometer, complaint, mechanic, and draft status', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const customer = await createCustomer(context, token);
    const vehicle = await createVehicle(context, token, customer.id);
    const jobCard = await createJobCard(context, token, { customerId: customer.id, vehicleId: vehicle.id });

    assert.ok(jobCard.job_card_number);
    assert.equal(jobCard.customer_id, customer.id);
    assert.equal(jobCard.vehicle_id, vehicle.id);
    assert.equal(jobCard.odometer_reading, 45100);
    assert.equal(jobCard.complaint, 'Brake noise and regular service');
    assert.equal(jobCard.status, 'DRAFT');
    assert.ok(jobCard.assigned_to);
  } finally {
    await context.close();
  }
});

test('job card completion deducts inventory, creates invoice, and stores profit data', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const supplier = await createSupplier(context, token);
    const mainWarehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
    const item = await createInventoryItem(context, token, {
      sku: 'PHASE4-PAD',
      item_name: 'Phase 4 Brake Pad',
      supplier_id: supplier.id,
      purchase_cost: 100,
      selling_price: 150,
      gst_rate: 18,
    });
    const opening = await createOpeningStock(context, token, {
      item_id: item.id,
      warehouse_id: mainWarehouse.id,
      supplier_id: supplier.id,
      batch_number: 'P4-B1',
      quantity: 5,
      unit_cost: 100,
      reason: 'Phase 4 setup',
    });
    const customer = await createCustomer(context, token);
    const vehicle = await createVehicle(context, token, customer.id);
    const jobCard = await createJobCard(context, token, { customerId: customer.id, vehicleId: vehicle.id });

    const part = await context.request(`/api/v1/job-cards/${jobCard.id}/parts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        inventory_item_id: item.id,
        batch_id: opening.batch.id,
        quantity: 2,
        selling_price: 150,
        gst_rate: 18,
      }),
    });

    assert.equal(part.response.status, 201, JSON.stringify(part.body));

    const stockBeforeFinalize = context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(item.id);
    assert.equal(stockBeforeFinalize.current_quantity, 5);

    const labour = await context.request(`/api/v1/job-cards/${jobCard.id}/labour`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        description: 'Brake pad replacement labour',
        labour_charge: 500,
        gst_rate: 0,
      }),
    });

    assert.equal(labour.response.status, 201, JSON.stringify(labour.body));

    const finalized = await context.request(`/api/v1/job-cards/${jobCard.id}/finalize`, {
      method: 'POST',
      headers: authHeaders(token),
    });

    assert.equal(finalized.response.status, 201, JSON.stringify(finalized.body));
    assert.equal(finalized.body.data.jobCard.status, 'COMPLETED');

    const invoice = finalized.body.data.invoice;
    assert.equal(invoice.status, 'FINALIZED');
    assert.equal(invoice.revenue, 800);
    assert.equal(invoice.cost_total, 200);
    assert.equal(invoice.gross_profit, 600);
    assert.equal(invoice.items.length, 2);

    const stockAfterFinalize = context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(item.id);
    assert.equal(stockAfterFinalize.current_quantity, 3);

    const batchAfterFinalize = context.db.prepare('SELECT quantity FROM inventory_batches WHERE id = ?').get(opening.batch.id);
    assert.equal(batchAfterFinalize.quantity, 3);

    const movement = context.db.prepare(`
      SELECT transaction_type, direction, quantity, unit_cost
      FROM inventory_transactions
      WHERE reference_type = 'job_cards'
        AND reference_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(jobCard.id);

    assert.equal(movement.transaction_type, 'Consumption');
    assert.equal(movement.direction, 'OUT');
    assert.equal(movement.quantity, 2);
    assert.equal(movement.unit_cost, 100);

    const profit = context.db.prepare('SELECT revenue, cost_total, gross_profit, net_profit FROM profit_records WHERE invoice_id = ?').get(invoice.id);
    assert.deepEqual(profit, {
      revenue: 800,
      cost_total: 200,
      gross_profit: 600,
      net_profit: 600,
    });
  } finally {
    await context.close();
  }
});

test('invoice cancellation restores stock, reverses profit, and writes audit log', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const supplier = await createSupplier(context, token);
    const mainWarehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
    const item = await createInventoryItem(context, token, {
      sku: 'PHASE4-CANCEL',
      item_name: 'Phase 4 Cancel Part',
      supplier_id: supplier.id,
      purchase_cost: 80,
      selling_price: 140,
      gst_rate: 0,
    });
    const opening = await createOpeningStock(context, token, {
      item_id: item.id,
      warehouse_id: mainWarehouse.id,
      supplier_id: supplier.id,
      batch_number: 'P4-CANCEL-B1',
      quantity: 4,
      unit_cost: 80,
      reason: 'Phase 4 cancellation setup',
    });
    const customer = await createCustomer(context, token);
    const vehicle = await createVehicle(context, token, customer.id);
    const jobCard = await createJobCard(context, token, { customerId: customer.id, vehicleId: vehicle.id });

    await context.request(`/api/v1/job-cards/${jobCard.id}/parts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        inventory_item_id: item.id,
        batch_id: opening.batch.id,
        quantity: 1,
        selling_price: 140,
        gst_rate: 0,
      }),
    });

    const finalized = await context.request(`/api/v1/job-cards/${jobCard.id}/finalize`, {
      method: 'POST',
      headers: authHeaders(token),
    });

    assert.equal(finalized.response.status, 201, JSON.stringify(finalized.body));
    assert.equal(context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(item.id).current_quantity, 3);

    const cancelled = await context.request(`/api/v1/invoices/${finalized.body.data.invoice.id}/cancel`, {
      method: 'POST',
      headers: authHeaders(token),
    });

    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.data.status, 'CANCELLED');

    const restoredItem = context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(item.id);
    const restoredBatch = context.db.prepare('SELECT quantity FROM inventory_batches WHERE id = ?').get(opening.batch.id);
    assert.equal(restoredItem.current_quantity, 4);
    assert.equal(restoredBatch.quantity, 4);

    const profit = context.db.prepare('SELECT revenue, cost_total, gross_profit, net_profit FROM profit_records WHERE invoice_id = ?').get(finalized.body.data.invoice.id);
    assert.deepEqual(profit, {
      revenue: 0,
      cost_total: 0,
      gross_profit: 0,
      net_profit: 0,
    });

    const reverseMovement = context.db.prepare(`
      SELECT transaction_type, direction, quantity
      FROM inventory_transactions
      WHERE reference_type = 'invoices'
        AND reference_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(finalized.body.data.invoice.id);

    assert.equal(reverseMovement.transaction_type, 'Return');
    assert.equal(reverseMovement.direction, 'IN');
    assert.equal(reverseMovement.quantity, 1);

    const audit = context.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_logs
      WHERE entity_type = 'invoices'
        AND entity_id = ?
        AND action = 'CANCEL'
    `).get(finalized.body.data.invoice.id);

    assert.equal(audit.count, 1);
  } finally {
    await context.close();
  }
});

test('job card finalization rolls back stock deduction when a later step fails', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const supplier = await createSupplier(context, token);
    const mainWarehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
    const firstItem = await createInventoryItem(context, token, {
      sku: 'PHASE4-TXN-A',
      item_name: 'Phase 4 Transaction Part A',
      supplier_id: supplier.id,
      purchase_cost: 50,
      selling_price: 100,
      gst_rate: 0,
    });
    const secondItem = await createInventoryItem(context, token, {
      sku: 'PHASE4-TXN-B',
      item_name: 'Phase 4 Transaction Part B',
      supplier_id: supplier.id,
      purchase_cost: 60,
      selling_price: 110,
      gst_rate: 0,
    });
    const firstOpening = await createOpeningStock(context, token, {
      item_id: firstItem.id,
      warehouse_id: mainWarehouse.id,
      supplier_id: supplier.id,
      batch_number: 'P4-TXN-A',
      quantity: 1,
      unit_cost: 50,
      reason: 'Transaction setup A',
    });
    const secondOpening = await createOpeningStock(context, token, {
      item_id: secondItem.id,
      warehouse_id: mainWarehouse.id,
      supplier_id: supplier.id,
      batch_number: 'P4-TXN-B',
      quantity: 1,
      unit_cost: 60,
      reason: 'Transaction setup B',
    });
    const customer = await createCustomer(context, token);
    const vehicle = await createVehicle(context, token, customer.id);
    const jobCard = await createJobCard(context, token, { customerId: customer.id, vehicleId: vehicle.id });

    await context.request(`/api/v1/job-cards/${jobCard.id}/parts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        inventory_item_id: firstItem.id,
        batch_id: firstOpening.batch.id,
        quantity: 1,
        selling_price: 100,
        gst_rate: 0,
      }),
    });

    await context.request(`/api/v1/job-cards/${jobCard.id}/parts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        inventory_item_id: secondItem.id,
        batch_id: secondOpening.batch.id,
        quantity: 1,
        selling_price: 110,
        gst_rate: 0,
      }),
    });

    const adjustment = await context.request('/api/v1/inventory/adjustments', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        item_id: secondItem.id,
        warehouse_id: mainWarehouse.id,
        batch_id: secondOpening.batch.id,
        adjustment_type: 'OUT',
        quantity: 1,
        reason: 'Consume stock before job finalization',
      }),
    });

    assert.equal(adjustment.response.status, 201, JSON.stringify(adjustment.body));

    const failed = await context.request(`/api/v1/job-cards/${jobCard.id}/finalize`, {
      method: 'POST',
      headers: authHeaders(token),
    });

    assert.equal(failed.response.status, 400, JSON.stringify(failed.body));
    assert.equal(failed.body.error.code, 'INSUFFICIENT_STOCK');

    const firstStock = context.db.prepare('SELECT current_quantity FROM inventory_items WHERE id = ?').get(firstItem.id);
    assert.equal(firstStock.current_quantity, 1);

    const invoiceCount = context.db.prepare('SELECT COUNT(*) AS count FROM invoices WHERE job_card_id = ?').get(jobCard.id);
    assert.equal(invoiceCount.count, 0);

    const jobCardStatus = context.db.prepare('SELECT status FROM job_cards WHERE id = ?').get(jobCard.id);
    assert.equal(jobCardStatus.status, 'DRAFT');
  } finally {
    await context.close();
  }
});
