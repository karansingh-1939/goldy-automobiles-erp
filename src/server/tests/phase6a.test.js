import assert from 'node:assert/strict';
import test from 'node:test';
import { GstRepository } from '../modules/gst/gst.repository.js';
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

async function createRecord(context, token, endpoint, payload) {
  const result = await context.request(endpoint, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

async function createGstFixture(context, token) {
  const supplier = await createRecord(context, token, '/api/v1/suppliers', {
    name: `P6A Supplier ${Date.now()}`,
    phone: `94${Math.floor(10000000 + Math.random() * 89999999)}`,
  });
  const mainWarehouse = context.db.prepare("SELECT id FROM warehouses WHERE code = 'MAIN'").get();
  const partItem = await createRecord(context, token, '/api/v1/inventory/items', {
    sku: `P6A-PART-${Math.floor(Math.random() * 100000)}`,
    item_name: 'P6A GST Brake Pad',
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
    sku: `P6A-CANCEL-${Math.floor(Math.random() * 100000)}`,
    item_name: 'P6A Cancelled Part',
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
    batch_number: `P6A-ACTIVE-${Math.floor(Math.random() * 100000)}`,
    quantity: 5,
    unit_cost: 100,
    reason: 'P6A active setup',
  });
  const cancelledStock = await createRecord(context, token, '/api/v1/inventory/opening-stock', {
    item_id: cancelledItem.id,
    warehouse_id: mainWarehouse.id,
    supplier_id: supplier.id,
    batch_number: `P6A-CANCEL-${Math.floor(Math.random() * 100000)}`,
    quantity: 5,
    unit_cost: 100,
    reason: 'P6A cancel setup',
  });

  const customer = await createRecord(context, token, '/api/v1/customers', {
    name: `P6A Customer ${Date.now()}`,
    phone: `93${Math.floor(10000000 + Math.random() * 89999999)}`,
    gstin: '27AABCU9603R1ZM',
    state: 'Maharashtra',
    city: 'Pune',
  });
  const vehicle = await createRecord(context, token, '/api/v1/vehicles', {
    customer_id: customer.id,
    registration_number: `MH12P6A${Math.floor(100 + Math.random() * 899)}`,
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
      complaint: `P6A ${label}`,
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
      description: `P6A labour ${label}`,
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

test('gst repository summary, GSTR datasets, and HSN summary exclude cancelled invoices', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const fixture = await createGstFixture(context, token);
    const repository = new GstRepository(context.db);
    const juneFilters = { dateFrom: '2026-06-01', dateTo: '2026-06-30' };

    const summary = repository.summary(juneFilters);
    assert.equal(summary.invoice_count, 1);
    assert.equal(summary.line_count, 2);
    assert.equal(summary.taxable_value, 800);
    assert.equal(summary.cgst_amount, 27);
    assert.equal(summary.sgst_amount, 27);
    assert.equal(summary.igst_amount, 0);
    assert.equal(summary.total_tax, 54);
    assert.equal(summary.gross_value, 854);

    const gstr1 = repository.gstr1Dataset(juneFilters);
    assert.equal(gstr1.length, 2);

    const partLine = gstr1.find((row) => row.item_type === 'PART');
    const labourLine = gstr1.find((row) => row.item_type === 'LABOR');

    assert.equal(partLine.invoice_id, fixture.juneInvoice.id);
    assert.equal(partLine.customer_gstin, '27AABCU9603R1ZM');
    assert.equal(partLine.place_of_supply, 'Maharashtra');
    assert.equal(partLine.hsn_sac, '87083000');
    assert.equal(partLine.taxable_value, 300);
    assert.equal(partLine.gst_rate, 18);
    assert.equal(partLine.cgst_amount, 27);
    assert.equal(partLine.sgst_amount, 27);
    assert.equal(partLine.total_tax, 54);

    assert.equal(labourLine.hsn_sac, 'UNSPECIFIED');
    assert.equal(labourLine.taxable_value, 500);
    assert.equal(labourLine.total_tax, 0);

    const gstr3b = repository.gstr3bDataset(juneFilters);
    assert.equal(gstr3b.outward_supplies.invoice_count, 1);
    assert.equal(gstr3b.outward_supplies.taxable_value, 800);
    assert.equal(gstr3b.outward_supplies.central_tax, 27);
    assert.equal(gstr3b.outward_supplies.state_ut_tax, 27);
    assert.equal(gstr3b.outward_supplies.integrated_tax, 0);
    assert.equal(gstr3b.outward_supplies.total_tax, 54);
    assert.equal(gstr3b.rate_breakdown.length, 2);

    const taxedRate = gstr3b.rate_breakdown.find((row) => row.gst_rate === 18);
    const zeroRate = gstr3b.rate_breakdown.find((row) => row.gst_rate === 0);
    assert.equal(taxedRate.taxable_value, 300);
    assert.equal(taxedRate.total_tax, 54);
    assert.equal(zeroRate.taxable_value, 500);
    assert.equal(zeroRate.total_tax, 0);

    const hsn = repository.hsnSummary(juneFilters);
    assert.equal(hsn.length, 2);

    const partHsn = hsn.find((row) => row.hsn_sac === '87083000');
    const labourHsn = hsn.find((row) => row.hsn_sac === 'UNSPECIFIED');
    assert.equal(partHsn.quantity, 2);
    assert.equal(partHsn.taxable_value, 300);
    assert.equal(partHsn.total_tax, 54);
    assert.equal(labourHsn.taxable_value, 500);
    assert.equal(labourHsn.total_tax, 0);

    const allActive = repository.summary();
    assert.equal(allActive.invoice_count, 2);
    assert.equal(allActive.taxable_value, 1450);
    assert.equal(allActive.total_tax, 81);

    const cancelledOnly = repository.gstr1Dataset({ dateFrom: '2026-06-10', dateTo: '2026-06-10' });
    assert.equal(cancelledOnly.length, 0);
  } finally {
    await context.close();
  }
});

test('gst repository date filters limit invoice datasets', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    await createGstFixture(context, token);
    const repository = new GstRepository(context.db);

    const mayOnly = repository.summary({ dateFrom: '2026-05-01', dateTo: '2026-05-31' });
    assert.equal(mayOnly.invoice_count, 1);
    assert.equal(mayOnly.taxable_value, 650);
    assert.equal(mayOnly.total_tax, 27);

    const mayLines = repository.gstr1Dataset({ dateFrom: '2026-05-01', dateTo: '2026-05-31' });
    assert.equal(mayLines.length, 2);
    assert.ok(mayLines.every((row) => row.invoice_date === '2026-05-20'));
  } finally {
    await context.close();
  }
});
