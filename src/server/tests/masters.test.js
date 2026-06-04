import assert from 'node:assert/strict';
import test from 'node:test';
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

async function assertCrudFlow(context, token, resource) {
  const created = await createRecord(context, token, resource.endpoint, resource.createPayload);
  assert.ok(created.id);
  resource.assertCreated?.(created);

  const searched = await context.request(`${resource.endpoint}?search=${encodeURIComponent(resource.search)}&page=1&pageSize=1`, {
    headers: authHeaders(token),
  });

  assert.equal(searched.response.status, 200);
  assert.equal(searched.body.pagination.page, 1);
  assert.equal(searched.body.pagination.pageSize, 1);
  assert.ok(searched.body.pagination.total >= 1);
  assert.ok(searched.body.data.length <= 1);

  const fetched = await context.request(`${resource.endpoint}/${created.id}`, {
    headers: authHeaders(token),
  });

  assert.equal(fetched.response.status, 200);
  assert.equal(fetched.body.data.id, created.id);

  const updated = await context.request(`${resource.endpoint}/${created.id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(resource.updatePayload),
  });

  assert.equal(updated.response.status, 200, JSON.stringify(updated.body));
  resource.assertUpdated?.(updated.body.data);

  const deleted = await context.request(`${resource.endpoint}/${created.id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });

  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.success, true);

  const missing = await context.request(`${resource.endpoint}/${created.id}`, {
    headers: authHeaders(token),
  });

  assert.equal(missing.response.status, 404);

  const auditCount = context.db.prepare(`
    SELECT COUNT(*) AS count
    FROM audit_logs
    WHERE entity_type = ?
      AND entity_id = ?
      AND action IN ('CREATE', 'UPDATE', 'DELETE')
  `).get(resource.entityType, created.id).count;

  assert.equal(auditCount, 3);
}

test('masters CRUD supports customers, vehicles, suppliers, warehouses, and inventory categories', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);
    const vehicleCustomer = await createRecord(context, token, '/api/v1/customers', {
      name: 'Vehicle Owner',
      phone: '9000000001',
      city: 'Pune',
    });

    const resources = [
      {
        endpoint: '/api/v1/customers',
        entityType: 'customers',
        search: 'Asha',
        createPayload: {
          name: 'Asha Motors',
          phone: '9000000002',
          email: 'asha@example.com',
          city: 'Mumbai',
        },
        updatePayload: {
          city: 'Nashik',
          notes: 'Preferred customer',
        },
        assertUpdated: (record) => assert.equal(record.city, 'Nashik'),
      },
      {
        endpoint: '/api/v1/vehicles',
        entityType: 'vehicles',
        search: 'MH12AB1001',
        createPayload: {
          customer_id: vehicleCustomer.id,
          registration_number: 'MH12AB1001',
          make: 'Maruti',
          model: 'Swift',
          fuel_type: 'Petrol',
          odometer_reading: 32000,
        },
        updatePayload: {
          odometer_reading: 32500,
          fuel_type: 'CNG',
        },
        assertUpdated: (record) => {
          assert.equal(record.odometer_reading, 32500);
          assert.equal(record.fuel_type, 'CNG');
        },
      },
      {
        endpoint: '/api/v1/suppliers',
        entityType: 'suppliers',
        search: 'Prime',
        createPayload: {
          name: 'Prime Spares',
          phone: '9000000003',
          email: 'prime@example.com',
          city: 'Delhi',
        },
        updatePayload: {
          city: 'Jaipur',
          is_active: false,
        },
        assertUpdated: (record) => {
          assert.equal(record.city, 'Jaipur');
          assert.equal(record.is_active, 0);
        },
      },
      {
        endpoint: '/api/v1/warehouses',
        entityType: 'warehouses',
        search: 'SECONDARY',
        createPayload: {
          name: 'Secondary Store',
          code: 'secondary',
          address: 'Back workshop',
        },
        updatePayload: {
          address: 'Rear workshop',
        },
        assertCreated: (record) => assert.equal(record.code, 'SECONDARY'),
        assertUpdated: (record) => assert.equal(record.address, 'Rear workshop'),
      },
      {
        endpoint: '/api/v1/inventory-categories',
        entityType: 'inventory_categories',
        search: 'Filters',
        createPayload: {
          name: 'Filters',
          description: 'Oil and air filters',
        },
        updatePayload: {
          description: 'Oil, air, and fuel filters',
        },
        assertUpdated: (record) => assert.equal(record.description, 'Oil, air, and fuel filters'),
      },
    ];

    for (const resource of resources) {
      await assertCrudFlow(context, token, resource);
    }
  } finally {
    await context.close();
  }
});

test('masters validation and authorization errors are enforced', async () => {
  const context = await createTestContext();

  try {
    const token = await login(context);

    const unauthenticated = await context.request('/api/v1/customers');
    assert.equal(unauthenticated.response.status, 401);

    const invalidCustomer = await context.request('/api/v1/customers', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'A',
        phone: 'bad phone !',
      }),
    });

    assert.equal(invalidCustomer.response.status, 400);
    assert.equal(invalidCustomer.body.error.code, 'VALIDATION_ERROR');
    assert.ok(invalidCustomer.body.error.details.name);
    assert.ok(invalidCustomer.body.error.details.phone);

    const missingRelation = await context.request('/api/v1/vehicles', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        customer_id: 99999,
        registration_number: 'MH12ZZ9999',
      }),
    });

    assert.equal(missingRelation.response.status, 400);
    assert.equal(missingRelation.body.error.code, 'RELATED_RECORD_NOT_FOUND');

    await createRecord(context, token, '/api/v1/customers', {
      name: 'Duplicate Phone One',
      phone: '9000000099',
    });

    const duplicate = await context.request('/api/v1/customers', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Duplicate Phone Two',
        phone: '9000000099',
      }),
    });

    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.error.code, 'DUPLICATE_RECORD');
  } finally {
    await context.close();
  }
});
