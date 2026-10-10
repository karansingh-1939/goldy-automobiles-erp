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

test('Workshop Core Workflow integration tests', async (t) => {
  const context = await createTestContext();
  const db = context.db;
  const token = await login(context);
  const headers = authHeaders(token);

  try {
    // -------------------------------------------------------------
    // Test A: New Customer + New Vehicle
    // -------------------------------------------------------------
    await t.test('Test A: New Customer + New Vehicle', async () => {
      const res = await context.request('/api/v1/job-cards', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_name: 'Amit Kumar',
          phone: '9876543210',
          registration_number: 'HR 26 AB 1234',
          make: 'Maruti',
          model: 'Swift',
          odometer_reading: 45000,
          complaint: 'Car noise from wheels',
        }),
      });

      assert.equal(res.response.status, 201, JSON.stringify(res.body));
      const jc = res.body.data;
      assert.ok(jc.id);

      // Verify customer was created
      const customer = db.prepare("SELECT * FROM customers WHERE phone = '9876543210'").get();
      assert.ok(customer);
      assert.equal(customer.name, 'Amit Kumar');

      // Verify vehicle was created
      const vehicle = db
        .prepare("SELECT * FROM vehicles WHERE registration_number = 'HR 26 AB 1234'")
        .get();
      assert.ok(vehicle);
      assert.equal(vehicle.customer_id, customer.id);
      assert.equal(vehicle.make, 'Maruti');
      assert.equal(vehicle.model, 'Swift');
      assert.equal(vehicle.odometer_reading, 45000);

      // Verify Job Card links
      assert.equal(jc.customer_id, customer.id);
      assert.equal(jc.vehicle_id, vehicle.id);
    });

    // -------------------------------------------------------------
    // Test B: Existing Customer + New Vehicle
    // -------------------------------------------------------------
    await t.test('Test B: Existing Customer + New Vehicle', async () => {
      const customer = db.prepare("SELECT id FROM customers WHERE phone = '9876543210'").get();
      assert.ok(customer);

      const res = await context.request('/api/v1/job-cards', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_id: customer.id,
          customer_name: 'Amit Kumar',
          phone: '9876543210',
          registration_number: 'DL-2C-AA-5678',
          make: 'Hyundai',
          model: 'i10',
          odometer_reading: 10000,
          complaint: 'AC not cooling',
        }),
      });

      assert.equal(res.response.status, 201, JSON.stringify(res.body));
      const jc = res.body.data;

      // Verify new vehicle created, linked to existing customer
      const vehicle = db
        .prepare("SELECT * FROM vehicles WHERE registration_number_normalized = 'DL2CAA5678'")
        .get();
      assert.ok(vehicle);
      assert.equal(vehicle.customer_id, customer.id);
      assert.equal(vehicle.model, 'i10');

      // Verify Job Card links
      assert.equal(jc.customer_id, customer.id);
      assert.equal(jc.vehicle_id, vehicle.id);
    });

    // -------------------------------------------------------------
    // Test C: Existing Customer + Existing Vehicle
    // -------------------------------------------------------------
    await t.test('Test C: Existing Customer + Existing Vehicle', async () => {
      const customer = db.prepare("SELECT id FROM customers WHERE phone = '9876543210'").get();
      const vehicle = db
        .prepare("SELECT id FROM vehicles WHERE registration_number_normalized = 'DL2CAA5678'")
        .get();

      const res = await context.request('/api/v1/job-cards', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_id: customer.id,
          vehicle_id: vehicle.id,
          customer_name: 'Amit Kumar',
          phone: '9876543210',
          registration_number: 'DL-2C-AA-5678',
          odometer_reading: 10500,
          complaint: 'Routine service',
        }),
      });

      assert.equal(res.response.status, 201, JSON.stringify(res.body));
      const jc = res.body.data;
      assert.equal(jc.customer_id, customer.id);
      assert.equal(jc.vehicle_id, vehicle.id);

      // Verify no duplicates
      const count = db
        .prepare(
          "SELECT COUNT(*) AS count FROM vehicles WHERE registration_number_normalized = 'DL2CAA5678'",
        )
        .get().count;
      assert.equal(count, 1);
    });

    // -------------------------------------------------------------
    // Test D: New Customer + Existing Vehicle (Ownership preserved)
    // -------------------------------------------------------------
    await t.test('Test D: New Customer + Existing Vehicle (No Ownership Transfer)', async () => {
      const swift = db
        .prepare("SELECT * FROM vehicles WHERE registration_number = 'HR 26 AB 1234'")
        .get();
      assert.ok(swift);
      const originalOwnerId = swift.customer_id; // Amit Kumar

      const res = await context.request('/api/v1/job-cards', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_name: 'Ramesh Singh',
          phone: '9416030677',
          registration_number: 'HR 26 AB 1234',
          odometer_reading: 46000,
          complaint: 'Engine oil replacement',
        }),
      });

      assert.equal(res.response.status, 201, JSON.stringify(res.body));
      const jc = res.body.data;

      // Verify Ramesh Singh customer was created
      const ramesh = db.prepare("SELECT id FROM customers WHERE phone = '9416030677'").get();
      assert.ok(ramesh);

      // Verify Job Card is linked to Ramesh Singh
      assert.equal(jc.customer_id, ramesh.id);
      assert.equal(jc.vehicle_id, swift.id);

      // Verify vehicle master owner is UNCHANGED (still Amit Kumar)
      const swiftUpdated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(swift.id);
      assert.equal(swiftUpdated.customer_id, originalOwnerId);
    });

    // -------------------------------------------------------------
    // Test E: Existing Customer + Existing Vehicle Owned by Different Customer
    // -------------------------------------------------------------
    await t.test(
      'Test E: Existing Customer + Existing Vehicle Owned by Different Customer',
      async () => {
        const swift = db
          .prepare("SELECT * FROM vehicles WHERE registration_number = 'HR 26 AB 1234'")
          .get();
        const ramesh = db.prepare("SELECT id FROM customers WHERE phone = '9416030677'").get();
        assert.ok(swift);
        assert.ok(ramesh);
        const originalOwnerId = swift.customer_id; // Amit Kumar

        const res = await context.request('/api/v1/job-cards', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customer_id: ramesh.id,
            customer_name: 'Ramesh Singh',
            phone: '9416030677',
            registration_number: 'HR26AB1234',
            odometer_reading: 46500,
            complaint: 'Wheel balancing',
          }),
        });

        assert.equal(res.response.status, 201, JSON.stringify(res.body));
        const jc = res.body.data;

        // Job card customer is Ramesh
        assert.equal(jc.customer_id, ramesh.id);
        assert.equal(jc.vehicle_id, swift.id);

        // Vehicle owner is still Amit
        const swiftUpdated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(swift.id);
        assert.equal(swiftUpdated.customer_id, originalOwnerId);
      },
    );

    // -------------------------------------------------------------
    // Test F: Explicit Ownership Transfer
    // -------------------------------------------------------------
    await t.test('Test F: Explicit Ownership Transfer', async () => {
      const swift = db
        .prepare("SELECT * FROM vehicles WHERE registration_number = 'HR 26 AB 1234'")
        .get();
      const ramesh = db.prepare("SELECT id FROM customers WHERE phone = '9416030677'").get();
      assert.ok(swift);
      assert.ok(ramesh);

      const res = await context.request('/api/v1/job-cards', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_id: ramesh.id,
          customer_name: 'Ramesh Singh',
          phone: '9416030677',
          registration_number: 'HR26AB1234',
          odometer_reading: 47000,
          complaint: 'Brake pads check',
          transfer_ownership: true, // EXPLICIT transfer
        }),
      });

      assert.equal(res.response.status, 201, JSON.stringify(res.body));
      const jc = res.body.data;

      // Job Card linked to Ramesh
      assert.equal(jc.customer_id, ramesh.id);
      assert.equal(jc.vehicle_id, swift.id);

      // Vehicle master owner updated to Ramesh
      const swiftUpdated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(swift.id);
      assert.equal(swiftUpdated.customer_id, ramesh.id);

      // Verify that past job cards still have Amit Kumar linked (preserving history)
      const pastJobCards = db
        .prepare(
          'SELECT customer_id FROM job_cards WHERE vehicle_id = ? AND odometer_reading < 46000',
        )
        .all(swift.id);
      assert.ok(pastJobCards.length > 0);
      pastJobCards.forEach((jcRow) => {
        assert.notEqual(jcRow.customer_id, ramesh.id);
      });
    });

    // -------------------------------------------------------------
    // Test G: Registration Normalization
    // -------------------------------------------------------------
    await t.test('Test G: Registration Normalization', async () => {
      // Lookup using different variations
      const lookup1 = await context.request(
        '/api/v1/vehicles/lookup?registration_number=HR-26-AB-1234',
        { headers },
      );
      const lookup2 = await context.request(
        '/api/v1/vehicles/lookup?registration_number=hr26 ab 1234',
        { headers },
      );
      const lookup3 = await context.request(
        '/api/v1/vehicles/lookup?registration_number=HR26AB1234',
        { headers },
      );

      assert.equal(lookup1.response.status, 200);
      assert.ok(lookup1.body.data);
      assert.equal(lookup1.body.data.registration_number, 'HR 26 AB 1234'); // Returns the display version

      assert.equal(lookup2.response.status, 200);
      assert.ok(lookup2.body.data);
      assert.equal(lookup2.body.data.id, lookup1.body.data.id);

      assert.equal(lookup3.response.status, 200);
      assert.ok(lookup3.body.data);
      assert.equal(lookup3.body.data.id, lookup1.body.data.id);
    });

    // -------------------------------------------------------------
    // Test H: Phone Normalization
    // -------------------------------------------------------------
    await t.test('Test H: Phone Normalization equivalent Indian formats', async () => {
      const lookup1 = await context.request('/api/v1/customers/lookup?phone=%2B91%2094160-30677', {
        headers,
      }); // +91 94160-30677
      const lookup2 = await context.request('/api/v1/customers/lookup?phone=09416030677', {
        headers,
      }); // 09416030677
      const lookup3 = await context.request('/api/v1/customers/lookup?phone=919416030677', {
        headers,
      }); // 919416030677

      assert.equal(lookup1.response.status, 200);
      assert.ok(lookup1.body.data);
      assert.equal(lookup1.body.data.phone, '9416030677');

      assert.equal(lookup2.response.status, 200);
      assert.ok(lookup2.body.data);
      assert.equal(lookup2.body.data.id, lookup1.body.data.id);

      assert.equal(lookup3.response.status, 200);
      assert.ok(lookup3.body.data);
      assert.equal(lookup3.body.data.id, lookup1.body.data.id);
    });
  } finally {
    await context.close();
  }
});
