import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createApp } from '../app.js';
import { createDatabase } from '../database/connection.js';
import { runMigrations } from '../database/migrationRunner.js';
import { runSeeds } from '../database/seedRunner.js';
import { createDashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { errorHandler } from '../shared/middleware/errorHandler.js';

async function createDashboardApiTestContext() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-erp-verify-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  const db = createDatabase(dbPath);

  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_DEFAULT_PASSWORD = 'Admin@12345';
  process.env.SESSION_TTL_HOURS = '12';

  runMigrations(db);
  await runSeeds(db);

  const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'Admin'").get();
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.default.hash('Admin@12345', 12);
  db.prepare(`
    INSERT INTO users (name, username, password_hash, role_id, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run('System Administrator', 'admin', passwordHash, adminRole.id);

  const app = express();
  app.use('/api/v1/dashboard', createDashboardRouter(db));
  app.use(createApp({ db }));
  app.use(errorHandler);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();

  async function request(pathname, options = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    return { response, body };
  }

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { db, request, close };
}

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

test('dashboard operations API - authentication and response constraints', async () => {
  const context = await createDashboardApiTestContext();

  try {
    // 1. Unauthenticated request should fail
    const unauthResult = await context.request('/api/v1/dashboard/operations');
    assert.equal(unauthResult.response.status, 401);
    assert.equal(unauthResult.body.error.code, 'AUTH_TOKEN_REQUIRED');

    // Login for subsequent calls
    const token = await login(context);
    const headers = authHeaders(token);

    // 2. Empty database should return zero metrics
    const emptyResult = await context.request('/api/v1/dashboard/operations', { headers });
    assert.equal(emptyResult.response.status, 200);
    assert.deepEqual(emptyResult.body, {
      openJobCards: 0,
      completedJobCards: 0,
      vehiclesServicedToday: 0,
    });

    // Seed test data using SQL (with foreign keys temporarily off for simplicity)
    context.db.prepare('PRAGMA foreign_keys = OFF').run();

    context.db.prepare(`
      INSERT INTO customers (id, name, phone)
      VALUES (1, 'Customer A', '9999999999')
    `).run();

    context.db.prepare(`
      INSERT INTO vehicles (id, customer_id, registration_number)
      VALUES 
        (1, 1, 'MH12AB1234'),
        (2, 1, 'MH12CD5678'),
        (3, 1, 'MH12EF9012')
    `).run();

    // Insert job cards:
    // Open cards: 1 draft, 1 in_progress
    context.db.prepare(`
      INSERT INTO job_cards (job_card_number, customer_id, vehicle_id, status)
      VALUES 
        ('JC-001', 1, 1, 'DRAFT'),
        ('JC-002', 1, 2, 'IN_PROGRESS')
    `).run();

    // Completed cards for 2026-06-05:
    // Vehicle 1 and Vehicle 2 (distinct count should be 2)
    context.db.prepare(`
      INSERT INTO job_cards (job_card_number, customer_id, vehicle_id, status, closed_at)
      VALUES 
        ('JC-003', 1, 1, 'COMPLETED', '2026-06-05 10:00:00'),
        ('JC-004', 1, 2, 'COMPLETED', '2026-06-05 14:30:00'),
        ('JC-005', 1, 1, 'COMPLETED', '2026-06-05 16:00:00')
    `).run();

    // Completed card for 2026-06-04 (yesterday):
    // Vehicle 3
    context.db.prepare(`
      INSERT INTO job_cards (job_card_number, customer_id, vehicle_id, status, closed_at)
      VALUES 
        ('JC-006', 1, 3, 'COMPLETED', '2026-06-04 11:00:00')
    `).run();

    // Cancelled card
    context.db.prepare(`
      INSERT INTO job_cards (job_card_number, customer_id, vehicle_id, status)
      VALUES 
        ('JC-007', 1, 1, 'CANCELLED')
    `).run();

    context.db.prepare('PRAGMA foreign_keys = ON').run();

    // 3. Request for 2026-06-05
    const resultToday = await context.request('/api/v1/dashboard/operations?date=2026-06-05', { headers });
    assert.equal(resultToday.response.status, 200);
    assert.deepEqual(resultToday.body, {
      openJobCards: 2,
      completedJobCards: 4,
      vehiclesServicedToday: 2, // JC-003, JC-004, JC-005 (only vehicles 1 and 2, so 2 unique vehicles)
    });

    // 4. Request for 2026-06-04
    const resultYesterday = await context.request('/api/v1/dashboard/operations?date=2026-06-04', { headers });
    assert.equal(resultYesterday.response.status, 200);
    assert.deepEqual(resultYesterday.body, {
      openJobCards: 2,
      completedJobCards: 4,
      vehiclesServicedToday: 1, // JC-006 (vehicle 3)
    });

    // 5. Default date defaults to current date (successfully runs without throwing)
    const resultDefault = await context.request('/api/v1/dashboard/operations', { headers });
    assert.equal(resultDefault.response.status, 200);
    assert.ok('openJobCards' in resultDefault.body);
    assert.ok('completedJobCards' in resultDefault.body);
    assert.ok('vehiclesServicedToday' in resultDefault.body);

    // 6. Invalid date format returns 400 validation error
    const resultInvalid = await context.request('/api/v1/dashboard/operations?date=05-06-2026', { headers });
    assert.equal(resultInvalid.response.status, 400);
    assert.equal(resultInvalid.body.error.code, 'VALIDATION_ERROR');
    assert.equal(resultInvalid.body.error.message, 'Today date must be a valid YYYY-MM-DD date.');

  } finally {
    await context.close();
  }
});

test('dashboard financial API - authentication, permission, and calculation constraints', async () => {
  const context = await createDashboardApiTestContext();

  try {
    // 1. Unauthenticated request should fail
    const unauthResult = await context.request('/api/v1/dashboard/financial');
    assert.equal(unauthResult.response.status, 401);
    assert.equal(unauthResult.body.error.code, 'AUTH_TOKEN_REQUIRED');

    // 2. Users without permission (e.g. custom role without dashboard.read) should be denied with 403
    context.db.prepare(`
      INSERT INTO roles (id, name, description)
      VALUES (99, 'Test No Perm Role', 'Role for testing no permission')
    `).run();
    context.db.prepare(`
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES (99, (SELECT id FROM permissions WHERE key = 'customers.read' LIMIT 1))
    `).run();
    const adminUser = context.db.prepare("SELECT password_hash FROM users WHERE username = 'admin'").get();
    context.db.prepare(`
      INSERT INTO users (id, name, username, password_hash, role_id)
      VALUES (99, 'No Perm User', 'nopermuser', ?, 99)
    `).run(adminUser.password_hash);

    const nopermResult = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'nopermuser',
        password: 'Admin@12345',
      }),
    });
    assert.equal(nopermResult.response.status, 200);
    const nopermToken = nopermResult.body.token;

    const forbiddenResult = await context.request('/api/v1/dashboard/financial', {
      headers: authHeaders(nopermToken),
    });
    assert.equal(forbiddenResult.response.status, 403);
    assert.equal(forbiddenResult.body.error.code, 'PERMISSION_DENIED');

    // Login as admin for subsequent valid calls
    const token = await login(context);
    const headers = authHeaders(token);

    // 3. Empty database should return valid zero values
    const emptyResult = await context.request('/api/v1/dashboard/financial', { headers });
    assert.equal(emptyResult.response.status, 200);
    assert.deepEqual(emptyResult.body, {
      today: {
        revenue: 0,
        grossProfit: 0,
        netProfit: 0,
      },
      thisMonth: {
        revenue: 0,
        expenses: 0,
        grossProfit: 0,
        netProfit: 0,
      },
    });

    // Seed invoices and profit_records using SQL
    context.db.prepare('PRAGMA foreign_keys = OFF').run();

    // Create a customer for foreign keys
    context.db.prepare(`
      INSERT INTO customers (id, name, phone) VALUES (1, 'Customer A', '9999999999')
    `).run();

    // Invoice 1 (Today: 2026-06-05) - Active
    context.db.prepare(`
      INSERT INTO invoices (id, invoice_number, customer_id, invoice_date, status)
      VALUES (1, 'INV-001', 1, '2026-06-05', 'FINALIZED')
    `).run();
    context.db.prepare(`
      INSERT INTO profit_records (invoice_id, revenue, cost_total, gross_profit, net_profit)
      VALUES (1, 1000, 400, 600, 600)
    `).run();

    // Invoice 2 (Yesterday: 2026-06-04) - Active
    context.db.prepare(`
      INSERT INTO invoices (id, invoice_number, customer_id, invoice_date, status)
      VALUES (2, 'INV-002', 1, '2026-06-04', 'FINALIZED')
    `).run();
    context.db.prepare(`
      INSERT INTO profit_records (invoice_id, revenue, cost_total, gross_profit, net_profit)
      VALUES (2, 2000, 800, 1200, 1200)
    `).run();

    // Invoice 3 (Today: 2026-06-05) - Cancelled (should be excluded)
    context.db.prepare(`
      INSERT INTO invoices (id, invoice_number, customer_id, invoice_date, status)
      VALUES (3, 'INV-003', 1, '2026-06-05', 'CANCELLED')
    `).run();
    context.db.prepare(`
      INSERT INTO profit_records (invoice_id, revenue, cost_total, gross_profit, net_profit)
      VALUES (3, 5000, 2000, 3000, 3000)
    `).run();

    // Seed expenses
    context.db.prepare(`
      INSERT INTO expenses (category, expense_date, amount)
      VALUES 
        ('Rent', '2026-06-05', 150),
        ('Salary', '2026-06-04', 250),
        ('Electricity', '2026-05-20', 500)
    `).run();

    context.db.prepare('PRAGMA foreign_keys = ON').run();

    // 4. Request for 2026-06-05 (Today)
    const resultToday = await context.request('/api/v1/dashboard/financial?date=2026-06-05', { headers });
    assert.equal(resultToday.response.status, 200);
    assert.deepEqual(resultToday.body, {
      today: {
        revenue: 1000,
        grossProfit: 600,
        netProfit: 450, // 600 GP - 150 Today Expense
      },
      thisMonth: {
        revenue: 3000, // INV-001 (1000) + INV-002 (2000)
        expenses: 400, // Today Expense (150) + Yesterday Expense (250)
        grossProfit: 1800, // 600 + 1200
        netProfit: 1400, // 1800 GP - 400 Expenses
      },
    });

    // 5. Invalid date format returns 400 validation error
    const resultInvalid = await context.request('/api/v1/dashboard/financial?date=05-06-2026', { headers });
    assert.equal(resultInvalid.response.status, 400);
    assert.equal(resultInvalid.body.error.code, 'VALIDATION_ERROR');
    assert.equal(resultInvalid.body.error.message, 'Today date must be a valid YYYY-MM-DD date.');

  } finally {
    await context.close();
  }
});

test('dashboard sales API - authentication, permission, and calculation constraints', async () => {
  const context = await createDashboardApiTestContext();

  try {
    // 1. Unauthenticated request should fail
    const unauthResult = await context.request('/api/v1/dashboard/sales');
    assert.equal(unauthResult.response.status, 401);
    assert.equal(unauthResult.body.error.code, 'AUTH_TOKEN_REQUIRED');

    // 2. Users without permission should be denied with 403
    context.db.prepare(`
      INSERT INTO roles (id, name, description)
      VALUES (99, 'Test No Perm Role', 'Role for testing no permission')
    `).run();
    context.db.prepare(`
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES (99, (SELECT id FROM permissions WHERE key = 'customers.read' LIMIT 1))
    `).run();
    const adminUser = context.db.prepare("SELECT password_hash FROM users WHERE username = 'admin'").get();
    context.db.prepare(`
      INSERT INTO users (id, name, username, password_hash, role_id)
      VALUES (99, 'No Perm User', 'nopermuser', ?, 99)
    `).run(adminUser.password_hash);

    const nopermResult = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'nopermuser',
        password: 'Admin@12345',
      }),
    });
    assert.equal(nopermResult.response.status, 200);
    const nopermToken = nopermResult.body.token;

    const forbiddenResult = await context.request('/api/v1/dashboard/sales', {
      headers: authHeaders(nopermToken),
    });
    assert.equal(forbiddenResult.response.status, 403);
    assert.equal(forbiddenResult.body.error.code, 'PERMISSION_DENIED');

    // Login as admin for subsequent valid calls
    const token = await login(context);
    const headers = authHeaders(token);

    // 3. Empty database should return valid zero values
    const emptyResult = await context.request('/api/v1/dashboard/sales', { headers });
    assert.equal(emptyResult.response.status, 200);
    assert.deepEqual(emptyResult.body, {
      summary: {
        invoicesToday: 0,
        invoicesThisMonth: 0,
        averageInvoiceValue: 0
      },
      topCustomers: [],
      topServices: [],
      recentSales: []
    });

    // Seed test data using SQL
    context.db.prepare('PRAGMA foreign_keys = OFF').run();

    // Customers
    context.db.prepare(`
      INSERT INTO customers (id, name, phone)
      VALUES 
        (1, 'Customer A', '9999999999'),
        (2, 'Customer B', '8888888888')
    `).run();

    // Invoice 1 (Today: 2026-06-05) - Active
    context.db.prepare(`
      INSERT INTO invoices (id, invoice_number, customer_id, invoice_date, status, grand_total, revenue, cost_total, gross_profit, net_profit)
      VALUES (1, 'INV-001', 1, '2026-06-05', 'FINALIZED', 1500, 1500, 500, 1000, 1000)
    `).run();
    context.db.prepare(`
      INSERT INTO profit_records (invoice_id, revenue, cost_total, gross_profit, net_profit)
      VALUES (1, 1500, 500, 1000, 1000)
    `).run();
    context.db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, item_type, description, quantity, unit_price, line_revenue, line_total)
      VALUES (1, 1, 'LABOR', 'Oil Change', 1, 300, 300, 300)
    `).run();

    // Invoice 2 (Today: 2026-06-05) - Active
    context.db.prepare(`
      INSERT INTO invoices (id, invoice_number, customer_id, invoice_date, status, grand_total, revenue, cost_total, gross_profit, net_profit)
      VALUES (2, 'INV-002', 2, '2026-06-05', 'FINALIZED', 2500, 2500, 1000, 1500, 1500)
    `).run();
    context.db.prepare(`
      INSERT INTO profit_records (invoice_id, revenue, cost_total, gross_profit, net_profit)
      VALUES (2, 2500, 1000, 1500, 1500)
    `).run();
    context.db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, item_type, description, quantity, unit_price, line_revenue, line_total)
      VALUES (2, 2, 'SERVICE', 'Brake Service', 1, 500, 500, 500)
    `).run();

    // Invoice 3 (Yesterday: 2026-06-04) - Active
    context.db.prepare(`
      INSERT INTO invoices (id, invoice_number, customer_id, invoice_date, status, grand_total, revenue, cost_total, gross_profit, net_profit)
      VALUES (3, 'INV-003', 1, '2026-06-04', 'FINALIZED', 2000, 2000, 800, 1200, 1200)
    `).run();
    context.db.prepare(`
      INSERT INTO profit_records (invoice_id, revenue, cost_total, gross_profit, net_profit)
      VALUES (3, 2000, 800, 1200, 1200)
    `).run();
    context.db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, item_type, description, quantity, unit_price, line_revenue, line_total)
      VALUES (3, 3, 'LABOR', '   Oil Change   ', 1, 300, 300, 300)
    `).run();

    // Invoice 4 (Today: 2026-06-05) - Cancelled (should be excluded)
    context.db.prepare(`
      INSERT INTO invoices (id, invoice_number, customer_id, invoice_date, status, grand_total, revenue, cost_total, gross_profit, net_profit)
      VALUES (4, 'INV-004', 1, '2026-06-05', 'CANCELLED', 10000, 10000, 4000, 6000, 6000)
    `).run();
    context.db.prepare(`
      INSERT INTO profit_records (invoice_id, revenue, cost_total, gross_profit, net_profit)
      VALUES (4, 10000, 4000, 6000, 6000)
    `).run();
    context.db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, item_type, description, quantity, unit_price, line_revenue, line_total)
      VALUES (4, 4, 'LABOR', 'Brake Service', 1, 500, 500, 500)
    `).run();

    context.db.prepare('PRAGMA foreign_keys = ON').run();

    // 4. Request for 2026-06-05
    const resultToday = await context.request('/api/v1/dashboard/sales?date=2026-06-05', { headers });
    assert.equal(resultToday.response.status, 200);
    assert.deepEqual(resultToday.body, {
      summary: {
        invoicesToday: 2, // INV-001, INV-002
        invoicesThisMonth: 3, // INV-001, INV-002, INV-003
        averageInvoiceValue: 2000 // (1500 + 2500 + 2000) / 3
      },
      topCustomers: [
        { customerId: 1, customer: 'Customer A', revenue: 3500, cost: 1300, profit: 2200 },
        { customerId: 2, customer: 'Customer B', revenue: 2500, cost: 1000, profit: 1500 }
      ],
      topServices: [
        { description: 'Oil Change', count: 2, totalQuantity: 2, totalRevenue: 600 },
        { description: 'Brake Service', count: 1, totalQuantity: 1, totalRevenue: 500 }
      ],
      recentSales: [
        { id: 2, invoiceNumber: 'INV-002', invoiceDate: '2026-06-05', grandTotal: 2500, customerName: 'Customer B' },
        { id: 1, invoiceNumber: 'INV-001', invoiceDate: '2026-06-05', grandTotal: 1500, customerName: 'Customer A' },
        { id: 3, invoiceNumber: 'INV-003', invoiceDate: '2026-06-04', grandTotal: 2000, customerName: 'Customer A' }
      ]
    });

    // 5. Invalid date format returns 400 validation error
    const resultInvalid = await context.request('/api/v1/dashboard/sales?date=05-06-2026', { headers });
    assert.equal(resultInvalid.response.status, 400);
    assert.equal(resultInvalid.body.error.code, 'VALIDATION_ERROR');
    assert.equal(resultInvalid.body.error.message, 'Today date must be a valid YYYY-MM-DD date.');

  } finally {
    await context.close();
  }
});

test('dashboard inventory API - authentication, permission, and calculation constraints', async () => {
  const context = await createDashboardApiTestContext();

  try {
    // 1. Unauthenticated request should fail
    const unauthResult = await context.request('/api/v1/dashboard/inventory');
    assert.equal(unauthResult.response.status, 401);
    assert.equal(unauthResult.body.error.code, 'AUTH_TOKEN_REQUIRED');

    // 2. Users without permission should be denied with 403
    context.db.prepare(`
      INSERT INTO roles (id, name, description)
      VALUES (99, 'Test No Perm Role', 'Role for testing no permission')
    `).run();
    context.db.prepare(`
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES (99, (SELECT id FROM permissions WHERE key = 'customers.read' LIMIT 1))
    `).run();
    const adminUser = context.db.prepare("SELECT password_hash FROM users WHERE username = 'admin'").get();
    context.db.prepare(`
      INSERT INTO users (id, name, username, password_hash, role_id)
      VALUES (99, 'No Perm User', 'nopermuser', ?, 99)
    `).run(adminUser.password_hash);

    const nopermResult = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'nopermuser',
        password: 'Admin@12345',
      }),
    });
    assert.equal(nopermResult.response.status, 200);
    const nopermToken = nopermResult.body.token;

    const forbiddenResult = await context.request('/api/v1/dashboard/inventory', {
      headers: authHeaders(nopermToken),
    });
    assert.equal(forbiddenResult.response.status, 403);
    assert.equal(forbiddenResult.body.error.code, 'PERMISSION_DENIED');

    // Login as admin for subsequent valid calls
    const token = await login(context);
    const headers = authHeaders(token);

    // 3. Empty database should return valid zero values (with seeded warehouses)
    const emptyResult = await context.request('/api/v1/dashboard/inventory', { headers });
    assert.equal(emptyResult.response.status, 200);
    assert.equal(emptyResult.body.totalItems, 0);
    assert.equal(emptyResult.body.totalQuantity, 0);
    assert.equal(emptyResult.body.totalValuation, 0);
    assert.equal(emptyResult.body.lowStockCount, 0);
    assert.deepEqual(emptyResult.body.lowStockItems, []);
    assert.ok(Array.isArray(emptyResult.body.warehouseSummary));
    assert.ok(emptyResult.body.warehouseSummary.length > 0);
    for (const wh of emptyResult.body.warehouseSummary) {
      assert.equal(wh.totalQuantity, 0);
      assert.equal(wh.totalValue, 0);
    }

    // Seed test data using SQL
    context.db.prepare('PRAGMA foreign_keys = OFF').run();

    // Insert inventory items:
    // Item 1: active, low stock (current = 5, reorder = 10)
    context.db.prepare(`
      INSERT INTO inventory_items (id, sku, item_name, current_quantity, average_cost, reorder_level, is_active, unit_of_measure)
      VALUES (1, 'SKU-A', 'Engine Oil', 5, 100, 10, 1, 'Ltrs')
    `).run();

    // Item 2: active, normal stock (current = 20, reorder = 10)
    context.db.prepare(`
      INSERT INTO inventory_items (id, sku, item_name, current_quantity, average_cost, reorder_level, is_active, unit_of_measure)
      VALUES (2, 'SKU-B', 'Oil Filter', 20, 200, 10, 1, 'pcs')
    `).run();

    // Item 3: inactive, low stock (current = 2, reorder = 10) - should be ignored
    context.db.prepare(`
      INSERT INTO inventory_items (id, sku, item_name, current_quantity, average_cost, reorder_level, is_active, unit_of_measure)
      VALUES (3, 'SKU-C', 'Spark Plug', 2, 50, 10, 0, 'pcs')
    `).run();

    // Insert batches into warehouses (main = 1, oil = 2 or based on seeded database)
    const warehouses = context.db.prepare('SELECT id, code FROM warehouses').all();
    const mainWh = warehouses.find(w => w.code === 'MAIN');
    const oilWh = warehouses.find(w => w.code === 'OIL');

    assert.ok(mainWh);
    assert.ok(oilWh);

    // Batch 1 for Item 1 in MAIN: quantity = 5, purchase_cost = 100
    context.db.prepare(`
      INSERT INTO inventory_batches (id, item_id, warehouse_id, batch_number, purchase_cost, selling_price, quantity)
      VALUES (1, 1, ?, 'B-001', 100, 150, 5)
    `).run(mainWh.id);

    // Batch 2 for Item 2 in OIL: quantity = 20, purchase_cost = 200
    context.db.prepare(`
      INSERT INTO inventory_batches (id, item_id, warehouse_id, batch_number, purchase_cost, selling_price, quantity)
      VALUES (2, 2, ?, 'B-002', 200, 250, 20)
    `).run(oilWh.id);

    // Batch 3 for Item 3 in MAIN (inactive item): quantity = 2, purchase_cost = 50
    context.db.prepare(`
      INSERT INTO inventory_batches (id, item_id, warehouse_id, batch_number, purchase_cost, selling_price, quantity)
      VALUES (3, 3, ?, 'B-003', 50, 80, 2)
    `).run(mainWh.id);

    context.db.prepare('PRAGMA foreign_keys = ON').run();

    // 4. Request inventory metrics
    const result = await context.request('/api/v1/dashboard/inventory', { headers });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.totalItems, 2); // Only active items (Item 1 and Item 2)
    assert.equal(result.body.totalQuantity, 25); // Item 1 (5) + Item 2 (20)
    assert.equal(result.body.totalValuation, 4500); // (5 * 100) + (20 * 200)
    assert.equal(result.body.lowStockCount, 1); // Only active low stock item (Item 1)
    assert.deepEqual(result.body.lowStockItems, [
      {
        id: 1,
        sku: 'SKU-A',
        itemName: 'Engine Oil',
        currentQuantity: 5,
        reorderLevel: 10,
        unitOfMeasure: 'Ltrs'
      }
    ]);

    // Check warehouse summaries
    const mainSummary = result.body.warehouseSummary.find(w => w.warehouseId === mainWh.id);
    const oilSummary = result.body.warehouseSummary.find(w => w.warehouseId === oilWh.id);

    assert.equal(mainSummary.totalQuantity, 7); // Batch 1 (5) + Batch 3 (2)
    assert.equal(mainSummary.totalValue, 600); // (5 * 100) + (2 * 50)
    assert.equal(oilSummary.totalQuantity, 20); // Batch 2 (20)
    assert.equal(oilSummary.totalValue, 4000); // (20 * 200)

  } finally {
    await context.close();
  }
});
