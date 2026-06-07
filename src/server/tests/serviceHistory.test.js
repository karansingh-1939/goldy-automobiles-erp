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
import { createServiceHistoryRouter } from '../modules/serviceHistory/serviceHistory.routes.js';
import { errorHandler } from '../shared/middleware/errorHandler.js';

async function createServiceHistoryApiTestContext() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-erp-history-'));
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

  const app = createApp({ db });

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

test('service history API - authentication and authorization constraints', async () => {
  const context = await createServiceHistoryApiTestContext();

  try {
    // 1. Unauthenticated requests should fail with 401
    const unauthVehicle = await context.request('/api/v1/vehicles/1/service-history');
    assert.equal(unauthVehicle.response.status, 401);
    assert.equal(unauthVehicle.body.error.code, 'AUTH_TOKEN_REQUIRED');

    const unauthCustomer = await context.request('/api/v1/customers/1/service-history');
    assert.equal(unauthCustomer.response.status, 401);
    assert.equal(unauthCustomer.body.error.code, 'AUTH_TOKEN_REQUIRED');

    // 2. Users lacking specific read permissions should be denied with 403
    context.db.prepare(`
      INSERT INTO roles (id, name, description)
      VALUES (99, 'Test Minimal Role', 'Role for testing auth bypass')
    `).run();
    // Only link user permission, leaving out customers.read and vehicles.read
    context.db.prepare(`
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES (99, (SELECT id FROM permissions WHERE key = 'users.manage' LIMIT 1))
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

    const forbiddenVehicle = await context.request('/api/v1/vehicles/1/service-history', {
      headers: authHeaders(nopermToken),
    });
    assert.equal(forbiddenVehicle.response.status, 403);
    assert.equal(forbiddenVehicle.body.error.code, 'PERMISSION_DENIED');

    const forbiddenCustomer = await context.request('/api/v1/customers/1/service-history', {
      headers: authHeaders(nopermToken),
    });
    assert.equal(forbiddenCustomer.response.status, 403);
    assert.equal(forbiddenCustomer.body.error.code, 'PERMISSION_DENIED');

  } finally {
    await context.close();
  }
});

test('service history API - entity existence checks', async () => {
  const context = await createServiceHistoryApiTestContext();

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // Requesting unknown vehicle returns 404
    const unknownVehicle = await context.request('/api/v1/vehicles/999/service-history', { headers });
    assert.equal(unknownVehicle.response.status, 404);
    assert.equal(unknownVehicle.body.error.code, 'ITEM_NOT_FOUND');

    // Requesting unknown customer returns 404
    const unknownCustomer = await context.request('/api/v1/customers/999/service-history', { headers });
    assert.equal(unknownCustomer.response.status, 404);
    assert.equal(unknownCustomer.body.error.code, 'ITEM_NOT_FOUND');

  } finally {
    await context.close();
  }
});

test('service history API - empty history and populated service records', async () => {
  const context = await createServiceHistoryApiTestContext();

  try {
    const token = await login(context);
    const headers = authHeaders(token);

    // Seed base entities
    context.db.prepare('PRAGMA foreign_keys = OFF').run();

    // Customer A (id=1)
    context.db.prepare(`
      INSERT INTO customers (id, name, phone)
      VALUES (1, 'Customer A', '9999999999')
    `).run();

    // Customer B (id=2)
    context.db.prepare(`
      INSERT INTO customers (id, name, phone)
      VALUES (2, 'Customer B', '8888888888')
    `).run();

    // Vehicle 1: Swift (owned by Customer A, has service visits)
    context.db.prepare(`
      INSERT INTO vehicles (id, customer_id, registration_number, make, model)
      VALUES (1, 1, 'MH12AB1234', 'Suzuki', 'Swift')
    `).run();

    // Vehicle 2: Alto (owned by Customer B, should not mix with Customer A)
    context.db.prepare(`
      INSERT INTO vehicles (id, customer_id, registration_number, make, model)
      VALUES (2, 2, 'MH12CD5678', 'Suzuki', 'Alto')
    `).run();

    // Vehicle 3: Baleno (owned by Customer A, has no history records)
    context.db.prepare(`
      INSERT INTO vehicles (id, customer_id, registration_number, make, model)
      VALUES (3, 1, 'MH12EF9012', 'Suzuki', 'Baleno')
    `).run();

    context.db.prepare('PRAGMA foreign_keys = ON').run();

    // 1. Verify Empty History logic for Vehicle 3
    const emptyResult = await context.request('/api/v1/vehicles/3/service-history', { headers });
    assert.equal(emptyResult.response.status, 200);
    assert.deepEqual(emptyResult.body, {
      vehicle: {
        id: 3,
        customerId: 1,
        registrationNumber: 'MH12EF9012',
        make: 'Suzuki',
        model: 'Baleno',
        variant: null,
        fuelType: null,
        year: null,
        vin: null,
        engineNumber: null,
        odometerReading: 0,
        createdAt: emptyResult.body.vehicle.createdAt,
        updatedAt: emptyResult.body.vehicle.updatedAt
      },
      customer: {
        id: 1,
        name: 'Customer A',
        phone: '9999999999',
        alternatePhone: null,
        email: null,
        gstin: null,
        address: null,
        city: null,
        state: null,
        pincode: null,
        notes: null,
        createdAt: emptyResult.body.customer.createdAt,
        updatedAt: emptyResult.body.customer.updatedAt
      },
      summary: {
        totalVisits: 0,
        totalRevenue: 0,
        lastVisitDate: null
      },
      history: []
    });

    // Seed service visits for Vehicle 1
    context.db.prepare('PRAGMA foreign_keys = OFF').run();

    // Visit 1: Completed Job Card (id=1) + Finalized Invoice (id=10) on 2026-06-05
    context.db.prepare(`
      INSERT INTO job_cards (id, job_card_number, customer_id, vehicle_id, status, complaint, opened_at, closed_at)
      VALUES (1, 'JC-001', 1, 1, 'COMPLETED', 'Engine diagnostics', '2026-06-05 10:00:00', '2026-06-05 13:00:00')
    `).run();
    context.db.prepare(`
      INSERT INTO invoices (id, invoice_number, job_card_id, customer_id, vehicle_id, invoice_date, grand_total, status)
      VALUES (10, 'INV-101', 1, 1, 1, '2026-06-05', 1500, 'FINALIZED')
    `).run();
    context.db.prepare(`
      INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, line_total)
      VALUES (10, 'LABOR', 'Engine Service Tune-up', 1, 1500, 1500)
    `).run();

    // Visit 2: Uninvoiced Job Card (id=2) in DRAFT state on 2026-06-04 (No invoice)
    context.db.prepare(`
      INSERT INTO job_cards (id, job_card_number, customer_id, vehicle_id, status, complaint, opened_at)
      VALUES (2, 'JC-002', 1, 1, 'DRAFT', 'Brake noise check', '2026-06-04 11:30:00')
    `).run();
    context.db.prepare(`
      INSERT INTO job_card_items (job_card_id, item_type, description, quantity, selling_price, line_total)
      VALUES (2, 'PART', 'Spark Plug', 4, 100, 400)
    `).run();

    // Visit 3: Completed Job Card (id=3) + Cancelled Invoice (id=20) on 2026-06-03
    context.db.prepare(`
      INSERT INTO job_cards (id, job_card_number, customer_id, vehicle_id, status, opened_at)
      VALUES (3, 'JC-003', 1, 1, 'COMPLETED', '2026-06-03 09:00:00')
    `).run();
    context.db.prepare(`
      INSERT INTO invoices (id, invoice_number, job_card_id, customer_id, vehicle_id, invoice_date, grand_total, status)
      VALUES (20, 'INV-102', 3, 1, 1, '2026-06-03', 5000, 'CANCELLED')
    `).run();
    context.db.prepare(`
      INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, line_total)
      VALUES (20, 'PART', 'Brake Pad Set', 1, 5000, 5000)
    `).run();

    context.db.prepare('PRAGMA foreign_keys = ON').run();

    // 2. Verify Vehicle 1 History & Summary calculations
    const resultVehicle = await context.request('/api/v1/vehicles/1/service-history', { headers });
    assert.equal(resultVehicle.response.status, 200);

    // Verify summary
    assert.equal(resultVehicle.body.summary.totalVisits, 3);
    assert.equal(resultVehicle.body.summary.totalRevenue, 1500); // 1500 (FINALIZED) + 0 (DRAFT) + 0 (CANCELLED)
    assert.equal(resultVehicle.body.summary.lastVisitDate, '2026-06-05');

    // Verify chronological order (newest first)
    const history = resultVehicle.body.history;
    assert.equal(history.length, 3);

    // Visit 1: Finalized Invoice (2026-06-05)
    assert.equal(history[0].serviceDate, '2026-06-05');
    assert.equal(history[0].jobCardNumber, 'JC-001');
    assert.equal(history[0].invoiceNumber, 'INV-101');
    assert.equal(history[0].invoiceStatus, 'FINALIZED');
    assert.equal(history[0].invoiceTotal, 1500);
    assert.deepEqual(history[0].services, [
      { description: 'Engine Service Tune-up', quantity: 1, unitPrice: 1500, lineTotal: 1500 }
    ]);
    assert.deepEqual(history[0].parts, []);

    // Visit 2: Uninvoiced DRAFT Job Card (2026-06-04)
    assert.equal(history[1].serviceDate, '2026-06-04');
    assert.equal(history[1].jobCardNumber, 'JC-002');
    assert.equal(history[1].invoiceNumber, null);
    assert.equal(history[1].invoiceStatus, null);
    assert.equal(history[1].invoiceTotal, 0);
    assert.deepEqual(history[1].services, []);
    assert.deepEqual(history[1].parts, [
      { description: 'Spark Plug', quantity: 4, unitPrice: 100, lineTotal: 400 }
    ]);

    // Visit 3: Cancelled Invoice (2026-06-03)
    assert.equal(history[2].serviceDate, '2026-06-03');
    assert.equal(history[2].jobCardNumber, 'JC-003');
    assert.equal(history[2].invoiceNumber, 'INV-102');
    assert.equal(history[2].invoiceStatus, 'CANCELLED');
    assert.equal(history[2].invoiceTotal, 5000); // total is returned as raw amount, but omitted from totalRevenue sum
    assert.deepEqual(history[2].services, []);
    assert.deepEqual(history[2].parts, [
      { description: 'Brake Pad Set', quantity: 1, unitPrice: 5000, lineTotal: 5000 }
    ]);

    // 3. Verify Customer Service History boundary constraints (Customer A)
    const resultCustomer = await context.request('/api/v1/customers/1/service-history', { headers });
    assert.equal(resultCustomer.response.status, 200);

    // Customer A owns vehicle 1 (with 3 history items) and vehicle 3 (empty history)
    assert.equal(resultCustomer.body.customer.name, 'Customer A');
    assert.equal(resultCustomer.body.vehicles.length, 2);

    // Verify first nested vehicle is Vehicle 1
    const v1Nested = resultCustomer.body.vehicles.find((vh) => vh.vehicle.id === 1);
    assert.ok(v1Nested);
    assert.equal(v1Nested.summary.totalVisits, 3);
    assert.equal(v1Nested.summary.totalRevenue, 1500);

    // Verify second nested vehicle is Vehicle 3
    const v3Nested = resultCustomer.body.vehicles.find((vh) => vh.vehicle.id === 3);
    assert.ok(v3Nested);
    assert.equal(v3Nested.summary.totalVisits, 0);
    assert.equal(v3Nested.summary.totalRevenue, 0);

    // Alto (Vehicle 2) belongs to Customer B, so it should not exist in Customer A's list
    const v2Nested = resultCustomer.body.vehicles.find((vh) => vh.vehicle.id === 2);
    assert.equal(v2Nested, undefined);

  } finally {
    await context.close();
  }
});
