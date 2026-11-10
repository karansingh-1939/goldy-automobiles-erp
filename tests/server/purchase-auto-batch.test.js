import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

test('a purchase line with no batch number uses the supplier bill number', async () => {
  const context = await createTestContext();
  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const supplier = await context.request('/api/v1/suppliers', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Auto Batch Supplier', phone: '8000000001', is_active: 1 }),
    });
    const categoryId = context.db.prepare('SELECT id FROM inventory_categories LIMIT 1').get().id;
    const item = await context.request('/api/v1/inventory/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: 'AUTO-BATCH-1',
        item_name: 'Test Wiper',
        category_id: categoryId,
        purchase_cost: 100,
        selling_price: 150,
        reorder_level: 1,
        gst_rate: 18,
        hsn_code: '85123010',
        unit_of_measure: 'pcs',
        is_active: 1,
      }),
    });
    const warehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();

    const receipt = await context.request('/api/v1/purchases/receipts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplier_id: supplier.body.data.id,
        receipt_date: '2026-11-11',
        receipt_number: 'SUP-BILL-77',
        items: [
          {
            item_id: item.body.data.id,
            warehouse_id: warehouse.id,
            batch_number: '  ',
            quantity: 4,
            purchase_cost: 100,
            selling_price: 150,
            gst_rate: 18,
          },
        ],
      }),
    });
    assert.equal(receipt.response.status, 201);
    const batch = context.db
      .prepare('SELECT batch_number, quantity FROM inventory_batches WHERE item_id = ?')
      .get(item.body.data.id);
    assert.equal(batch.batch_number, 'SUP-BILL-77');
    assert.equal(Number(batch.quantity), 4);
  } finally {
    await context.close();
  }
});
