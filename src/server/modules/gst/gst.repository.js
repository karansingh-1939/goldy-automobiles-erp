function buildWhereClause(tableAlias, filters = {}) {
  const clauses = [
    tableAlias === 'invoices' || tableAlias === 'i'
      ? `${tableAlias}.status = 'FINALIZED'`
      : `${tableAlias}.status <> 'CANCELLED'`,
  ];
  const params = {};

  if (filters.dateFrom) {
    clauses.push(`DATE(${tableAlias}.invoice_date) >= DATE(@dateFrom)`);
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    clauses.push(`DATE(${tableAlias}.invoice_date) <= DATE(@dateTo)`);
    params.dateTo = filters.dateTo;
  }

  return {
    clause: clauses.join(' AND '),
    params,
  };
}

export class GstRepository {
  constructor(db) {
    this.db = db;
  }

  customerCreditNotes(filters = {}) {
    const conditions = ["r.status = 'COMPLETED'", "i.status = 'FINALIZED'", 'r.company_id = 1'];
    const params = {};
    if (filters.dateFrom) {
      conditions.push('DATE(r.return_date) >= DATE(@dateFrom)');
      params.dateFrom = filters.dateFrom;
    }
    if (filters.dateTo) {
      conditions.push('DATE(r.return_date) <= DATE(@dateTo)');
      params.dateTo = filters.dateTo;
    }
    return this.db
      .prepare(
        `
      SELECT r.id AS invoice_id, r.return_number AS invoice_number, r.return_date AS invoice_date,
        'COMPLETED' AS status, 'CREDIT_NOTE' AS document_type, i.invoice_number AS original_invoice_number,
        c.id AS customer_id, c.name AS customer_name, c.gstin AS customer_gstin, c.state AS place_of_supply,
        ri.id AS line_id, 'PART' AS item_type,
        COALESCE(NULLIF(TRIM(item.hsn_code), ''), NULLIF(TRIM(item.hsn_sac_code), ''), 'UNSPECIFIED') AS hsn_sac,
        item.item_name AS description, -ri.quantity AS quantity, ri.unit_price,
        -(ri.line_total - ri.gst_amount) AS taxable_value, ri.gst_rate,
        -ri.cgst_amount AS cgst_amount, -ri.sgst_amount AS sgst_amount, -ri.igst_amount AS igst_amount,
        -ri.gst_amount AS total_tax, -ri.line_total AS line_total
      FROM customer_return_items ri JOIN customer_returns r ON r.id = ri.customer_return_id
      JOIN invoices i ON i.id = r.invoice_id JOIN customers c ON c.id = r.customer_id
      JOIN inventory_items item ON item.id = ri.item_id
      WHERE ${conditions.join(' AND ')}
    `,
      )
      .all(params);
  }

