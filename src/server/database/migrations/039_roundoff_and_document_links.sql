-- Round-off is income/expense, not a liability; preserve existing journal entries.
UPDATE ledgers SET group_id = (SELECT id FROM account_groups
  WHERE company_id = ledgers.company_id AND name = 'Indirect Income' LIMIT 1)
WHERE system_key = 'round_off';

UPDATE purchase_bills SET voucher_id = (SELECT id FROM vouchers
  WHERE reference_table = 'purchase_bills' AND reference_id = purchase_bills.id
    AND company_id = purchase_bills.company_id AND voucher_type = 'Purchase'
  ORDER BY id DESC LIMIT 1)
WHERE voucher_id IS NULL;

UPDATE supplier_payments SET voucher_id = (SELECT id FROM vouchers
  WHERE reference_table = 'supplier_payments' AND reference_id = supplier_payments.id
    AND company_id = supplier_payments.company_id AND voucher_type = 'Payment'
  ORDER BY id DESC LIMIT 1)
WHERE voucher_id IS NULL;

UPDATE direct_invoices SET voucher_id = (SELECT id FROM vouchers
  WHERE reference_table = 'direct_invoices' AND reference_id = direct_invoices.id
    AND company_id = direct_invoices.company_id AND voucher_type = 'Sales'
  ORDER BY id DESC LIMIT 1)
WHERE voucher_id IS NULL;
UPDATE direct_invoices SET cogs_voucher_id = (SELECT id FROM vouchers
  WHERE reference_table = 'direct_invoices' AND reference_id = direct_invoices.id
    AND company_id = direct_invoices.company_id AND voucher_type = 'Journal'
  ORDER BY id DESC LIMIT 1)
WHERE cogs_voucher_id IS NULL;
