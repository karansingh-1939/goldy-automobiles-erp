-- Migration: 027_accounting_permissions
-- Description: Seeds accounting.read and accounting.write permissions, linking them to Admin and Manager roles.

PRAGMA foreign_keys = OFF;

-- 1. Insert permissions if they don't exist
INSERT OR IGNORE INTO permissions (key, description) 
VALUES 
('accounting.read', 'View general ledgers, voucher entries, trial balance, P&L, and balance sheets.'),
('accounting.write', 'Post manual vouchers (Contra, Journal, Payments, Receipts) and adjust/cancel accounting logs.');

-- 2. Map accounting.read and accounting.write to Admin role
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Admin' AND p.key IN ('accounting.read', 'accounting.write');

-- 3. Map accounting.read and accounting.write to Manager role
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Manager' AND p.key IN ('accounting.read', 'accounting.write');

PRAGMA foreign_keys = ON;