  /**
   * Summarizes all outward output GST and inward input GST (ITC).
   */
  summary(filters = {}) {
    const invFilters = buildWhereClause('invoices', filters);
    const dirFilters = buildWhereClause('direct_invoices', filters);

    const mergedParams = { ...invFilters.params };

    // 1. Outward job cards
    const jobCards = this.db
      .prepare(
        `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(taxable_amount), 0) AS taxable_value,
        COALESCE(SUM(cgst_total), 0) AS cgst_amount,
        COALESCE(SUM(sgst_total), 0) AS sgst_amount,
        COALESCE(SUM(igst_total), 0) AS igst_amount,
        COALESCE(SUM(gst_total), 0) AS total_tax,
        COALESCE(SUM(grand_total), 0) AS gross_value
      FROM invoices
      WHERE ${invFilters.clause}
    `,
      )
      .get(mergedParams);

    // 2. Outward direct invoices
    const directSales = this.db
      .prepare(
        `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(subtotal), 0) AS taxable_value,
        COALESCE(SUM(cgst_total), 0) AS cgst_amount,
        COALESCE(SUM(sgst_total), 0) AS sgst_amount,
        COALESCE(SUM(igst_total), 0) AS igst_amount,
        COALESCE(SUM(gst_total), 0) AS total_tax,
        COALESCE(SUM(grand_total), 0) AS gross_value
      FROM direct_invoices
      WHERE ${dirFilters.clause}
    `,
      )
      .get(mergedParams);

    // 3. Outward lines count
    const jobLines = this.db
      .prepare(
        `
      SELECT COUNT(ii.id) AS count
      FROM invoice_items ii
      JOIN invoices ON invoices.id = ii.invoice_id
      WHERE ${invFilters.clause}
    `,
      )
      .get(mergedParams).count;

    const dirLines = this.db
      .prepare(
        `
      SELECT COUNT(dii.id) AS count
      FROM direct_invoice_items dii
      JOIN direct_invoices ON direct_invoices.id = dii.direct_invoice_id
      WHERE ${dirFilters.clause}
    `,
      )
      .get(mergedParams).count;

    const credits = this.customerCreditNotes(filters);
    const creditTotal = (key) => credits.reduce((sum, row) => sum + row[key], 0);
    return {
      credit_note_count: new Set(credits.map((row) => row.invoice_id)).size,
      invoice_count: jobCards.count + directSales.count,
      line_count: jobLines + dirLines,
      taxable_value:
        jobCards.taxable_value + directSales.taxable_value + creditTotal('taxable_value'),
      cgst_amount: jobCards.cgst_amount + directSales.cgst_amount + creditTotal('cgst_amount'),
      sgst_amount: jobCards.sgst_amount + directSales.sgst_amount + creditTotal('sgst_amount'),
      igst_amount: jobCards.igst_amount + directSales.igst_amount + creditTotal('igst_amount'),
      total_tax: jobCards.total_tax + directSales.total_tax + creditTotal('total_tax'),
      gross_value: jobCards.gross_value + directSales.gross_value + creditTotal('line_total'),
    };
  }

