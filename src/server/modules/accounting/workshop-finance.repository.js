export class WorkshopFinanceRepository {
  constructor(db) {
    this.db = db;
  }
  transaction(fn) {
    return this.db.transaction(fn)();
  }
  openInvoices() {
    return this.db
      .prepare(
        `SELECT i.id AS id, 'JOB_CARD' AS document_type, i.invoice_number, i.invoice_date, i.customer_id, c.name AS customer_name, c.phone,
      MAX(0, ROUND(i.grand_total - i.amount_paid - COALESCE((SELECT SUM(r.total_refund_amount) FROM customer_returns r WHERE r.invoice_id = i.id AND r.status = 'COMPLETED'), 0), 2)) AS outstanding
      FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.status = 'FINALIZED'
      UNION ALL
      SELECT i.id, 'DIRECT', i.invoice_number, i.invoice_date, i.customer_id, c.name, c.phone, MAX(0, ROUND(i.grand_total - i.amount_paid, 2))
      FROM direct_invoices i JOIN customers c ON c.id = i.customer_id WHERE i.company_id = 1 AND i.status <> 'CANCELLED'
      ORDER BY invoice_date, id`,
      )
      .all();
  }
  customerBalances() {
    return this.db
      .prepare(
        `SELECT l.linked_entity_id AS customer_id, c.name AS customer_name, c.phone,
      ROUND((CASE WHEN l.nature = 'Debit' THEN l.opening_balance ELSE -l.opening_balance END) + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN CASE WHEN j.entry_type = 'DEBIT' THEN j.amount ELSE -j.amount END ELSE 0 END), 0), 2) AS balance
      FROM ledgers l JOIN customers c ON c.id = l.linked_entity_id
      LEFT JOIN journal_entries j ON j.ledger_id = l.id
      LEFT JOIN vouchers v ON v.id = j.voucher_id AND v.status <> 'CANCELLED' AND v.company_id = 1
      WHERE l.company_id = 1 AND l.linked_entity_type = 'customer' GROUP BY l.id`,
      )
      .all();
  }
  cashBook(date) {
    return this.db
      .prepare(
        `SELECT l.id, l.name, l.opening_balance,
      COALESCE(SUM(CASE WHEN v.id IS NOT NULL AND v.voucher_date < @date THEN CASE WHEN j.entry_type = 'DEBIT' THEN j.amount ELSE -j.amount END ELSE 0 END), 0) AS prior_net,
      COALESCE(SUM(CASE WHEN v.id IS NOT NULL AND v.voucher_date = @date AND j.entry_type = 'DEBIT' THEN j.amount ELSE 0 END), 0) AS cash_in,
      COALESCE(SUM(CASE WHEN v.id IS NOT NULL AND v.voucher_date = @date AND j.entry_type = 'CREDIT' THEN j.amount ELSE 0 END), 0) AS cash_out
      FROM ledgers l LEFT JOIN journal_entries j ON j.ledger_id = l.id
      LEFT JOIN vouchers v ON v.id = j.voucher_id AND v.company_id = 1 AND v.status <> 'CANCELLED'
      WHERE l.company_id = 1 AND l.system_key = 'cash_in_hand' GROUP BY l.id`,
      )
      .get({ date });
  }
  counts(date) {
    return this.db
      .prepare(
        'SELECT c.*, u.name AS counted_by_name FROM daily_cash_counts c JOIN users u ON u.id = c.counted_by WHERE c.company_id = 1 AND c.count_date = ? ORDER BY c.id DESC',
      )
      .all(date);
  }
  saveCount(date, expected, counted, variance, notes, actor) {
    const result = this.db
      .prepare(
        'INSERT INTO daily_cash_counts (company_id, count_date, expected_cash, counted_cash, variance, notes, counted_by) VALUES (1, ?, ?, ?, ?, ?, ?)',
      )
      .run(date, expected, counted, variance, notes, actor);
    return this.db
      .prepare('SELECT * FROM daily_cash_counts WHERE id = ?')
      .get(result.lastInsertRowid);
  }
}
