import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';

async function adminHeaders(context) {
  const result = await context.request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
  });
  return { Authorization: `Bearer ${result.body.token}`, 'Content-Type': 'application/json' };
}

async function openJob(context, headers, suffix) {
  const created = await context.request('/api/v1/job-cards', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customer_name: `Fix Test ${suffix}`,
      phone: `900007000${suffix}`,
      registration_number: `HR05FX000${suffix}`,
      make: 'Maruti',
      model: 'Alto',
      fuel_type: 'Petrol',
      odometer_reading: 1000,
      complaint: 'Service',
      fuel_level: '1/2',
    }),
  });
  assert.equal(created.response.status, 201);
  return created.body.data.id;
}

test('staff can remove a wrong line and cancel an unbilled job without using an invoice number', async () => {
  const context = await createTestContext();
  try {
    const headers = await adminHeaders(context);
    const jobId = await openJob(context, headers, 1);
    const added = await context.request(`/api/v1/job-cards/${jobId}/labour`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ description: 'Wrong labour', labour_charge: 900, gst_rate: 18 }),
    });
    const lineId = added.body.data.id;

    const removed = await context.request(`/api/v1/job-cards/${jobId}/labour/${lineId}`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(removed.response.status, 200);
    const detail = await context.request(`/api/v1/job-cards/${jobId}`, { headers });
    assert.equal((detail.body.data.labour || []).length, 0);

    const missing = await context.request(`/api/v1/job-cards/${jobId}/parts/999`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(missing.response.status, 404);

    const noReason = await context.request(`/api/v1/job-cards/${jobId}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    assert.equal(noReason.response.status, 400);

    const cancelled = await context.request(`/api/v1/job-cards/${jobId}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'Customer left' }),
    });
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.body.data.status, 'CANCELLED');

    const locked = await context.request(`/api/v1/job-cards/${jobId}/labour`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ description: 'Late', labour_charge: 100, gst_rate: 18 }),
    });
    assert.equal(locked.response.status, 400);
    assert.equal(context.db.prepare('SELECT COUNT(*) AS n FROM document_sequences').get().n, 0);
    assert.ok(
      context.db
        .prepare("SELECT 1 FROM audit_logs WHERE entity_type = 'job_cards' AND action = 'CANCEL'")
        .get(),
    );
  } finally {
    await context.close();
  }
});

test('a billed job card cannot be cancelled from the job card screen', async () => {
  const context = await createTestContext();
  try {
    const headers = await adminHeaders(context);
    const jobId = await openJob(context, headers, 2);
    await context.request(`/api/v1/job-cards/${jobId}/labour`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ description: 'Service', labour_charge: 500, gst_rate: 18 }),
    });
    const billed = await context.request(`/api/v1/job-cards/${jobId}/finalize`, {
      method: 'POST',
      headers,
    });
    assert.equal(billed.response.status, 201);
    const refused = await context.request(`/api/v1/job-cards/${jobId}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'Try' }),
    });
    assert.equal(refused.response.status, 400);
    assert.equal(refused.body.error.code, 'JOB_CARD_LOCKED');
  } finally {
    await context.close();
  }
});
