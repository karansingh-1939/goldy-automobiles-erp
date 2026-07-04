import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

test('four billing sections and chassis number integration', async (t) => {
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

  await t.test('vehicle chassis_number CRUD and searching', async () => {
    const context = await createTestContext();
    try {
      const token = await login(context);
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Create a customer first
      const custRes = await context.request('/api/v1/customers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Test Customer',
          phone: '9876543210',
        }),
      });
      assert.equal(custRes.response.status, 201);
      const customer = custRes.body.data;

      // 2. Create vehicle with chassis_number
      const vehRes1 = await context.request('/api/v1/vehicles', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_id: customer.id,
          registration_number: 'DL1CAB1234',
          make: 'Toyota',
          model: 'Innova',
          engine_number: 'ENG-Toyota-123',
          chassis_number: 'CHASSIS-Toyota-456',
        }),
      });
      assert.equal(vehRes1.response.status, 201);
      assert.equal(vehRes1.body.data.engine_number, 'ENG-Toyota-123');
      assert.equal(vehRes1.body.data.chassis_number, 'CHASSIS-Toyota-456');

      // 3. Search vehicles by chassis_number
      const searchRes = await context.request('/api/v1/vehicles?search=CHASSIS-Toyota', { headers });
      assert.equal(searchRes.response.status, 200);
      assert.equal(searchRes.body.data.length, 1);
      assert.equal(searchRes.body.data[0].chassis_number, 'CHASSIS-Toyota-456');
    } finally {
      await context.close();
    }
  });

  await t.test('job cards and invoices searchable by engine and chassis numbers', async () => {
    const context = await createTestContext();
    try {
      const token = await login(context);
      const headers = { Authorization: `Bearer ${token}` };

      // Seed database with customer, vehicle, job card, and finalized invoice
      context.db.prepare('PRAGMA foreign_keys = OFF').run();

      const custRes = context.db.prepare(`
        INSERT INTO customers (name, phone)
        VALUES ('John Doe', '9898989898')
      `).run();
      const customerId = custRes.lastInsertRowid;

      const vehRes = context.db.prepare(`
        INSERT INTO vehicles (customer_id, registration_number, make, model, engine_number, chassis_number)
        VALUES (?, 'MH12XX9999', 'Hyundai', 'i20', 'ENG-HYUNDAI-888', 'CHAS-HYUNDAI-999')
      `).run(customerId);
      const vehicleId = vehRes.lastInsertRowid;

      const jcRes = context.db.prepare(`
        INSERT INTO job_cards (job_card_number, customer_id, vehicle_id, status, odometer_reading)
        VALUES ('JC-SEARCH-TEST', ?, ?, 'COMPLETED', 1000)
      `).run(customerId, vehicleId);
      const jobCardId = jcRes.lastInsertRowid;

      context.db.prepare(`
        INSERT INTO invoices (invoice_number, job_card_id, customer_id, vehicle_id, invoice_date, grand_total, status)
        VALUES ('INV-SEARCH-TEST', ?, ?, ?, '2026-06-08', 500, 'FINALIZED')
      `).run(jobCardId, customerId, vehicleId);

      context.db.prepare('PRAGMA foreign_keys = ON').run();

      // Search Job Cards by engine number
      const jcSearchEngine = await context.request('/api/v1/job-cards?search=ENG-HYUNDAI-888', { headers });
      assert.equal(jcSearchEngine.response.status, 200);
      assert.equal(jcSearchEngine.body.data.length, 1);
      assert.equal(jcSearchEngine.body.data[0].job_card_number, 'JC-SEARCH-TEST');

      // Search Job Cards by chassis number
      const jcSearchChassis = await context.request('/api/v1/job-cards?search=CHAS-HYUNDAI-999', { headers });
      assert.equal(jcSearchChassis.response.status, 200);
      assert.equal(jcSearchChassis.body.data.length, 1);

      // Search Invoices by engine number
      const invSearchEngine = await context.request('/api/v1/invoices?search=ENG-HYUNDAI-888', { headers });
      assert.equal(invSearchEngine.response.status, 200);
      assert.equal(invSearchEngine.body.data.length, 1);
      assert.equal(invSearchEngine.body.data[0].invoice_number, 'INV-SEARCH-TEST');

      // Search Invoices by chassis number
      const invSearchChassis = await context.request('/api/v1/invoices?search=CHAS-HYUNDAI-999', { headers });
      assert.equal(invSearchChassis.response.status, 200);
      assert.equal(invSearchChassis.body.data.length, 1);
    } finally {
      await context.close();
    }
  });

  await t.test('lubricants and outside jobs flow, gst, profit, and cancellation logic', async () => {
    const context = await createTestContext();
    try {
      const token = await login(context);
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Seed customer, vehicle, inventory category, item, and batch
      context.db.prepare('PRAGMA foreign_keys = OFF').run();

      const custRes = context.db.prepare(`
        INSERT INTO customers (name, phone)
        VALUES ('Alice Smith', '9595959595')
      `).run();
      const customerId = custRes.lastInsertRowid;

      const vehRes = context.db.prepare(`
        INSERT INTO vehicles (customer_id, registration_number, make, model)
        VALUES (?, 'MH12ZZ1111', 'Maruti', 'Swift')
      `).run(customerId);
      const vehicleId = vehRes.lastInsertRowid;

      let warehouse = context.db.prepare('SELECT id FROM warehouses LIMIT 1').get();
      if (!warehouse) {
        const whRes = context.db.prepare(`
          INSERT INTO warehouses (name, code, is_active)
          VALUES ('Main Store', 'WH01', 1)
        `).run();
        warehouse = { id: whRes.lastInsertRowid };
      }

      const catRes = context.db.prepare(`
        INSERT INTO inventory_categories (name, is_active)
        VALUES ('Lubricants & Oils', 1)
      `).run();
      const categoryId = catRes.lastInsertRowid;

      const itemRes = context.db.prepare(`
        INSERT INTO inventory_items (sku, item_name, category_id, gst_rate, purchase_cost, average_cost, selling_price, current_quantity, is_active)
        VALUES ('LUBE-OW20', 'Shell Helix 0W20', ?, 18, 200, 200, 300, 10, 1)
      `).run(categoryId);
      const itemId = itemRes.lastInsertRowid;

      const batchRes = context.db.prepare(`
        INSERT INTO inventory_batches (item_id, warehouse_id, batch_number, quantity, purchase_cost, selling_price)
        VALUES (?, ?, 'BATCH01', 10, 200, 300)
      `).run(itemId, warehouse.id);
      const batchId = batchRes.lastInsertRowid;

      const jcRes = context.db.prepare(`
        INSERT INTO job_cards (job_card_number, customer_id, vehicle_id, status, odometer_reading)
        VALUES ('JC-FLOW-TEST', ?, ?, 'DRAFT', 12000)
      `).run(customerId, vehicleId);
      const jobCardId = jcRes.lastInsertRowid;

      context.db.prepare('PRAGMA foreign_keys = ON').run();

      // 2. Add Lubricant Part item to Job Card
      const addPartRes = await context.request(`/api/v1/job-cards/${jobCardId}/parts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          inventory_item_id: itemId,
          batch_id: batchId,
          quantity: 2,
          selling_price: 300,
          gst_rate: 18,
          description: 'Shell Helix 0W20 1L',
        }),
      });
      assert.equal(addPartRes.response.status, 201);
      assert.equal(addPartRes.body.data.item_type, 'LUBRICANT'); // Classified as LUBRICANT because category name matches /lubricant|oil/i

      // 3. Add Outside Job to Job Card
      const addLabourRes = await context.request(`/api/v1/job-cards/${jobCardId}/labour`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description: '[Outside Job] Wheel Alignment',
          charge: 400,
          gst_rate: 18,
        }),
      });
      assert.equal(addLabourRes.response.status, 201);

      // 4. Finalize Job Card
      const finalizeRes = await context.request(`/api/v1/job-cards/${jobCardId}/finalize`, {
        method: 'POST',
        headers,
      });
      assert.equal(finalizeRes.response.status, 201);

      const invoice = finalizeRes.body.data.invoice;
      assert.equal(invoice.status, 'FINALIZED');

      // Verify invoice items item_type in DB
      const items = context.db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
      assert.equal(items.length, 2);

      const lubeItem = items.find(i => i.item_type === 'LUBRICANT');
      const outsideJobItem = items.find(i => i.item_type === 'OUTSIDE_JOB');

      assert.ok(lubeItem, 'LUBRICANT invoice item should exist');
      assert.ok(outsideJobItem, 'OUTSIDE_JOB invoice item should exist');

      assert.equal(lubeItem.quantity, 2);
      assert.equal(lubeItem.line_revenue, 600);
      assert.equal(lubeItem.line_cost, 400); // 2 * 200 purchase cost snapshot
      assert.equal(lubeItem.line_profit, 200);

      assert.equal(outsideJobItem.line_revenue, 400);
      assert.equal(outsideJobItem.line_cost, 0);
      assert.equal(outsideJobItem.line_profit, 400);

      // Check stock before cancellation
      const batchBefore = context.db.prepare('SELECT quantity FROM inventory_batches WHERE id = ?').get(batchId);
      assert.equal(batchBefore.quantity, 8); // 10 - 2 consumed

      // 5. Cancel Invoice
      const cancelRes = await context.request(`/api/v1/invoices/${invoice.id}/cancel`, {
        method: 'POST',
        headers,
      });
      assert.equal(cancelRes.response.status, 200);
      assert.equal(cancelRes.body.data.status, 'CANCELLED');

      // Verify stock was reversed for LUBRICANT item
      const batchAfter = context.db.prepare('SELECT quantity FROM inventory_batches WHERE id = ?').get(batchId);
      assert.equal(batchAfter.quantity, 10); // restored back to 10
    } finally {
      await context.close();
    }
  });
});
