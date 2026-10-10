// Invoice net profit is gross profit before shared workshop expenses.
const returnedLinesCte = `returned_lines AS (
  SELECT invoices.id, invoices.customer_id, invoices.vehicle_id, invoices.job_card_id,
    customer_returns.return_date AS invoice_date, customer_return_items.item_id,
    customer_return_items.line_total - customer_return_items.gst_amount AS revenue,
    ROUND(invoice_items.purchase_cost_snapshot * customer_return_items.quantity, 2) AS cost
  FROM customer_return_items
  JOIN customer_returns ON customer_returns.id = customer_return_items.customer_return_id
  JOIN invoices ON invoices.id = customer_returns.invoice_id
  JOIN invoice_items ON invoice_items.id = (
    SELECT original.id FROM invoice_items original
    WHERE original.invoice_id = invoices.id
      AND original.inventory_item_id = customer_return_items.item_id
      AND original.batch_id = customer_return_items.batch_id
    ORDER BY original.id LIMIT 1
  )
  WHERE customer_returns.status = 'COMPLETED' AND customer_returns.company_id = 1
    AND invoices.status = 'FINALIZED'
)`;

const salesCte = `WITH ${returnedLinesCte}, sales AS (
  SELECT invoices.id, invoices.customer_id, invoices.vehicle_id, invoices.job_card_id,
    invoices.invoice_date, invoices.status, profit_records.revenue,
    profit_records.cost_total, profit_records.gross_profit
  FROM invoices JOIN profit_records ON profit_records.invoice_id = invoices.id
  UNION ALL
  SELECT direct_invoices.id, direct_invoices.customer_id, NULL, NULL,
    direct_invoices.invoice_date, 'FINALIZED', direct_invoices.subtotal,
    COALESCE(SUM(direct_invoice_items.line_cost), 0),
    direct_invoices.subtotal - COALESCE(SUM(direct_invoice_items.line_cost), 0)
  FROM direct_invoices
  LEFT JOIN direct_invoice_items ON direct_invoice_items.direct_invoice_id = direct_invoices.id
  WHERE direct_invoices.status <> 'CANCELLED' AND direct_invoices.company_id = 1
  GROUP BY direct_invoices.id
  UNION ALL
  SELECT id, customer_id, vehicle_id, job_card_id, invoice_date, 'FINALIZED',
    -revenue, -cost, cost - revenue FROM returned_lines
  UNION ALL
  SELECT NULL, COALESCE(original.customer_id, direct.customer_id), original.vehicle_id,
    original.job_card_id, vouchers.voucher_date, 'FINALIZED',
    CASE WHEN journal_entries.entry_type = 'CREDIT' THEN journal_entries.amount ELSE -journal_entries.amount END,
    0, CASE WHEN journal_entries.entry_type = 'CREDIT' THEN journal_entries.amount ELSE -journal_entries.amount END
  FROM journal_entries
  JOIN vouchers ON vouchers.id = journal_entries.voucher_id
  JOIN ledgers ON ledgers.id = journal_entries.ledger_id
  JOIN account_groups ON account_groups.id = ledgers.group_id
  LEFT JOIN customer_returns ON vouchers.reference_table = 'customer_returns' AND customer_returns.id = vouchers.reference_id
  LEFT JOIN invoices original ON original.id = CASE WHEN vouchers.reference_table = 'invoices' THEN vouchers.reference_id ELSE customer_returns.invoice_id END
  LEFT JOIN direct_invoices direct ON vouchers.reference_table = 'direct_invoices' AND direct.id = vouchers.reference_id
  WHERE ledgers.system_key = 'round_off' AND account_groups.nature = 'Revenue'
    AND vouchers.status <> 'CANCELLED' AND vouchers.company_id = 1 AND ledgers.company_id = 1
)`;

const expensesCte = `WITH expense_totals AS (
  SELECT vouchers.voucher_date AS expense_date,
    CASE WHEN journal_entries.entry_type = 'DEBIT' THEN journal_entries.amount ELSE -journal_entries.amount END AS amount
  FROM journal_entries
  JOIN vouchers ON vouchers.id = journal_entries.voucher_id
  JOIN ledgers ON ledgers.id = journal_entries.ledger_id
  JOIN account_groups ON account_groups.id = ledgers.group_id
  WHERE vouchers.status <> 'CANCELLED' AND vouchers.company_id = 1
    AND ledgers.company_id = 1 AND account_groups.nature = 'Expense'
    AND ledgers.name <> 'Cost of Goods Sold' AND account_groups.name <> 'Direct Expenses'
  UNION ALL
  SELECT expense_date, amount FROM expenses
  WHERE voucher_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM vouchers WHERE vouchers.reference_table = 'expenses' AND vouchers.reference_id = expenses.id
  )
)`;

function invoiceWhereClause(filters = {}) {
  const clauses = ["invoices.status = 'FINALIZED'"];
  const params = {};

  if (filters.dateFrom) {
    clauses.push('DATE(invoices.invoice_date) >= DATE(@dateFrom)');
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    clauses.push('DATE(invoices.invoice_date) <= DATE(@dateTo)');
    params.dateTo = filters.dateTo;
  }

  return {
    clause: `WHERE ${clauses.join(' AND ')}`,
    params,
  };
}

