import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';
import { localDate } from '../../src/server/shared/utils/local-date.js';

test('mechanic timers prevent overlap and billing while running; reminders use the vehicle owner', async () => {
  const context = await createTestContext();
  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const call = (url, body) =>
      context.request(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const job = await call('/api/v1/job-cards', {
      customer_name: 'Timer Test',
      phone: '9000000002',
      registration_number: 'HR01AA0002',
      make: 'Test',
      model: 'Car',
      complaint: 'Service',
      odometer_reading: 1,
    });
    assert.equal(job.response.status, 201, JSON.stringify(job.body));
    const id = job.body.data.id;
    const mechanic = await call('/api/v1/technicians', {
      full_name: 'Test Mechanic',
      phone_number: '9000000003',
    });
    assert.equal(mechanic.response.status, 201, JSON.stringify(mechanic.body));
    const started = await call(`/api/v1/workshop/jobs/${id}/time`, {
      technicianId: mechanic.body.data.id,
      notes: 'Service work',
    });
    assert.equal(started.response.status, 200);
    assert.equal(
      (await call(`/api/v1/workshop/jobs/${id}/time`, { technicianId: mechanic.body.data.id })).body
        .error.code,
      'TIMER_ALREADY_RUNNING',
    );
    assert.equal(
      (await call(`/api/v1/job-cards/${id}/finalize`, {})).body.error.code,
      'JOB_TIMER_RUNNING',
    );
    assert.equal(
      (await call(`/api/v1/workshop/time/${started.body.data.id}/stop`, {})).response.status,
      200,
    );
    assert.equal(
      (await call(`/api/v1/workshop/time/${started.body.data.id}/stop`, {})).response.status,
      409,
    );
    const times = await context.request(`/api/v1/workshop/jobs/${id}/time`, { headers });
    assert.ok(times.body.data[0].elapsedMinutes >= 0);
    assert.ok(times.body.data[0].stopped_at);
    const payload = {
      vehicleId: job.body.data.vehicle_id,
      customerId: 999999,
      dueDate: localDate(),
      reminderType: 'MAINTENANCE',
      notes: 'Check service',
    };
    const reminder = await call('/api/v1/crm/reminders', payload);
    assert.equal(reminder.response.status, 201, JSON.stringify(reminder.body));
    assert.equal(reminder.body.data.customer_id, job.body.data.customer_id);
    const due = await context.request('/api/v1/crm/reminders', { headers });
    assert.ok(due.body.data.find((item) => item.id === reminder.body.data.id));
    assert.equal(
      (await call('/api/v1/crm/reminders', { ...payload, dueDate: '2026-02-30' })).response.status,
      400,
    );
    await call(`/api/v1/crm/reminders/${reminder.body.data.id}/dismiss`, {});
    const handled = await context.request('/api/v1/crm/reminders', { headers });
    assert.ok(!handled.body.data.find((item) => item.id === reminder.body.data.id));
  } finally {
    await context.close();
  }
});
