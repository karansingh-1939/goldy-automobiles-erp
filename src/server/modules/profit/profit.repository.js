function invoiceWhereClause(filters = {}) {
  const clauses = ["invoices.status <> 'CANCELLED'"];
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

    const profit = this.db.prepare(`
      SELECT
        COALESCE(SUM(profit_records.revenue), 0) AS revenue,
        COALESCE(SUM(profit_records.cost_total), 0) AS cost,
        COALESCE(SUM(profit_records.gross_profit), 0) AS gross_profit
      FROM profit_records
      JOIN invoices ON invoices.id = profit_records.invoice_id
      ${invoices.clause}
    `).get(invoices.params);

    const expense = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total_expenses
      FROM expenses
      ${expenses.clause}
    `).get(expenses.params);

    return {
      ...profit,
      total_expenses: expense.total_expenses,
    };
  }

  profitByMonth(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db.prepare(`
      SELECT
        strftime('%Y-%m', invoices.invoice_date) AS month,
        COALESCE(SUM(profit_records.revenue), 0) AS revenue,
        COALESCE(SUM(profit_records.cost_total), 0) AS cost,
        COALESCE(SUM(profit_records.gross_profit), 0) AS gross_profit
      FROM profit_records
      JOIN invoices ON invoices.id = profit_records.invoice_id
      ${invoiceFilters.clause}
      GROUP BY strftime('%Y-%m', invoices.invoice_date)
      ORDER BY month
    `).all(invoiceFilters.params);
  }

  expensesByMonth(filters) {
    const expenseFilters = expenseWhereClause(filters);
    return this.db.prepare(`
      SELECT
        strftime('%Y-%m', expenses.expense_date) AS month,
        COALESCE(SUM(expenses.amount), 0) AS expenses
      FROM expenses
      ${expenseFilters.clause}
      GROUP BY strftime('%Y-%m', expenses.expense_date)
      ORDER BY month
    `).all(expenseFilters.params);
  }

  profitByCustomer(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db.prepare(`
      SELECT
        customers.id AS customer_id,
        customers.name AS customer,
        COALESCE(SUM(profit_records.revenue), 0) AS revenue,
        COALESCE(SUM(profit_records.cost_total), 0) AS cost,
        COALESCE(SUM(profit_records.gross_profit), 0) AS profit
      FROM profit_records
      JOIN invoices ON invoices.id = profit_records.invoice_id
      JOIN customers ON customers.id = invoices.customer_id
      ${invoiceFilters.clause}
      GROUP BY customers.id, customers.name
      ORDER BY profit DESC, customer
    `).all(invoiceFilters.params);
  }

  profitByVehicle(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db.prepare(`
      SELECT
        vehicles.id AS vehicle_id,
        vehicles.registration_number AS vehicle,
        customers.name AS customer,
        COALESCE(SUM(profit_records.revenue), 0) AS revenue,
        COALESCE(SUM(profit_records.cost_total), 0) AS cost,
        COALESCE(SUM(profit_records.gross_profit), 0) AS profit
      FROM profit_records
      JOIN invoices ON invoices.id = profit_records.invoice_id
      LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
      JOIN customers ON customers.id = invoices.customer_id
      ${invoiceFilters.clause}
      GROUP BY vehicles.id, vehicles.registration_number, customers.name
      ORDER BY profit DESC, vehicle
    `).all(invoiceFilters.params);
  }

  profitByInventoryItem(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db.prepare(`
      SELECT
        inventory_items.id AS item_id,
        inventory_items.sku,
        inventory_items.item_name AS item,
        COALESCE(SUM(invoice_items.line_revenue), 0) AS revenue,
        COALESCE(SUM(invoice_items.line_cost), 0) AS cost,
        COALESCE(SUM(invoice_items.line_profit), 0) AS profit
      FROM invoice_items
      JOIN invoices ON invoices.id = invoice_items.invoice_id
      JOIN inventory_items ON inventory_items.id = invoice_items.inventory_item_id
      ${invoiceFilters.clause}
        AND invoice_items.item_type IN ('PART', 'LUBRICANT')
        AND invoice_items.inventory_item_id IS NOT NULL
      GROUP BY inventory_items.id, inventory_items.sku, inventory_items.item_name
      ORDER BY profit DESC, item
    `).all(invoiceFilters.params);
  }

  profitByMechanic(filters) {
    const invoiceFilters = invoiceWhereClause(filters);
    return this.db.prepare(`
      SELECT
        COALESCE(technicians.id, users.id) AS mechanic_id,
        COALESCE(technicians.full_name, users.name, 'Unassigned') AS mechanic,
        COALESCE(SUM(profit_records.revenue), 0) AS revenue,
        COALESCE(SUM(profit_records.cost_total), 0) AS cost,
        COALESCE(SUM(profit_records.gross_profit), 0) AS profit
      FROM profit_records
      JOIN invoices ON invoices.id = profit_records.invoice_id
      LEFT JOIN job_cards ON job_cards.id = invoices.job_card_id
      LEFT JOIN users ON users.id = job_cards.assigned_to
      LEFT JOIN technicians ON technicians.id = job_cards.technician_id
      ${invoiceFilters.clause}
      GROUP BY COALESCE(technicians.id, users.id), COALESCE(technicians.full_name, users.name)
      ORDER BY profit DESC, mechanic
    `).all(invoiceFilters.params);
  }

  tallyExport(filters) {
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

    const clause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return this.db.prepare(`
      SELECT
        invoices.invoice_number,
        invoices.invoice_date,
        invoices.grand_total,
        invoices.taxable_amount,
        invoices.cgst_total,
        invoices.sgst_total,
        invoices.igst_total,
        customers.name AS customer_name
      FROM invoices
      JOIN customers ON customers.id = invoices.customer_id
      ${clause}
      ORDER BY invoices.invoice_date ASC, invoices.id ASC
    `).all(params);
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

    const vouchers = this.db.prepare(`
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
    `).all(params);

    // Load journal entries for each voucher
    for (const v of vouchers) {
      v.entries = this.db.prepare(`
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
      `).all(v.id);
    }

    return vouchers;
  }
}

