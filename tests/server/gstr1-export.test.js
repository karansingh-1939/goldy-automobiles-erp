import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { localDate } from '../../src/server/shared/utils/local-date.js';

test('GSTR-1 export splits B2B and B2C, counts cancelled bills and downloads CSV', async () => {
  const context = await createTestContext();
  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const call = (path, body) =>
      context.request(path, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    const bill = async (suffix, labour) => {
      const job = await call('/api/v1/job-cards', {
        customer_name: `GST Test ${suffix}`,
        phone: `900006000${suffix}`,
        registration_number: `HR05GS000${suffix}`,
        make: 'Maruti',
        model: 'Alto',
        fuel_type: 'Petrol',
        odometer_reading: 1000,
        complaint: 'Service',
        fuel_level: '1/2',
      });
      await call(`/api/v1/job-cards/${job.body.data.id}/labour`, {
        description: 'Service labour',
        labour_charge: labour,
        gst_rate: 18,
      });
      return job.body.data;
    };

    const b2bJob = await bill(1, 1000);
    context.db
      .prepare("UPDATE customers SET gstin = '06ABCDE1234F1Z5', state = 'Haryana' WHERE id = ?")
      .run(b2bJob.customer_id);
    const b2b = await call(`/api/v1/job-cards/${b2bJob.id}/finalize`, {});
    assert.equal(b2b.response.status, 201, JSON.stringify(b2b.body));
    const b2cJob = await bill(2, 500);
    await call(`/api/v1/job-cards/${b2cJob.id}/finalize`, {});
    const cancelledJob = await bill(3, 200);
    const cancelled = await call(`/api/v1/job-cards/${cancelledJob.id}/finalize`, {});
    await call(`/api/v1/invoices/${cancelled.body.data.invoice.id}/cancel`, {});

    const today = localDate();
    const exported = await call(`/api/v1/gst/gstr1-export?dateFrom=${today}&dateTo=${today}`);
    assert.equal(exported.response.status, 200, JSON.stringify(exported.body));
    const { b2b: b2bRows, b2cs, hsn, docs } = exported.body.data;

    assert.equal(b2bRows.length, 1);
    assert.equal(b2bRows[0]['GSTIN of Recipient'], '06ABCDE1234F1Z5');
    assert.equal(b2bRows[0]['Taxable Value'], 1000);
    assert.equal(b2bRows[0]['Invoice Value'], 1180);
    assert.equal(b2bRows[0]['Place Of Supply'], '06-Haryana');

    assert.equal(b2cs.length, 1);
    assert.equal(b2cs[0]['Taxable Value'], 500);
    assert.equal(b2cs[0]['Central Tax'], 45);

    assert.deepEqual(hsn.map((row) => [row.Section, row.HSN, row['Taxable Value']]).sort(), [
      ['B2B', '9987', 1000],
      ['B2C', '9987', 500],
    ]);
    assert.equal(docs.length, 1);
    assert.equal(docs[0]['Total Number'], 3);
    assert.equal(docs[0].Cancelled, 1);
    assert.equal(docs[0]['Net Issued'], 2);

    const csv = await context.request(
      `/api/v1/gst/gstr1-export/b2b.csv?dateFrom=${today}&dateTo=${today}`,
      { headers },
    );
    assert.equal(csv.response.status, 200);
    assert.match(csv.response.headers.get('content-type'), /text\/csv/);
    assert.match(csv.body, /GSTIN of Recipient,Receiver Name,Invoice Number/);
    assert.match(csv.body, /06ABCDE1234F1Z5/);

    const noPeriod = await call('/api/v1/gst/gstr1-export');
    assert.equal(noPeriod.response.status, 400);
  } finally {
    await context.close();
  }
});
