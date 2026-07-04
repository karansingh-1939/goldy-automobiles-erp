function buildWhereClause(tableAlias, filters = {}) {
  const clauses = [`${tableAlias}.status <> 'CANCELLED'`];
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

function buildPurchaseWhereClause(filters = {}) {
  const clauses = ["pb.status <> 'CANCELLED'"];
  const params = {};

  if (filters.dateFrom) {
    clauses.push('DATE(pb.bill_date) >= DATE(@dateFrom)');
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    clauses.push('DATE(pb.bill_date) <= DATE(@dateTo)');
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

  /**
   * Summarizes all outward output GST and inward input GST (ITC).
   */
  summary(filters = {}) {
    const invFilters = buildWhereClause('invoices', filters);
    const dirFilters = buildWhereClause('direct_invoices', filters);
    const purFilters = buildPurchaseWhereClause(filters);

    const mergedParams = { ...invFilters.params };

    // 1. Outward job cards
    const jobCards = this.db.prepare(`
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
    `).get(mergedParams);

    // 2. Outward direct invoices
    const directSales = this.db.prepare(`
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
    `).get(mergedParams);

    // 3. Outward lines count
    const jobLines = this.db.prepare(`
      SELECT COUNT(ii.id) AS count
      FROM invoice_items ii
      JOIN invoices ON invoices.id = ii.invoice_id
      WHERE ${invFilters.clause}
    `).get(mergedParams).count;

    const dirLines = this.db.prepare(`
      SELECT COUNT(dii.id) AS count
      FROM direct_invoice_items dii
      JOIN direct_invoices ON direct_invoices.id = dii.direct_invoice_id
      WHERE ${dirFilters.clause}
    `).get(mergedParams).count;

    return {
      invoice_count: jobCards.count + directSales.count,
      line_count: jobLines + dirLines,
      taxable_value: jobCards.taxable_value + directSales.taxable_value,
      cgst_amount: jobCards.cgst_amount + directSales.cgst_amount,
      sgst_amount: jobCards.sgst_amount + directSales.sgst_amount,
      igst_amount: jobCards.igst_amount + directSales.igst_amount,
      total_tax: jobCards.total_tax + directSales.total_tax,
      gross_value: jobCards.gross_value + directSales.gross_value
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

    return this.db.prepare(sql).all(mergedParams);
  }

  /**
   * Compiles GSTR-3B tax details combining Outward Supplies and Eligible Input Tax Credit (ITC).
   */
  gstr3bDataset(filters = {}) {
    const invFilters = buildWhereClause('invoices', filters);
    const dirFilters = buildWhereClause('direct_invoices', filters);
    const purFilters = buildPurchaseWhereClause(filters);

    const mergedParams = { ...invFilters.params };

    // 3.1.a Outward supplies (Sales + Direct billing)
    const jobCards = this.db.prepare(`
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(taxable_amount), 0) AS taxable_value,
        COALESCE(SUM(cgst_total), 0) AS cgst_amount,
        COALESCE(SUM(sgst_total), 0) AS sgst_amount,
        COALESCE(SUM(igst_total), 0) AS igst_amount,
        COALESCE(SUM(gst_total), 0) AS total_tax
      FROM invoices
      WHERE ${invFilters.clause}
    `).get(mergedParams);

    const directSales = this.db.prepare(`
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(subtotal), 0) AS taxable_value,
        COALESCE(SUM(cgst_total), 0) AS cgst_amount,
        COALESCE(SUM(sgst_total), 0) AS sgst_amount,
        COALESCE(SUM(igst_total), 0) AS igst_amount,
        COALESCE(SUM(gst_total), 0) AS total_tax
      FROM direct_invoices
      WHERE ${dirFilters.clause}
    `).get(mergedParams);

    const totalOutward = {
      invoice_count: jobCards.count + directSales.count,
      taxable_value: jobCards.taxable_value + directSales.taxable_value,
      integrated_tax: jobCards.igst_amount + directSales.igst_amount,
      central_tax: jobCards.cgst_amount + directSales.cgst_amount,
      state_ut_tax: jobCards.sgst_amount + directSales.sgst_amount,
      cess: 0,
      total_tax: jobCards.total_tax + directSales.total_tax
    };

    // 4. Eligible ITC from Purchase Bills
    const purchases = this.db.prepare(`
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(subtotal), 0) AS taxable_value,
        COALESCE(SUM(cgst_total), 0) AS cgst_amount,
        COALESCE(SUM(sgst_total), 0) AS sgst_amount,
        COALESCE(SUM(igst_total), 0) AS igst_amount,
        COALESCE(SUM(gst_total), 0) AS total_tax
      FROM purchase_bills pb
      WHERE ${purFilters.clause}
    `).get(purFilters.params);

    const totalItc = {
      bill_count: purchases.count,
      taxable_value: purchases.taxable_value,
      integrated_tax: purchases.igst_amount,
      central_tax: purchases.cgst_amount,
      state_ut_tax: purchases.sgst_amount,
      cess: 0,
      total_tax: purchases.total_tax
    };

    // Rate-wise outbound tax breakdown
    const rateSql = `
      SELECT
        gst_rate,
        SUM(taxable_value) AS taxable_value,
        SUM(cgst_amount) AS cgst_amount,
        SUM(sgst_amount) AS sgst_amount,
        SUM(igst_amount) AS igst_amount,
        SUM(total_tax) AS total_tax
      FROM (
        SELECT
          ii.gst_rate,
          COALESCE(SUM(ii.line_revenue), 0) AS taxable_value,
          COALESCE(SUM(ii.cgst_amount), 0) AS cgst_amount,
          COALESCE(SUM(ii.sgst_amount), 0) AS sgst_amount,
          COALESCE(SUM(ii.igst_amount), 0) AS igst_amount,
          COALESCE(SUM(ii.cgst_amount + ii.sgst_amount + ii.igst_amount), 0) AS total_tax
        FROM invoice_items ii
        JOIN invoices ON invoices.id = ii.invoice_id
        WHERE ${invFilters.clause.replace(/invoices\./g, 'invoices.')}
        GROUP BY ii.gst_rate

        UNION ALL

        SELECT
          dii.gst_rate,
          COALESCE(SUM(dii.line_total - dii.gst_amount), 0) AS taxable_value,
          COALESCE(SUM(CASE WHEN di.igst_total = 0 THEN ROUND(dii.gst_amount / 2, 2) ELSE 0.0 END), 0) AS cgst_amount,
          COALESCE(SUM(CASE WHEN di.igst_total = 0 THEN (dii.gst_amount - ROUND(dii.gst_amount / 2, 2)) ELSE 0.0 END), 0) AS sgst_amount,
          COALESCE(SUM(CASE WHEN di.igst_total > 0 THEN dii.gst_amount ELSE 0.0 END), 0) AS igst_amount,
          COALESCE(SUM(dii.gst_amount), 0) AS total_tax
        FROM direct_invoice_items dii
        JOIN direct_invoices di ON di.id = dii.direct_invoice_id
        WHERE ${dirFilters.clause.replace(/direct_invoices\./g, 'di.')}
        GROUP BY dii.gst_rate
      )
      GROUP BY gst_rate
      ORDER BY gst_rate
    `;

    const rateBreakdown = this.db.prepare(rateSql).all(mergedParams);

    return {
      outward_supplies: totalOutward,
      eligible_itc: totalItc,
      rate_breakdown: rateBreakdown
    };
  }

  /**
   * Dynamic HSN/SAC summary report.
   */
  hsnSummary(filters = {}) {
    const invFilters = buildWhereClause('invoices', filters);
    const dirFilters = buildWhereClause('direct_invoices', filters);

    const mergedParams = { ...invFilters.params };

    const sql = `
      SELECT
        hsn_sac,
        SUM(quantity) AS quantity,
        SUM(taxable_value) AS taxable_value,
        SUM(cgst_amount) AS cgst_amount,
        SUM(sgst_amount) AS sgst_amount,
        SUM(igst_amount) AS igst_amount,
        SUM(total_tax) AS total_tax
      FROM (
        SELECT
          COALESCE(NULLIF(TRIM(item.hsn_code), ''), NULLIF(TRIM(item.hsn_sac_code), ''), 'UNSPECIFIED') AS hsn_sac,
          COALESCE(SUM(ii.quantity), 0) AS quantity,
          COALESCE(SUM(ii.line_revenue), 0) AS taxable_value,
          COALESCE(SUM(ii.cgst_amount), 0) AS cgst_amount,
          COALESCE(SUM(ii.sgst_amount), 0) AS sgst_amount,
          COALESCE(SUM(ii.igst_amount), 0) AS igst_amount,
          COALESCE(SUM(ii.cgst_amount + ii.sgst_amount + ii.igst_amount), 0) AS total_tax
        FROM invoice_items ii
        JOIN invoices ON invoices.id = ii.invoice_id
        LEFT JOIN inventory_items item ON item.id = ii.inventory_item_id
        WHERE ${invFilters.clause.replace(/invoices\./g, 'invoices.')}
        GROUP BY hsn_sac

        UNION ALL

        SELECT
          COALESCE(NULLIF(TRIM(item.hsn_code), ''), NULLIF(TRIM(item.hsn_sac_code), ''), 'UNSPECIFIED') AS hsn_sac,
          COALESCE(SUM(dii.quantity), 0) AS quantity,
          COALESCE(SUM(dii.line_total - dii.gst_amount), 0) AS taxable_value,
          COALESCE(SUM(CASE WHEN di.igst_total = 0 THEN ROUND(dii.gst_amount / 2, 2) ELSE 0.0 END), 0) AS cgst_amount,
          COALESCE(SUM(CASE WHEN di.igst_total = 0 THEN (dii.gst_amount - ROUND(dii.gst_amount / 2, 2)) ELSE 0.0 END), 0) AS sgst_amount,
          COALESCE(SUM(CASE WHEN di.igst_total > 0 THEN dii.gst_amount ELSE 0.0 END), 0) AS igst_amount,
          COALESCE(SUM(dii.gst_amount), 0) AS total_tax
        FROM direct_invoice_items dii
        JOIN direct_invoices di ON di.id = dii.direct_invoice_id
        LEFT JOIN inventory_items item ON item.id = dii.item_id
        WHERE ${dirFilters.clause.replace(/direct_invoices\./g, 'di.')}
        GROUP BY hsn_sac
      )
      GROUP BY hsn_sac
      ORDER BY taxable_value DESC, hsn_sac
    `;

    return this.db.prepare(sql).all(mergedParams);
  }
}
