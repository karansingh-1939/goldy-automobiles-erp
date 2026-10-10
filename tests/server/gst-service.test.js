import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../../src/server/shared/errors/app-error.js';
import { createGstService } from '../../src/server/modules/gst/gst.service.js';
import { createTestContext } from './helpers.js';
import { createGstFixture, login } from './gst-test-helpers.js';

test('gst service returns summary, GSTR-1, GSTR-3B, and HSN reports with camelCase data', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const fixture = await createGstFixture(context, token);
    const service = createGstService(context.db);
    const query = {
      period: 'custom',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    };

    const summary = service.summary(query);
    assert.deepEqual(summary.filters, {
      period: 'custom',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });
    assert.deepEqual(summary.data, {
      invoiceCount: 1,
      creditNoteCount: 0,
      lineCount: 2,
      taxableValue: 800,
      cgstAmount: 27,
      sgstAmount: 27,
      igstAmount: 0,
      totalTax: 54,
      grossValue: 854,
    });

    const gstr1 = service.gstr1(query);
    assert.equal(gstr1.data.length, 2);

    const partLine = gstr1.data.find((row) => row.itemType === 'PART');
    const labourLine = gstr1.data.find((row) => row.itemType === 'LABOR');

    assert.equal(partLine.invoiceId, fixture.juneInvoice.id);
    assert.equal(partLine.customerGstin, '27AABCU9603R1ZM');
    assert.equal(partLine.placeOfSupply, 'Maharashtra');
    assert.equal(partLine.hsnSac, '87083000');
    assert.equal(partLine.taxableValue, 300);
    assert.equal(partLine.gstRate, 18);
    assert.equal(partLine.totalTax, 54);
    assert.equal(partLine.lineTotal, 354);

    assert.equal(labourLine.hsnSac, 'UNSPECIFIED');
    assert.equal(labourLine.taxableValue, 500);
    assert.equal(labourLine.totalTax, 0);

    const gstr3b = service.gstr3b(query);
    assert.deepEqual(gstr3b.data.outwardSupplies, {
      invoiceCount: 1,
      taxableValue: 800,
      integratedTax: 0,
      centralTax: 27,
      stateUtTax: 27,
      cess: 0,
      totalTax: 54,
    });
    assert.equal(gstr3b.data.rateBreakdown.length, 2);

    const taxedRate = gstr3b.data.rateBreakdown.find((row) => row.gstRate === 18);
    const zeroRate = gstr3b.data.rateBreakdown.find((row) => row.gstRate === 0);
    assert.equal(taxedRate.taxableValue, 300);
    assert.equal(taxedRate.totalTax, 54);
    assert.equal(zeroRate.taxableValue, 500);
    assert.equal(zeroRate.totalTax, 0);

    const hsn = service.hsnSummary(query);
    assert.equal(hsn.data.length, 2);

    const partHsn = hsn.data.find((row) => row.hsnSac === '87083000');
    const labourHsn = hsn.data.find((row) => row.hsnSac === 'UNSPECIFIED');
    assert.equal(partHsn.quantity, 2);
    assert.equal(partHsn.taxableValue, 300);
    assert.equal(partHsn.totalTax, 54);
    assert.equal(labourHsn.taxableValue, 500);
    assert.equal(labourHsn.totalTax, 0);
  } finally {
    await context.close();
  }
});

test('gst service excludes cancelled invoices and supports period presets', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    await createGstFixture(context, token);
    const service = createGstService(context.db);

    const allActive = service.summary();
    assert.equal(allActive.data.invoiceCount, 2);
    assert.equal(allActive.data.taxableValue, 1450);
    assert.equal(allActive.data.totalTax, 81);

    const cancelledWindow = service.gstr1({
      period: 'custom',
      dateFrom: '2026-06-10',
      dateTo: '2026-06-10',
    });
    assert.equal(cancelledWindow.data.length, 0);

    const mayOnly = service.summary({
      period: 'custom',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
    });
    assert.equal(mayOnly.data.invoiceCount, 1);
    assert.equal(mayOnly.data.taxableValue, 650);
    assert.equal(mayOnly.data.totalTax, 27);
  } finally {
    await context.close();
  }
});

test('gst service validates report query parameters', async () => {
  const context = await createTestContext();

  try {
    const service = createGstService(context.db);

    assert.throws(
      () => service.summary({ period: 'custom' }),
      (error) => error instanceof AppError && error.code === 'VALIDATION_ERROR',
    );

    assert.throws(
      () => service.gstr1({ period: 'quarterly' }),
      (error) => error instanceof AppError && error.message === 'GST report period is invalid.',
    );

    assert.throws(
      () => service.gstr3b({ dateFrom: '2026-06-30', dateTo: '2026-06-01' }),
      (error) => error instanceof AppError && error.message === 'Date range is invalid.',
    );

    assert.throws(
      () => service.hsnSummary({ dateFrom: '06-04-2026' }),
      (error) =>
        error instanceof AppError && error.message === 'Date from must be a valid YYYY-MM-DD date.',
    );
  } finally {
    await context.close();
  }
});
