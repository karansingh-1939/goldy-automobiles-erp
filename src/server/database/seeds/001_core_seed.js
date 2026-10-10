const roles = [
  ['Admin', 'Full system access.'],
  ['Manager', 'Workshop operations and reporting access.'],
  ['Mechanic', 'Job card and service workflow access.'],
  ['Billing Staff', 'Invoice, customer, and payment workflow access.'],
];

const permissions = [
  ['users.manage', 'Create, update, and disable users.'],
  ['roles.manage', 'Manage roles and permissions.'],
  ['customers.read', 'View customers.'],
  ['customers.write', 'Create and update customers.'],
  ['vehicles.read', 'View vehicles.'],
  ['vehicles.write', 'Create and update vehicles.'],
  ['suppliers.read', 'View suppliers.'],
  ['suppliers.write', 'Create and update suppliers.'],
  ['warehouses.read', 'View warehouses.'],
  ['warehouses.write', 'Create and update warehouses.'],
  ['inventory.read', 'View inventory.'],
  ['inventory.write', 'Create and update inventory items.'],
  ['inventory.adjust', 'Adjust inventory stock.'],
  ['purchases.read', 'View purchases.'],
  ['purchases.write', 'Create and update purchases.'],
  ['job_cards.read', 'View job cards.'],
  ['job_cards.write', 'Create and update job cards.'],
  ['job_cards.assign', 'Assign mechanics to job cards.'],
  ['invoices.read', 'View invoices.'],
  ['invoices.write', 'Create and update invoices.'],
  ['invoices.finalize', 'Finalize invoices.'],
  ['invoices.cancel', 'Cancel invoices.'],
  ['expenses.read', 'View expenses.'],
  ['expenses.write', 'Create and update expenses.'],
  ['gst.read', 'View GST reports.'],
  ['gst.write', 'Modify GST settings and locked periods.'],
  ['gst.export', 'Export GST data.'],
  ['profit.read', 'View profit records.'],
  ['tally.export', 'Export Tally data.'],
  ['dashboard.read', 'View dashboard analytics.'],
  ['audit.read', 'View audit logs.'],
  ['backups.read', 'View database backups and logs.'],
  ['backups.write', 'Create manual database backups.'],
  [
    'accounting.read',
    'View general ledgers, voucher entries, trial balance, P&L, and balance sheets.',
  ],
  [
    'accounting.write',
    'Post manual vouchers (Contra, Journal, Payments, Receipts) and adjust/cancel accounting logs.',
  ],
];

const rolePermissionKeys = {
  Admin: permissions.map(([key]) => key),
  Manager: permissions
    .map(([key]) => key)
    .filter(
      (key) => !['users.manage', 'roles.manage', 'backups.read', 'backups.write'].includes(key),
    ),
  Mechanic: [
    'customers.read',
    'vehicles.read',
    'inventory.read',
    'job_cards.read',
    'job_cards.write',
    'dashboard.read',
  ],
  'Billing Staff': [
    'customers.read',
    'customers.write',
    'vehicles.read',
    'vehicles.write',
    'job_cards.read',
    'invoices.read',
    'invoices.write',
    'invoices.finalize',
    'gst.read',
    'dashboard.read',
  ],
};

export async function run(db) {
  const insertRole = db.prepare(`
    INSERT INTO roles (name, description)
    VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertPermission = db.prepare(`
    INSERT INTO permissions (key, description)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET description = excluded.description
  `);

  const linkPermission = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    VALUES (?, ?)
  `);

  const seedTransaction = db.transaction(() => {
    for (const role of roles) {
      insertRole.run(...role);
    }

    for (const permission of permissions) {
      insertPermission.run(...permission);
    }

    for (const [roleName, permissionKeys] of Object.entries(rolePermissionKeys)) {
      const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName);

      for (const permissionKey of permissionKeys) {
        const permission = db
          .prepare('SELECT id FROM permissions WHERE key = ?')
          .get(permissionKey);
        linkPermission.run(role.id, permission.id);
      }
    }

    db.prepare(
      `
      INSERT INTO warehouses (name, code, address)
      VALUES ('Main Store', 'MAIN', 'Primary workshop store')
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        address = excluded.address,
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run();
  });

  seedTransaction();
}