  /**
   * Compiles outward tax invoice line details for GSTR-1 preparation.
   */
  gstr1Dataset(filters = {}) {
    const invFilters = buildWhereClause('invoices', filters);
    const dirFilters = buildWhereClause('direct_invoices', filters);

    const mergedParams = { ...invFilters.params };

    const sql = `
      SELECT
        invoices.id AS invoice_id,
        invoices.invoice_number,
        invoices.invoice_date,
        invoices.status,
        customers.id AS customer_id,
        customers.name AS customer_name,
        customers.gstin AS customer_gstin,
        customers.state AS place_of_supply,
        invoice_items.id AS line_id,
        invoice_items.item_type,
        COALESCE(NULLIF(TRIM(inventory_items.hsn_code), ''), NULLIF(TRIM(inventory_items.hsn_sac_code), ''), 'UNSPECIFIED') AS hsn_sac,
        invoice_items.description,
        invoice_items.quantity,
        invoice_items.unit_price,
        invoice_items.line_revenue AS taxable_value,
        invoice_items.gst_rate,
        invoice_items.cgst_amount,
        invoice_items.sgst_amount,
        invoice_items.igst_amount,
        (invoice_items.cgst_amount + invoice_items.sgst_amount + invoice_items.igst_amount) AS total_tax,
        invoice_items.line_total
      FROM invoice_items
      JOIN invoices ON invoices.id = invoice_items.invoice_id
      JOIN customers ON customers.id = invoices.customer_id
      LEFT JOIN inventory_items ON inventory_items.id = invoice_items.inventory_item_id
      WHERE ${invFilters.clause.replace(/invoices\./g, 'invoices.')}

      UNION ALL

      SELECT
        direct_invoices.id AS invoice_id,
        direct_invoices.invoice_number,
        direct_invoices.invoice_date,
        direct_invoices.status,
        customers.id AS customer_id,
        customers.name AS customer_name,
        customers.gstin AS customer_gstin,
        customers.state AS place_of_supply,
        direct_invoice_items.id AS line_id,
        'part' AS item_type,
        COALESCE(NULLIF(TRIM(inventory_items.hsn_code), ''), NULLIF(TRIM(inventory_items.hsn_sac_code), ''), 'UNSPECIFIED') AS hsn_sac,
        direct_invoice_items.description,
        direct_invoice_items.quantity,
        direct_invoice_items.unit_price,
        (direct_invoice_items.line_total - direct_invoice_items.gst_amount) AS taxable_value,
        direct_invoice_items.gst_rate,
        CASE WHEN direct_invoices.igst_total = 0 THEN ROUND(direct_invoice_items.gst_amount / 2, 2) ELSE 0.0 END AS cgst_amount,
        CASE WHEN direct_invoices.igst_total = 0 THEN (direct_invoice_items.gst_amount - ROUND(direct_invoice_items.gst_amount / 2, 2)) ELSE 0.0 END AS sgst_amount,
        CASE WHEN direct_invoices.igst_total > 0 THEN direct_invoice_items.gst_amount ELSE 0.0 END AS igst_amount,
        direct_invoice_items.gst_amount AS total_tax,
        direct_invoice_items.line_total
      FROM direct_invoice_items
      JOIN direct_invoices ON direct_invoices.id = direct_invoice_items.direct_invoice_id
      JOIN customers ON customers.id = direct_invoices.customer_id
      LEFT JOIN inventory_items ON inventory_items.id = direct_invoice_items.item_id
      WHERE ${dirFilters.clause.replace(/direct_invoices\./g, 'direct_invoices.')}

      ORDER BY invoice_date, invoice_number, line_id
    `;

    return this.db
      .prepare(sql)
      .all(mergedParams)
      .map((row) => ({ ...row, document_type: 'INVOICE' }))
      .concat(this.customerCreditNotes(filters))
      .sort(
        (a, b) =>
          a.invoice_date.localeCompare(b.invoice_date) ||
          a.invoice_number.localeCompare(b.invoice_number) ||
          a.line_id - b.line_id,
      );
  }

