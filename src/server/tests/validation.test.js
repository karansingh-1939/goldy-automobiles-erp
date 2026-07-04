import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { createInventoryService } from '../modules/inventory/inventory.service.js';
import { createPurchasingService } from '../modules/purchasing/purchasing.service.js';
import { createJobCardService } from '../modules/jobCards/jobCard.service.js';
import { validateExpensePayload } from '../modules/expenses/expense.validator.js';
import { createBackupService } from '../modules/backup/backup.service.js';

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

test('validation: customer field validations', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);

    // 1. Invalid phone (9 digits)
    const phoneRes = await context.request('/api/v1/customers', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Invalid Phone Customer',
        phone: '123456789', // Less than 10 digits
      }),
    });
    assert.equal(phoneRes.response.status, 400);
    assert.match(phoneRes.body.error?.message, /Validation failed/);

    // 2. Invalid GSTIN pattern
    const gstinRes = await context.request('/api/v1/customers', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Invalid GSTIN Customer',
        phone: '9876543210',
        gstin: '07ABCDE1234F12', // Wrong structure
      }),
    });
    assert.equal(gstinRes.response.status, 400);

    // 3. Invalid Pincode
    const pinRes = await context.request('/api/v1/customers', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Invalid Pin Customer',
        phone: '9876543210',
        pincode: 'abcde', // Not 6 digits
      }),
    });
    assert.equal(pinRes.response.status, 400);
  } finally {
    await context.close();
  }
});

test('validation: vehicle field validations', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);

    // Create customer first
    const custRes = await context.request('/api/v1/customers', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Valid Customer',
        phone: '9876543210',
      }),
    });
    assert.equal(custRes.response.status, 201);
    const customerId = custRes.body.data.id;

    // 1. Negative customer ID
    const negCustRes = await context.request('/api/v1/vehicles', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        customer_id: -1,
        registration_number: 'DL3CAA1234',
      }),
    });
    assert.equal(negCustRes.response.status, 400);

    // 2. Invalid Registration Plate format
    const regRes = await context.request('/api/v1/vehicles', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        customer_id: customerId,
        registration_number: 'XYZ', // Too short
      }),
    });
    assert.equal(regRes.response.status, 400);

    // 3. Invalid VIN length (not 17)
    const vinRes = await context.request('/api/v1/vehicles', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        customer_id: customerId,
        registration_number: 'DL3CAA1234',
        vin: '12345',
      }),
    });
    assert.equal(vinRes.response.status, 400);

    // 4. Invalid Year (future year 2030)
    const yearRes = await context.request('/api/v1/vehicles', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        customer_id: customerId,
        registration_number: 'DL3CAA1234',
        year: 2030,
      }),
    });
    assert.equal(yearRes.response.status, 400);
  } finally {
    await context.close();
  }
});

test('validation: warehouse code validations', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);

    // Invalid code (special characters or too long)
    const whRes = await context.request('/api/v1/warehouses', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Main Godown',
        code: 'MAIN-GODOWN-12345', // Too long
      }),
    });
    assert.equal(whRes.response.status, 400);
  } finally {
    await context.close();
  }
});

test('validation: inventory item cost and SKU validation', async () => {
  const context = await createTestContext();
  const service = createInventoryService(context.db);

  try {
    // 1. Negative purchase cost
    assert.throws(() => {
      service.validateItemPayload({
        sku: 'OIL5L',
        item_name: 'Engine Oil 5L',
        purchase_cost: -10,
      });
    }, /Purchase cost cannot be negative/);

    // 2. Invalid SKU format (hyphens, spaces)
    assert.throws(() => {
      service.validateItemPayload({
        sku: 'OIL-5L-SPA CE',
        item_name: 'Engine Oil 5L',
      });
    }, /SKU must be alphanumeric/);

    // 3. Negative unit cost on adjustment
    assert.throws(() => {
      service.createOpeningStock({
        item_id: 1,
        warehouse_id: 1,
        quantity: 10,
        unit_cost: -5,
        batch_number: 'B1',
      }, 1);
    }, /Unit cost cannot be negative/);
  } finally {
    await context.close();
  }
});