function expenseWhereClause(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.dateFrom) {
    clauses.push('DATE(expenses.expense_date) >= DATE(@dateFrom)');
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    clauses.push('DATE(expenses.expense_date) <= DATE(@dateTo)');
    params.dateTo = filters.dateTo;
  }

  return {
    clause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export class ProfitRepository {
  constructor(db) {
    this.db = db;
  }

  summary(filters) {
    const invoices = invoiceWhereClause(filters);
    const expenses = expenseWhereClause(filters);

    const profit = this.db
      .prepare(
        `
      ${salesCte}
      SELECT
        COALESCE(SUM(invoices.revenue), 0) AS revenue,
        COALESCE(SUM(invoices.cost_total), 0) AS cost,
        COALESCE(SUM(invoices.gross_profit), 0) AS gross_profit
      FROM sales invoices
      ${invoices.clause}
    `,
      )
      .get(invoices.params);

    const expense = this.db
      .prepare(
        `
      ${expensesCte}
      SELECT COALESCE(SUM(amount), 0) AS total_expenses
      FROM expense_totals expenses
      ${expenses.clause}
    `,
      )
      .get(expenses.params);

    return {
      ...profit,
      total_expenses: expense.total_expenses,
    };
  }

  profitByMonth(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db
      .prepare(
        `
      ${salesCte}
      SELECT
        strftime('%Y-%m', invoices.invoice_date) AS month,
        COALESCE(SUM(invoices.revenue), 0) AS revenue,
        COALESCE(SUM(invoices.cost_total), 0) AS cost,
        COALESCE(SUM(invoices.gross_profit), 0) AS gross_profit
      FROM sales invoices
      ${invoiceFilters.clause}
      GROUP BY strftime('%Y-%m', invoices.invoice_date)
      ORDER BY month
    `,
      )
      .all(invoiceFilters.params);
  }

  expensesByMonth(filters) {
    const expenseFilters = expenseWhereClause(filters);
    return this.db
      .prepare(
        `
      ${expensesCte}
      SELECT
        strftime('%Y-%m', expenses.expense_date) AS month,
        COALESCE(SUM(expenses.amount), 0) AS expenses
      FROM expense_totals expenses
      ${expenseFilters.clause}
      GROUP BY strftime('%Y-%m', expenses.expense_date)
      ORDER BY month
    `,
      )
      .all(expenseFilters.params);
  }

  profitByCustomer(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db
      .prepare(
        `
      ${salesCte}
      SELECT
        customers.id AS customer_id,
        COALESCE(customers.name, 'Unassigned') AS customer,
        COALESCE(SUM(invoices.revenue), 0) AS revenue,
        COALESCE(SUM(invoices.cost_total), 0) AS cost,
        COALESCE(SUM(invoices.gross_profit), 0) AS profit
      FROM sales invoices
      LEFT JOIN customers ON customers.id = invoices.customer_id
      ${invoiceFilters.clause}
      GROUP BY customers.id, customers.name
      ORDER BY profit DESC, customer
    `,
      )
      .all(invoiceFilters.params);
  }

  profitByVehicle(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db
      .prepare(
        `
      ${salesCte}
      SELECT
        vehicles.id AS vehicle_id,
        vehicles.registration_number AS vehicle,
        customers.name AS customer,
        COALESCE(SUM(invoices.revenue), 0) AS revenue,
        COALESCE(SUM(invoices.cost_total), 0) AS cost,
        COALESCE(SUM(invoices.gross_profit), 0) AS profit
      FROM sales invoices
      LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
      LEFT JOIN customers ON customers.id = invoices.customer_id
      ${invoiceFilters.clause}
      GROUP BY vehicles.id, vehicles.registration_number, customers.name
      ORDER BY profit DESC, vehicle
    `,
      )
      .all(invoiceFilters.params);
  }

  profitByInventoryItem(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db
      .prepare(
        `
        WITH ${returnedLinesCte}, item_sales AS (
        SELECT invoices.invoice_date, invoice_items.inventory_item_id AS item_id,
          invoice_items.line_revenue AS revenue, invoice_items.line_cost AS cost
        FROM invoice_items JOIN invoices ON invoices.id = invoice_items.invoice_id
        WHERE invoices.status = 'FINALIZED' AND invoice_items.item_type IN ('PART', 'LUBRICANT')
        UNION ALL
        SELECT direct_invoices.invoice_date, direct_invoice_items.item_id,
          direct_invoice_items.line_total - direct_invoice_items.gst_amount, direct_invoice_items.line_cost
        FROM direct_invoice_items JOIN direct_invoices ON direct_invoices.id = direct_invoice_items.direct_invoice_id
        WHERE direct_invoices.status <> 'CANCELLED' AND direct_invoices.company_id = 1
        UNION ALL
        SELECT invoice_date, item_id, -revenue, -cost FROM returned_lines
      )
      SELECT inventory_items.id AS item_id, inventory_items.sku, inventory_items.item_name AS item,
        SUM(invoices.revenue) AS revenue, SUM(invoices.cost) AS cost,
        SUM(invoices.revenue - invoices.cost) AS profit
      FROM (SELECT item_sales.*, 'FINALIZED' AS status FROM item_sales) invoices
      JOIN inventory_items ON inventory_items.id = invoices.item_id
      ${invoiceFilters.clause}
      GROUP BY inventory_items.id ORDER BY profit DESC, item
    `,
      )
      .all(invoiceFilters.params);
  }

  profitByMechanic(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db
      .prepare(
        `
      ${salesCte}
      SELECT
        COALESCE(technicians.id, users.id) AS mechanic_id,
        COALESCE(technicians.full_name, users.name, 'Unassigned') AS mechanic,
        COALESCE(SUM(invoices.revenue), 0) AS revenue,
        COALESCE(SUM(invoices.cost_total), 0) AS cost,
        COALESCE(SUM(invoices.gross_profit), 0) AS profit
      FROM sales invoices
      LEFT JOIN job_cards ON job_cards.id = invoices.job_card_id
      LEFT JOIN users ON users.id = job_cards.assigned_to
      LEFT JOIN technicians ON technicians.id = job_cards.technician_id
      ${invoiceFilters.clause}
      GROUP BY COALESCE(technicians.id, users.id), COALESCE(technicians.full_name, users.name)
      ORDER BY profit DESC, mechanic
    `,
      )
      .all(invoiceFilters.params);
  }

  tallyExport(filters) {
    const clauses = ['1=1'];
    const params = {};

    if (filters.dateFrom) {
      clauses.push('DATE(invoice_date) >= DATE(@dateFrom)');
      params.dateFrom = filters.dateFrom;
    }

    if (filters.dateTo) {
      clauses.push('DATE(invoice_date) <= DATE(@dateTo)');
      params.dateTo = filters.dateTo;
    }

    const clause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return this.db
      .prepare(
        `
      SELECT * FROM (SELECT
        invoices.invoice_number,
        invoices.invoice_date,
        invoices.grand_total,
        invoices.taxable_amount,
        invoices.cgst_total,
        invoices.sgst_total,
        invoices.igst_total,
        customers.name AS customer_name, 'INVOICE' AS document_type
      FROM invoices
      JOIN customers ON customers.id = invoices.customer_id
      WHERE invoices.status = 'FINALIZED'
      UNION ALL
      SELECT d.invoice_number, d.invoice_date, d.grand_total, d.subtotal,
        d.cgst_total, d.sgst_total, d.igst_total, c.name, 'INVOICE'
      FROM direct_invoices d JOIN customers c ON c.id=d.customer_id WHERE d.status <> 'CANCELLED'
      UNION ALL
      SELECT r.return_number, r.return_date, -SUM(ri.line_total), -SUM(ri.line_total-ri.gst_amount),
        -SUM(ri.cgst_amount), -SUM(ri.sgst_amount), -SUM(ri.igst_amount), c.name, 'CREDIT_NOTE'
      FROM customer_returns r JOIN customer_return_items ri ON ri.customer_return_id=r.id
      JOIN customers c ON c.id=r.customer_id JOIN invoices i ON i.id=r.invoice_id
      WHERE r.status='COMPLETED' AND i.status='FINALIZED' GROUP BY r.id
      ) ${clause}
      ORDER BY invoice_date ASC, invoice_number ASC
    `,
      )
      .all(params);
  }

  tallyExportAllVouchers(filters) {
    const clauses = ["vouchers.status <> 'CANCELLED'"];
    const params = {};

    if (filters.dateFrom) {
      clauses.push('DATE(vouchers.voucher_date) >= DATE(@dateFrom)');
      params.dateFrom = filters.dateFrom;
    }

    if (filters.dateTo) {
      clauses.push('DATE(vouchers.voucher_date) <= DATE(@dateTo)');
      params.dateTo = filters.dateTo;
    }

    const clause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const vouchers = this.db
      .prepare(
        `
      SELECT
        vouchers.id,
        vouchers.voucher_number,
        vouchers.voucher_type,
        vouchers.voucher_date,
        vouchers.narration,
        vouchers.company_id
      FROM vouchers
      ${clause}
      ORDER BY vouchers.voucher_date ASC, vouchers.id ASC
    `,
      )
      .all(params);

    // Load journal entries for each voucher
    for (const v of vouchers) {
      v.entries = this.db
        .prepare(
          `
        SELECT
          je.entry_type,
          je.amount,
          je.narration,
          l.name AS ledger_name,
          l.nature AS ledger_nature,
          ag.name AS group_name
        FROM journal_entries je
        JOIN ledgers l ON je.ledger_id = l.id
        JOIN account_groups ag ON l.group_id = ag.id
        WHERE je.voucher_id = ?
        ORDER BY je.entry_type DESC -- DEBIT first
      `,
        )
        .all(v.id);
    }

    return vouchers;
  }
}