  /**
   * Compiles GSTR-3B tax details combining Outward Supplies and Eligible Input Tax Credit (ITC).
   */
  gstr3bDataset(filters = {}) {
    const invFilters = buildWhereClause('invoices', filters);
    const dirFilters = buildWhereClause('direct_invoices', filters);

    const mergedParams = { ...invFilters.params };

    // 3.1.a Outward supplies (Sales + Direct billing)
    const jobCards = this.db
      .prepare(
        `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(taxable_amount), 0) AS taxable_value,
        COALESCE(SUM(cgst_total), 0) AS cgst_amount,
        COALESCE(SUM(sgst_total), 0) AS sgst_amount,
        COALESCE(SUM(igst_total), 0) AS igst_amount,
        COALESCE(SUM(gst_total), 0) AS total_tax
      FROM invoices
      WHERE ${invFilters.clause}
    `,
      )
      .get(mergedParams);

    const directSales = this.db
      .prepare(
        `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(subtotal), 0) AS taxable_value,
        COALESCE(SUM(cgst_total), 0) AS cgst_amount,
        COALESCE(SUM(sgst_total), 0) AS sgst_amount,
        COALESCE(SUM(igst_total), 0) AS igst_amount,
        COALESCE(SUM(gst_total), 0) AS total_tax
      FROM direct_invoices
      WHERE ${dirFilters.clause}
    `,
      )
      .get(mergedParams);

    const summary = this.summary(filters);
    const totalOutward = {
      invoice_count: jobCards.count + directSales.count,
      credit_note_count: summary.credit_note_count,
      taxable_value: summary.taxable_value,
      integrated_tax: summary.igst_amount,
      central_tax: summary.cgst_amount,
      state_ut_tax: summary.sgst_amount,
      cess: 0,
      total_tax: summary.total_tax,
    };

    const dateConditions = [];
    const taxParams = {};
    if (filters.dateFrom) {
      dateConditions.push('DATE(v.voucher_date) >= DATE(@dateFrom)');
      taxParams.dateFrom = filters.dateFrom;
    }
    if (filters.dateTo) {
      dateConditions.push('DATE(v.voucher_date) <= DATE(@dateTo)');
      taxParams.dateTo = filters.dateTo;
    }
    const dateWhere = dateConditions.length ? `AND ${dateConditions.join(' AND ')}` : '';
    const input = this.db
      .prepare(
        `
      SELECT l.system_key, SUM(CASE WHEN je.entry_type = 'DEBIT' THEN je.amount ELSE -je.amount END) AS amount
      FROM journal_entries je JOIN vouchers v ON v.id = je.voucher_id JOIN ledgers l ON l.id = je.ledger_id
      WHERE v.status <> 'CANCELLED' AND v.company_id = 1 AND l.company_id = 1
        AND l.system_key IN ('cgst_input','sgst_input','igst_input') ${dateWhere}
      GROUP BY l.system_key
    `,
      )
      .all(taxParams);
    const amount = (key) => input.find((row) => row.system_key === key)?.amount || 0;
    const purchases = this.db
      .prepare(
        `
      SELECT COUNT(*) AS count FROM vouchers v WHERE v.status <> 'CANCELLED' AND v.company_id = 1
        AND v.voucher_type = 'Purchase' ${dateWhere}
    `,
      )
      .get(taxParams);
    const taxable = this.db
      .prepare(
        `
      SELECT COALESCE(SUM(CASE WHEN je.entry_type = 'DEBIT' THEN je.amount ELSE -je.amount END), 0) AS amount
      FROM journal_entries je JOIN vouchers v ON v.id = je.voucher_id JOIN ledgers l ON l.id = je.ledger_id
      WHERE v.status <> 'CANCELLED' AND v.company_id = 1 AND l.company_id = 1
        AND v.voucher_type IN ('Purchase','Debit Note')
        AND l.system_key IN ('inventory_stock','stock_adjustments') ${dateWhere}
    `,
      )
      .get(taxParams).amount;
    const totalItc = {
      bill_count: purchases.count,
      taxable_value: taxable,
      integrated_tax: amount('igst_input'),
      central_tax: amount('cgst_input'),
      state_ut_tax: amount('sgst_input'),
      cess: 0,
      total_tax: amount('igst_input') + amount('cgst_input') + amount('sgst_input'),
    };
    const rates = new Map();
    for (const row of this.gstr1Dataset(filters)) {
      const entry = rates.get(row.gst_rate) || {
        gst_rate: row.gst_rate,
        taxable_value: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        total_tax: 0,
      };
      for (const key of ['taxable_value', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_tax'])
        entry[key] += row[key];
      rates.set(row.gst_rate, entry);
    }
    const rateBreakdown = [...rates.values()].sort((a, b) => a.gst_rate - b.gst_rate);

    return {
      outward_supplies: totalOutward,
      eligible_itc: totalItc,
      rate_breakdown: rateBreakdown,
    };
  }

  /**
   * Dynamic HSN/SAC summary report.
   */
  hsnSummary(filters = {}) {
    const groups = new Map();
    for (const row of this.gstr1Dataset(filters)) {
      const entry = groups.get(row.hsn_sac) || {
        hsn_sac: row.hsn_sac,
        quantity: 0,
        taxable_value: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        total_tax: 0,
      };
      for (const key of [
        'quantity',
        'taxable_value',
        'cgst_amount',
        'sgst_amount',
        'igst_amount',
        'total_tax',
      ])
        entry[key] += row[key];
      groups.set(row.hsn_sac, entry);
    }
    return [...groups.values()].sort(
      (a, b) => b.taxable_value - a.taxable_value || a.hsn_sac.localeCompare(b.hsn_sac),
    );
  }
}