test('validation: inventory item auto SKU and defaults validation', async () => {
  const context = await createTestContext();
  const service = createInventoryService(context.db);

  try {
    // 1. Create item with empty SKU and verify it generates sequential SKU and sets defaults
    const item1 = service.createItem({
      item_name: 'Test Item 1',
      purchase_cost: 100,
      selling_price: 150,
    }, 1);

    assert.match(item1.sku, /^ITM-\d{5}$/);
    assert.equal(item1.gst_rate, 18);
    assert.equal(item1.unit_of_measure, 'pcs');
    assert.equal(item1.reorder_level, 5);

    // 2. Create second item and verify sequence increment
    const item2 = service.createItem({
      item_name: 'Test Item 2',
      purchase_cost: 200,
      selling_price: 300,
      sku: '', // explicitly empty
    }, 1);

    const num1 = Number(item1.sku.split('-')[1]);
    const num2 = Number(item2.sku.split('-')[1]);
    assert.equal(num2, num1 + 1);

    // 3. Keep existing SKUs unchanged (custom SKU works)
    const customItem = service.createItem({
      sku: 'CUSTOM-SKU-99',
      item_name: 'Test Item Custom',
      purchase_cost: 50,
      selling_price: 80,
    }, 1);
    assert.equal(customItem.sku, 'CUSTOM-SKU-99');

    // 4. Create another item after custom one to verify it still sequences correctly based on ITM-xxxxx
    const item3 = service.createItem({
      item_name: 'Test Item 3',
      purchase_cost: 10,
      selling_price: 15,
    }, 1);
    const num3 = Number(item3.sku.split('-')[1]);
    assert.equal(num3, num2 + 1);

  } finally {
    await context.close();
  }
});

test('validation: procurement validations', async () => {
  const context = await createTestContext();
  const service = createPurchasingService(context.db);

  try {
    // Get seeded warehouse and category
    const warehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
    const category = context.db.prepare("SELECT id FROM inventory_categories ORDER BY id LIMIT 1").get();

    // Seed supplier
    context.db.prepare(`
      INSERT INTO suppliers (id, name, phone, is_active)
      VALUES (1, 'Test Supplier', '9876543210', 1)
    `).run();

    // Seed inventory item
    context.db.prepare(`
      INSERT INTO inventory_items (id, sku, item_name, category_id, current_quantity)
      VALUES (1, 'PART-01', 'Brake Pad', ?, 10)
    `).run(category.id);

    // Create order with inactive supplier should fail
    context.db.prepare('UPDATE suppliers SET is_active = 0 WHERE id = 1').run();
    await assert.rejects(async () => {
      await service.createOrder({
        supplier_id: 1,
        items: [{ item_id: 1, warehouse_id: warehouse.id, quantity: 10, purchase_cost: 100 }],
      }, 1);
    }, /Supplier is inactive/);

    // Mark supplier active again
    context.db.prepare('UPDATE suppliers SET is_active = 1 WHERE id = 1').run();

    // Negative unit cost on items should fail
    await assert.rejects(async () => {
      await service.createOrder({
        supplier_id: 1,
        items: [{ item_id: 1, warehouse_id: warehouse.id, quantity: 10, purchase_cost: -100 }],
      }, 1);
    }, /Purchase cost cannot be negative/);
  } finally {
    await context.close();
  }
});

