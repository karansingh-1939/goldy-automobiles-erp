import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';

test('estimate decisions retain history, gate billing and enforce the approved total', async () => {
  const context = await createTestContext();
  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const call = (url, body, method = 'POST') =>
      context.request(url, { method, headers, body: JSON.stringify(body) });
    const created = await call('/api/v1/job-cards', {
      customer_name: 'Approval Test',
      phone: '9000000001',
      registration_number: 'HR01AA0001',
      make: 'Test',
      model: 'Car',
      odometer_reading: 1,
      complaint: 'Service',
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const first = await call(`/api/v1/workshop/jobs/${id}/estimates`, {
      amount: 50,
      scope: 'Labour including tax',
    });
    assert.equal(first.response.status, 200);
    const pending = await call(`/api/v1/job-cards/${id}/finalize`, {});
    assert.equal(pending.body.error.code, 'ESTIMATE_APPROVAL_REQUIRED');
    const revised = await call(`/api/v1/workshop/jobs/${id}/estimates`, {
      amount: 80,
      scope: 'Revised labour',
    });
    const decision = {
      status: 'APPROVED',
      contactName: 'Test Contact',
      method: 'PHONE',
      notes: 'Customer approved the tax-inclusive amount.',
    };
    assert.equal(
      (await call(`/api/v1/workshop/estimates/${first.body.data.id}/decision`, decision)).response
        .status,
      409,
    );
    assert.equal(
      (await call(`/api/v1/workshop/estimates/${revised.body.data.id}/decision`, decision)).response
        .status,
      200,
    );
    assert.equal(
      (await call(`/api/v1/workshop/estimates/${revised.body.data.id}/decision`, decision)).response
        .status,
      409,
    );
    const labour = await call(`/api/v1/job-cards/${id}/labour`, {
      description: 'Labour',
      labour_charge: 100,
      gst_rate: 0,
    });
    assert.equal(labour.response.status, 201, JSON.stringify(labour.body));
    const exceeded = await call(`/api/v1/job-cards/${id}/finalize`, {});
    assert.equal(exceeded.body.error.code, 'ESTIMATE_AMOUNT_EXCEEDED');
    assert.equal(
      context.db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE job_card_id = ?').get(id).n,
      0,
    );
    const allowed = await call(`/api/v1/workshop/jobs/${id}/estimates`, {
      amount: 100,
      scope: 'Final revised labour',
    });
    await call(`/api/v1/workshop/estimates/${allowed.body.data.id}/decision`, decision);
    const invalidDate = await call(
      `/api/v1/workshop/jobs/${id}/delivery`,
      { promisedAt: '2026-02-30T12:00' },
      'PATCH',
    );
    assert.equal(invalidDate.response.status, 400);
    await call(`/api/v1/workshop/jobs/${id}/delivery`, { promisedAt: '2026-01-01T12:00' }, 'PATCH');
    const queue = await context.request('/api/v1/workshop/queue', { headers });
    assert.equal(queue.body.data.find((row) => row.id === id).overdue, 1);
    assert.equal((await call(`/api/v1/job-cards/${id}/finalize`, {})).response.status, 201);
    assert.equal(
      (await call(`/api/v1/workshop/jobs/${id}/estimates`, { amount: 1, scope: 'Closed job' }))
        .response.status,
      409,
    );
  } finally {
    await context.close();
  }
});
