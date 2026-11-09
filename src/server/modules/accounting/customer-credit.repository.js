export class CustomerCreditRepository {
  constructor(db) {
    this.db = db;
  }

  findCustomer(customerId) {
    return this.db
      .prepare('SELECT ledger_id, credit_limit FROM customers WHERE id = ?')
      .get(customerId);
  }

  outstanding(companyId, ledgerId) {
    if (!ledgerId) return 0;
    const balance = this.db
      .prepare(
        `SELECT l.opening_balance + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN
          CASE WHEN je.entry_type = 'DEBIT' THEN je.amount ELSE -je.amount END ELSE 0 END), 0) AS outstanding
        FROM ledgers l LEFT JOIN journal_entries je ON je.ledger_id = l.id
        LEFT JOIN vouchers v ON v.id = je.voucher_id AND v.company_id = ? AND v.status <> 'CANCELLED'
        WHERE l.id = ? AND l.company_id = ? GROUP BY l.id`,
      )
      .get(companyId, ledgerId, companyId);
    return Math.round(Number(balance?.outstanding || 0) * 100) / 100;
  }
}
