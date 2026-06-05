import assert from 'node:assert/strict';
import test from 'node:test';
import { authHeaders, createGstApiTestContext, createGstFixture, login } from './gstTestHelpers.js';

const juneQuery = '?period=custom&dateFrom=2026-06-01&dateTo=2026-06-30';

test('gst API exposes summary, gstr1, gstr3b, and hsn-summary with filtered report data', async () => {
  const context = await createGstApiTestContext();

  try {
    const token = await login(context);
    const fixture = await createGstFixture(context, token);
    const headers = authHeaders(token);

    const summary = await context.request(`/api/v1/gst/summary${juneQuery}`, { headers });
    assert.equal(summary.response.status, 200, JSON.stringify(summary.body));
    assert.deepEqual(summary.body.filters, {
      period: 'custom',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });
    assert.deepEqual(summary.body.data, {
      invoiceCount: 1,
      lineCount: 2,
      taxableValue: 800,
      cgstAmount: 27,
      sgstAmount: 27,
      igstAmount: 0,
      totalTax: 54,
      grossValue: 854,
    });

    const gstr1 = await context.request(`/api/v1/gst/gstr1${juneQuery}`, { headers });
    assert.equal(gstr1.response.status, 200, JSON.stringify(gstr1.body));
    assert.deepEqual(gstr1.body.filters, summary.body.filters);
    assert.equal(gstr1.body.data.length, 2);

    const partLine = gstr1.body.data.find((row) => row.itemType === 'PART');
    const labourLine = gstr1.body.data.find((row) => row.itemType === 'LABOR');
    assert.equal(partLine.invoiceId, fixture.juneInvoice.id);
    assert.equal(partLine.customerGstin, '27AABCU9603R1ZM');
    assert.equal(partLine.hsnSac, '87083000');
    assert.equal(labourLine.hsnSac, 'UNSPECIFIED');

    const gstr3b = await context.request(`/api/v1/gst/gstr3b${juneQuery}`, { headers });
    assert.equal(gstr3b.response.status, 200, JSON.stringify(gstr3b.body));
    assert.deepEqual(gstr3b.body.data.outwardSupplies, {
      invoiceCount: 1,
      taxableValue: 800,
      integratedTax: 0,
      centralTax: 27,
      stateUtTax: 27,
      cess: 0,
      totalTax: 54,
    });
    assert.equal(gstr3b.body.data.rateBreakdown.length, 2);

    const hsn = await context.request(`/api/v1/gst/hsn-summary${juneQuery}`, { headers });
    assert.equal(hsn.response.status, 200, JSON.stringify(hsn.body));
    assert.equal(hsn.body.data.length, 2);
    assert.ok(hsn.body.data.every((row) => 'hsnSac' in row && 'taxableValue' in row && 'totalTax' in row));
  } finally {
    await context.close();
  }
});

test('gst API applies custom date filters and excludes cancelled invoices', async () => {
  const context = await createGstApiTestContext();

  try {
    const token = await login(context);
    await createGstFixture(context, token);
    const headers = authHeaders(token);

    const maySummary = await context.request(
      '/api/v1/gst/summary?period=custom&dateFrom=2026-05-01&dateTo=2026-05-31',
      { headers },
    );
    assert.equal(maySummary.response.status, 200, JSON.stringify(maySummary.body));
    assert.equal(maySummary.body.data.invoiceCount, 1);
    assert.equal(maySummary.body.data.taxableValue, 650);
    assert.equal(maySummary.body.data.totalTax, 27);

    const cancelledWindow = await context.request(
      '/api/v1/gst/gstr1?period=custom&dateFrom=2026-06-10&dateTo=2026-06-10',
      { headers },
    );
    assert.equal(cancelledWindow.response.status, 200, JSON.stringify(cancelledWindow.body));
    assert.equal(cancelledWindow.body.data.length, 0);
  } finally {
    await context.close();
  }
});

test('gst API enforces authentication and date filter validation', async () => {
  const context = await createGstApiTestContext();

  try {
    const unauthenticated = await context.request('/api/v1/gst/summary');
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(unauthenticated.body.error.code, 'AUTH_TOKEN_REQUIRED');

    const token = await login(context);
    const headers = authHeaders(token);

    const invalidRange = await context.request(
      '/api/v1/gst/summary?period=custom&dateFrom=2026-06-30&dateTo=2026-06-01',
      { headers },
    );
    assert.equal(invalidRange.response.status, 400);
    assert.equal(invalidRange.body.error.code, 'VALIDATION_ERROR');
    assert.equal(invalidRange.body.error.message, 'Date range is invalid.');

    const missingCustomDate = await context.request(
      '/api/v1/gst/gstr3b?period=custom&dateFrom=2026-06-01',
      { headers },
    );
    assert.equal(missingCustomDate.response.status, 400);
    assert.equal(missingCustomDate.body.error.code, 'VALIDATION_ERROR');
    assert.equal(missingCustomDate.body.error.message, 'Custom range requires dateFrom and dateTo.');

    const invalidPeriod = await context.request('/api/v1/gst/hsn-summary?period=quarterly', { headers });
    assert.equal(invalidPeriod.response.status, 400);
    assert.equal(invalidPeriod.body.error.code, 'VALIDATION_ERROR');
    assert.equal(invalidPeriod.body.error.message, 'GST report period is invalid.');
  } finally {
    await context.close();
  }
});
