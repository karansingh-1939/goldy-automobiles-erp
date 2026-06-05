import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createApp } from '../app.js';
import { createDatabase } from '../database/connection.js';
import { runMigrations } from '../database/migrationRunner.js';
import { runSeeds } from '../database/seedRunner.js';
import { createGstRouter } from '../modules/gst/gst.routes.js';
import { errorHandler } from '../shared/middleware/errorHandler.js';

export async function createGstApiTestContext() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-erp-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  const db = createDatabase(dbPath);

  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_DEFAULT_PASSWORD = 'Admin@12345';
  process.env.SESSION_TTL_HOURS = '12';

  runMigrations(db);
  await runSeeds(db);

  const app = express();
  app.use('/api/v1/gst', createGstRouter(db));
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

export async function login(context) {
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

export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function createRecord(context, token, endpoint, payload) {
  const result = await context.request(endpoint, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

export async function createGstFixture(context, token) {
  const supplier = await createRecord(context, token, '/api/v1/suppliers', {
    name: `GST Supplier ${Date.now()}`,
    phone: `94${Math.floor(10000000 + Math.random() * 89999999)}`,
  });
  const mainWarehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
  const partItem = await createRecord(context, token, '/api/v1/inventory/items', {
    sku: `GST-PART-${Math.floor(Math.random() * 100000)}`,
    item_name: 'GST Brake Pad',
    category_id: context.db.prepare('SELECT id FROM inventory_categories ORDER BY id LIMIT 1').get().id,
    supplier_id: supplier.id,
    purchase_cost: 100,
    selling_price: 150,
    reorder_level: 1,
    gst_rate: 18,
    hsn_code: '87083000',
    unit_of_measure: 'pcs',
  });
  const cancelledItem = await createRecord(context, token, '/api/v1/inventory/items', {
    sku: `GST-CANCEL-${Math.floor(Math.random() * 100000)}`,
    item_name: 'GST Cancelled Part',
    category_id: context.db.prepare('SELECT id FROM inventory_categories ORDER BY id LIMIT 1').get().id,
    supplier_id: supplier.id,
    purchase_cost: 100,
    selling_price: 200,
    reorder_level: 1,
    gst_rate: 18,
    hsn_code: '87089900',
    unit_of_measure: 'pcs',
  });

  const activeStock = await createRecord(context, token, '/api/v1/inventory/opening-stock', {
    item_id: partItem.id,
    warehouse_id: mainWarehouse.id,
    supplier_id: supplier.id,
    batch_number: `GST-ACTIVE-${Math.floor(Math.random() * 100000)}`,
    quantity: 5,
    unit_cost: 100,
    reason: 'GST active setup',
  });
  const cancelledStock = await createRecord(context, token, '/api/v1/inventory/opening-stock', {
    item_id: cancelledItem.id,
    warehouse_id: mainWarehouse.id,
    supplier_id: supplier.id,
    batch_number: `GST-CANCEL-${Math.floor(Math.random() * 100000)}`,
    quantity: 5,
    unit_cost: 100,
    reason: 'GST cancel setup',
  });

  const customer = await createRecord(context, token, '/api/v1/customers', {
    name: `GST Customer ${Date.now()}`,
    phone: `93${Math.floor(10000000 + Math.random() * 89999999)}`,
    gstin: '27AABCU9603R1ZM',
    state: 'Maharashtra',
    city: 'Pune',
  });
  const vehicle = await createRecord(context, token, '/api/v1/vehicles', {
    customer_id: customer.id,
    registration_number: `MH12GST${Math.floor(100 + Math.random() * 899)}`,
    make: 'Maruti',
    model: 'Swift',
    odometer_reading: 50000,
  });
  const admin = context.db.prepare("SELECT id FROM users WHERE username = 'admin'").get();

  async function finalizeInvoice({ label, item, batch, invoiceDate, quantity = 2 }) {
    const jobCard = await createRecord(context, token, '/api/v1/job-cards', {
      customer_id: customer.id,
      vehicle_id: vehicle.id,
      odometer_reading: 50100,
      complaint: `GST ${label}`,
      assigned_to: admin.id,
    });

    await createRecord(context, token, `/api/v1/job-cards/${jobCard.id}/parts`, {
      inventory_item_id: item.id,
      batch_id: batch.id,
      quantity,
      selling_price: item.selling_price,
      gst_rate: item.gst_rate,
    });
    await createRecord(context, token, `/api/v1/job-cards/${jobCard.id}/labour`, {
      description: `GST labour ${label}`,
      labour_charge: 500,
      gst_rate: 0,
    });

    const finalized = await createRecord(context, token, `/api/v1/job-cards/${jobCard.id}/finalize`, {});
    context.db.prepare(`
      UPDATE invoices
      SET invoice_date = ?
      WHERE id = ?
    `).run(invoiceDate, finalized.invoice.id);

    return {
      ...finalized.invoice,
      invoice_date: invoiceDate,
    };
  }

  const juneInvoice = await finalizeInvoice({
    label: 'June',
    item: partItem,
    batch: activeStock.batch,
    invoiceDate: '2026-06-04',
  });
  const mayInvoice = await finalizeInvoice({
    label: 'May',
    item: partItem,
    batch: activeStock.batch,
    invoiceDate: '2026-05-20',
    quantity: 1,
  });
  const cancelledInvoice = await finalizeInvoice({
    label: 'Cancelled',
    item: cancelledItem,
    batch: cancelledStock.batch,
    invoiceDate: '2026-06-10',
    quantity: 1,
  });

  const cancelResult = await context.request(`/api/v1/invoices/${cancelledInvoice.id}/cancel`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  assert.equal(cancelResult.response.status, 200, JSON.stringify(cancelResult.body));

  return {
    customer,
    partItem,
    juneInvoice,
    mayInvoice,
    cancelledInvoice,
  };
}
