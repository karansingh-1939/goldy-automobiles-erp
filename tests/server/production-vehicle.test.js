import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { JobCardService } from '../../src/server/modules/job-cards/job-card.service.js';
import { MigrationRunner } from '../../src/server/database/migration-runner.js';

test('registration migration stops on existing collisions and preserves both vehicle histories', async () => {
  const c = await createTestContext();
  try {
    c.db.exec(
      "DROP INDEX idx_vehicles_canonical_unique; DROP TRIGGER vehicles_canonical_insert; DROP TRIGGER vehicles_canonical_update; DELETE FROM schema_migrations WHERE filename='038_vehicle_registration_uniqueness.sql';",
    );
    const customerId = c.db
      .prepare("INSERT INTO customers(name) VALUES ('Historical owner')")
      .run().lastInsertRowid;
    const insert = c.db.prepare(
      'INSERT INTO vehicles(customer_id,registration_number) VALUES (?,?)',
    );
    const first = insert.run(customerId, 'HR 01 AB 7777').lastInsertRowid;
    const second = insert.run(customerId, 'hr01-ab7777').lastInsertRowid;
    assert.throws(
      () => new MigrationRunner(c.db).run(),
      (error) => error.code === 'VEHICLE_REGISTRATION_COLLISIONS',
    );
    assert.deepEqual(
      c.db
        .prepare('SELECT id FROM vehicles ORDER BY id')
        .all()
        .map((row) => row.id),
      [first, second],
    );
    assert.equal(
      c.db
        .prepare(
          "SELECT COUNT(*) AS n FROM schema_migrations WHERE filename='038_vehicle_registration_uniqueness.sql'",
        )
        .get().n,
      0,
    );
  } finally {
    await c.close();
  }
});

test('vehicle master rejects canonical collisions and ignores client normalized identity', async () => {
  const c = await createTestContext();
  try {
    const login = await c.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const customerId = c.db
      .prepare("INSERT INTO customers(name) VALUES ('Owner')")
      .run().lastInsertRowid;
    const create = (registration) =>
      c.request('/api/v1/vehicles', {
        method: 'POST',
        headers,
        body: JSON.stringify({ customer_id: customerId, registration_number: registration }),
      });
    const first = await create('HR 01 AB 1234');
    assert.equal(first.response.status, 201);
    const second = await create('hr01-ab1234');
    assert.equal(second.response.status, 409);
    const edit = await c.request(`/api/v1/vehicles/${first.body.data.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ registration_number_normalized: 'SPOOF' }),
    });
    assert.equal(edit.response.status, 400);
    assert.equal(
      c.db
        .prepare('SELECT registration_number_normalized FROM vehicles WHERE id = ?')
        .get(first.body.data.id).registration_number_normalized,
      'HR01AB1234',
    );
  } finally {
    await c.close();
  }
});

test('rejected job card rolls back intake customers vehicles and ownership', async () => {
  const c = await createTestContext();
  try {
    const service = new JobCardService(c.db);
    const before = c.db.prepare('SELECT COUNT(*) AS n FROM customers').get().n;
    assert.throws(
      () =>
        service.create(
          {
            customer_name: 'Rejected',
            registration_number: 'HR01AB2345',
            odometer_reading: 1,
            technician_id: 99999,
          },
          1,
        ),
      /technician/,
    );
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM customers').get().n, before);
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM vehicles').get().n, 0);
    const job = service.create(
      { customer_name: 'Owner', registration_number: 'HR01AB2345', odometer_reading: 10 },
      1,
    );
    const other = c.db
      .prepare("INSERT INTO customers(name) VALUES ('Other owner')")
      .run().lastInsertRowid;
    assert.throws(
      () =>
        service.create(
          {
            customer_id: other,
            vehicle_id: job.vehicle_id,
            transfer_ownership: true,
            odometer_reading: 1,
          },
          1,
        ),
      /Odometer/,
    );
    assert.equal(
      c.db.prepare('SELECT customer_id FROM vehicles WHERE id = ?').get(job.vehicle_id).customer_id,
      job.customer_id,
    );
  } finally {
    await c.close();
  }
});
