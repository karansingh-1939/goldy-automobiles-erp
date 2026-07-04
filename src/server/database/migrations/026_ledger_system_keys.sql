-- Migration: 026_ledger_system_keys
-- Description: Adds system_key column to ledgers, populates keys for system accounts, and adds composite index performance improvements.

PRAGMA foreign_keys = OFF;

-- 1. Add system_key column to ledgers
ALTER TABLE ledgers ADD COLUMN system_key TEXT;

-- 2. Populate system keys for default seeded ledgers
UPDATE ledgers SET system_key = 'cash_in_hand' WHERE id = 1;
UPDATE ledgers SET system_key = 'hdfc_bank' WHERE id = 2;
UPDATE ledgers SET system_key = 'inventory_stock' WHERE id = 3;
UPDATE ledgers SET system_key = 'cgst_input' WHERE id = 4;
UPDATE ledgers SET system_key = 'sgst_input' WHERE id = 5;
UPDATE ledgers SET system_key = 'igst_input' WHERE id = 6;
UPDATE ledgers SET system_key = 'cgst_output' WHERE id = 7;
UPDATE ledgers SET system_key = 'sgst_output' WHERE id = 8;
UPDATE ledgers SET system_key = 'igst_output' WHERE id = 9;
UPDATE ledgers SET system_key = 'parts_sales' WHERE id = 10;
UPDATE ledgers SET system_key = 'labour_sales' WHERE id = 11;
UPDATE ledgers SET system_key = 'cogs' WHERE id = 12;
UPDATE ledgers SET system_key = 'rent_expense' WHERE id = 13;
UPDATE ledgers SET system_key = 'salary_expense' WHERE id = 14;
UPDATE ledgers SET system_key = 'electricity_expense' WHERE id = 15;
UPDATE ledgers SET system_key = 'internet_expense' WHERE id = 16;
UPDATE ledgers SET system_key = 'misc_expense' WHERE id = 17;
UPDATE ledgers SET system_key = 'capital_account' WHERE id = 18;
UPDATE ledgers SET system_key = 'retained_earnings' WHERE id = 19;
UPDATE ledgers SET system_key = 'round_off' WHERE id = 20;

-- 3. Create Unique index on company_id and system_key (where system_key is defined)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledgers_company_system_key ON ledgers(company_id, system_key) WHERE system_key IS NOT NULL;

-- 4. Create index on reference columns for vouchers (deletes and lookups)
CREATE INDEX IF NOT EXISTS idx_vouchers_reference ON vouchers(reference_table, reference_id);

-- 5. Create composite index on sequencing lookup columns (ascending sorting for faster max searches)
CREATE INDEX IF NOT EXISTS idx_vouchers_sequencing ON vouchers(company_id, voucher_type, voucher_number DESC);

PRAGMA foreign_keys = ON;