test('validation: job card odometer and sync validations', async () => {
  const context = await createTestContext();
  const service = createJobCardService(context.db);

  try {
    // Get seeded warehouse and category
    const warehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
    const category = context.db.prepare("SELECT id FROM inventory_categories ORDER BY id LIMIT 1").get();

    // Seed customer, vehicle, item, batch
    context.db.prepare(`
      INSERT INTO customers (id, name, phone)
      VALUES (1, 'Test Customer', '9876543210')
    `).run();
    
    context.db.prepare(`
      INSERT INTO vehicles (id, customer_id, registration_number, make, model, odometer_reading)
      VALUES (1, 1, 'DL3CAA1234', 'Maruti', 'Swift', 5000)
    `).run();

    context.db.prepare(`
      INSERT INTO inventory_items (id, sku, item_name, category_id, current_quantity)
      VALUES (1, 'PART-01', 'Brake Pad', ?, 10)
    `).run(category.id);

    context.db.prepare(`
      INSERT INTO inventory_batches (id, item_id, warehouse_id, batch_number, quantity, purchase_cost, selling_price)
      VALUES (1, 1, ?, 'BATCH-01', 10, 100, 150)
    `).run(warehouse.id);

    // Set vehicle initial odometer
    context.db.prepare('UPDATE vehicles SET odometer_reading = 5000 WHERE id = 1').run();

    // 1. Creating job card with lower odometer should fail
    await assert.rejects(async () => {
      await service.create({
        customer_id: 1,
        vehicle_id: 1,
        odometer_reading: 4000, // Regressing mileage
      }, 1);
    }, /Odometer reading cannot be less than/);

    // 2. Successful creation
    const jobCard = await service.create({
      customer_id: 1,
      vehicle_id: 1,
      odometer_reading: 5500,
    }, 1);
    assert.equal(jobCard.odometer_reading, 5500);

    // 3. Adding part with negative price should fail
    await assert.rejects(async () => {
      await service.addPart(jobCard.id, {
        inventory_item_id: 1,
        batch_id: 1,
        quantity: 1,
        selling_price: -50,
      }, 1);
    }, /Selling price cannot be negative/);

    // 4. Adding part with invalid GST rate
    await assert.rejects(async () => {
      await service.addPart(jobCard.id, {
        inventory_item_id: 1,
        batch_id: 1,
        quantity: 1,
        gst_rate: 150, // Greater than 100
      }, 1);
    }, /GST rate must be between 0 and 100/);

    // 5. Finalize updates vehicle master odometer
    // Add labor to complete invoice
    await service.addLabour(jobCard.id, {
      description: 'General Service',
      labour_charge: 500,
      gst_rate: 18,
    }, 1);

    await service.finalize(jobCard.id, 1);
    
    const updatedVehicle = context.db.prepare('SELECT odometer_reading FROM vehicles WHERE id = 1').get();
    assert.equal(updatedVehicle.odometer_reading, 5500); // Successfully updated vehicle odometer!
  } finally {
    await context.close();
  }
});

test('validation: expense validations', async () => {
  const orig = process.env.ALLOW_FUTURE_EXPENSES;
  delete process.env.ALLOW_FUTURE_EXPENSES;
  try {
    // Expense future date should fail
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    assert.throws(() => {
      validateExpensePayload({
        expense_date: tomorrow,
        category: 'Rent',
        amount: 1000,
      });
    }, /Expense date cannot be in the future/);
  } finally {
    if (orig !== undefined) {
      process.env.ALLOW_FUTURE_EXPENSES = orig;
    }
  }
});

test('validation: backup settings validations', async () => {
  const context = await createTestContext();
  const service = createBackupService(context.db);

  try {
    // Invalid retention count (0 or negative)
    assert.throws(() => {
      service.updateSettings({
        'backup.retention_count': 0,
      });
    }, /Retention count must be an integer greater than or equal to 1/);

    // Invalid interval hours
    assert.throws(() => {
      service.updateSettings({
        'backup.interval_hours': -5,
      });
    }, /Interval hours must be an integer greater than or equal to 1/);

    // Invalid preferred time format
    assert.throws(() => {
      service.updateSettings({
        'backup.preferred_time': '2:00 PM', // Not HH:MM
      });
    }, /Preferred time must be in HH:MM format/);
  } finally {
    await context.close();
  }
});
