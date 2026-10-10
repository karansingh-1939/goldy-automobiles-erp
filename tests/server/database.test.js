import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestContext } from './helpers.js';
import { runMigrations } from '../../src/server/database/migration-runner.js';
import { runSeeds } from '../../src/server/database/seed-runner.js';

const expectedTables = [
  'users',
  'roles',
  'permissions',
  'customers',
  'vehicles',
  'suppliers',
  'warehouses',
  'inventory_items',
  'inventory_categories',
  'inventory_batches',
  'inventory_transactions',
  'stock_adjustments',
  'stock_transfers',
  'purchases',
  'purchase_items',
  'purchase_orders',
  'purchase_receipts',
  'purchase_returns',
  'purchase_return_items',
  'supplier_ledgers',
  'job_cards',
  'job_card_items',
  'job_card_labour',
  'invoices',
  'invoice_items',
  'expenses',
  'gst_records',
  'profit_records',
  'audit_logs',
];

test('database initialization creates required tables and seed data', async () => {
  const context = await createTestContext();

  try {
    const tableNames = context.db
      .prepare(
        `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `,
      )
      .all()
      .map((row) => row.name);

    for (const table of expectedTables) {
      assert.ok(tableNames.includes(table), `Missing table: ${table}`);
    }

    const invoiceHeaders = context.db
      .prepare(
        `
      SELECT name
      FROM sqlite_master
      WHERE type = 'view'
        AND name = 'invoice_headers'
    `,
      )
      .get();

    assert.ok(invoiceHeaders);

    const roles = context.db
      .prepare('SELECT name FROM roles ORDER BY name')
      .all()
      .map((row) => row.name);
    assert.deepEqual(roles, ['Admin', 'Billing Staff', 'Manager', 'Mechanic']);

    const admin = context.db
      .prepare(
        `
      SELECT users.username, roles.name AS role_name
      FROM users
      JOIN roles ON roles.id = users.role_id
      WHERE users.username = 'admin'
    `,
      )
      .get();

    assert.equal(admin.username, 'admin');
    assert.equal(admin.role_name, 'Admin');

    const adminPermissions = context.db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM role_permissions
      JOIN roles ON roles.id = role_permissions.role_id
      WHERE roles.name = 'Admin'
    `,
      )
      .get();

    assert.ok(adminPermissions.count >= 20);
  } finally {
    await context.close();
  }
});

test('migrations and seeds are idempotent', async () => {
  const context = await createTestContext();

  try {
    assert.deepEqual(runMigrations(context.db), []);
    assert.deepEqual(await runSeeds(context.db), []);

    const adminCount = context.db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM users
      WHERE username = 'admin'
    `,
      )
      .get();

    assert.equal(adminCount.count, 1);
  } finally {
    await context.close();
  }
});
