import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { createInventoryService } from '../../src/server/modules/inventory/inventory.service.js';

test('inventory starter seeding architecture', async (t) => {
  await t.test('application startup does not seed inventory automatically', async () => {
    const context = await createTestContext();
    try {
      // After createTestContext (which runs migrations and runSeeds),
      // inventory_items should be completely empty.
      const itemsCount = context.db
        .prepare('SELECT COUNT(*) AS count FROM inventory_items')
        .get().count;
      assert.equal(itemsCount, 0, 'Inventory items should be empty on startup.');

      // Check seed status is false
      const service = createInventoryService(context.db);
      const statusResult = service.getSeedStatus();
      assert.deepEqual(statusResult, { loaded: false });
    } finally {
      await context.close();
    }
  });

  await t.test(
    'first load succeeds and subsequent load returns already loaded response',
    async () => {
      const context = await createTestContext();
      try {
        const service = createInventoryService(context.db);

        // Verify initial status is false
        const status1 = service.getSeedStatus();
        assert.deepEqual(status1, { loaded: false });

        // Run seeding first time
        const seedResult1 = service.seedStarter(1); // userId = 1
        assert.equal(seedResult1.loaded, true);
        assert.equal(seedResult1.itemsSeeded > 0, true);
        assert.equal(seedResult1.message, 'Starter inventory catalog loaded successfully.');

        const countAfterSeed = context.db
          .prepare('SELECT COUNT(*) AS count FROM inventory_items')
          .get().count;
        assert.equal(countAfterSeed, seedResult1.itemsSeeded);

        // Verify status is now true
        const status2 = service.getSeedStatus();
        assert.deepEqual(status2, { loaded: true });

        // Run seeding second time - should be safe, return clean response, no constraint errors
        const seedResult2 = service.seedStarter(1);
        assert.deepEqual(seedResult2, {
          loaded: true,
          itemsSeeded: 0,
          message: 'Starter inventory already loaded.',
        });

        // Assert count didn't change and no duplicate SKUs/items were added
        const countAfterSecondSeed = context.db
          .prepare('SELECT COUNT(*) AS count FROM inventory_items')
          .get().count;
        assert.equal(countAfterSecondSeed, countAfterSeed);
      } finally {
        await context.close();
      }
    },
  );

  await t.test(
    'GET /api/v1/inventory/seed-status and POST /api/v1/inventory/seed-starter via API',
    async () => {
      const context = await createTestContext();
      try {
        // Login to get token
        const loginRes = await context.request('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: 'admin',
            password: 'Admin@12345',
          }),
        });
        assert.equal(loginRes.response.status, 200);
        const token = loginRes.body.token;
        const headers = { Authorization: `Bearer ${token}` };

        // 1. GET seed status - should be false
        const statusRes1 = await context.request('/api/v1/inventory/seed-status', { headers });
        assert.equal(statusRes1.response.status, 200);
        assert.deepEqual(statusRes1.body, { loaded: false });

        // 2. POST seed-starter - first time
        const seedRes1 = await context.request('/api/v1/inventory/seed-starter', {
          method: 'POST',
          headers,
        });
        assert.equal(seedRes1.response.status, 200);
        assert.equal(seedRes1.body.loaded, true);
        assert.equal(seedRes1.body.itemsSeeded > 0, true);

        // 3. GET seed status - should be true
        const statusRes2 = await context.request('/api/v1/inventory/seed-status', { headers });
        assert.equal(statusRes2.response.status, 200);
        assert.deepEqual(statusRes2.body, { loaded: true });

        // 4. POST seed-starter - second time - should return clean response
        const seedRes2 = await context.request('/api/v1/inventory/seed-starter', {
          method: 'POST',
          headers,
        });
        assert.equal(seedRes2.response.status, 200);
        assert.deepEqual(seedRes2.body, {
          loaded: true,
          itemsSeeded: 0,
          message: 'Starter inventory already loaded.',
        });
      } finally {
        await context.close();
      }
    },
  );
});
