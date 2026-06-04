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

function hsnExpression(alias = 'inventory_items') {
  return `COALESCE(
    NULLIF(TRIM(${alias}.hsn_code), ''),
    NULLIF(TRIM(${alias}.hsn_sac_code), ''),
    'UNSPECIFIED'
  )`;
}

export class GstRepository {
  constructor(db) {
    this.db = db;
  }

  summary(filters = {}) {
    const invoiceFilters = invoiceWhereClause(filters);

    const totals = this.db.prepare(`
      SELECT
        COUNT(*) AS invoice_count,
        COALESCE(SUM(taxable_amount), 0) AS taxable_value,
        COALESCE(SUM(cgst_total), 0) AS cgst_amount,
        COALESCE(SUM(sgst_total), 0) AS sgst_amount,
        COALESCE(SUM(igst_total), 0) AS igst_amount,
        COALESCE(SUM(gst_total), 0) AS total_tax,
        COALESCE(SUM(grand_total), 0) AS gross_value
      FROM invoices
      ${invoiceFilters.clause}
    `).get(invoiceFilters.params);

    const lineTotals = this.db.prepare(`
      SELECT COUNT(invoice_items.id) AS line_count
      FROM invoice_items
      JOIN invoices ON invoices.id = invoice_items.invoice_id
      ${invoiceFilters.clause}
    `).get(invoiceFilters.params);

    return {
      ...totals,
      line_count: lineTotals.line_count,
    };
  }

  gstr1Dataset(filters = {}) {
    const invoiceFilters = invoiceWhereClause(filters);

    return this.db.prepare(`
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
        ${hsnExpression()} AS hsn_sac,
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
      ${invoiceFilters.clause}
      ORDER BY invoices.invoice_date, invoices.invoice_number, invoice_items.id
    `).all(invoiceFilters.params);
  }

  gstr3bDataset(filters = {}) {
    const invoiceFilters = invoiceWhereClause(filters);

    const outwardSupplies = this.db.prepare(`
      SELECT
        COUNT(*) AS invoice_count,
        COALESCE(SUM(taxable_amount), 0) AS taxable_value,
        COALESCE(SUM(igst_total), 0) AS integrated_tax,
        COALESCE(SUM(cgst_total), 0) AS central_tax,
        COALESCE(SUM(sgst_total), 0) AS state_ut_tax,
        0 AS cess,
        COALESCE(SUM(gst_total), 0) AS total_tax
      FROM invoices
      ${invoiceFilters.clause}
    `).get(invoiceFilters.params);

    const rateBreakdown = this.db.prepare(`
      SELECT
        invoice_items.gst_rate,
        COALESCE(SUM(invoice_items.line_revenue), 0) AS taxable_value,
        COALESCE(SUM(invoice_items.cgst_amount), 0) AS cgst_amount,
        COALESCE(SUM(invoice_items.sgst_amount), 0) AS sgst_amount,
        COALESCE(SUM(invoice_items.igst_amount), 0) AS igst_amount,
        COALESCE(SUM(
          invoice_items.cgst_amount
          + invoice_items.sgst_amount
          + invoice_items.igst_amount
        ), 0) AS total_tax
      FROM invoice_items
      JOIN invoices ON invoices.id = invoice_items.invoice_id
      ${invoiceFilters.clause}
      GROUP BY invoice_items.gst_rate
      ORDER BY invoice_items.gst_rate
    `).all(invoiceFilters.params);

    return {
      outward_supplies: outwardSupplies,
      rate_breakdown: rateBreakdown,
    };
  }

  hsnSummary(filters = {}) {
    const invoiceFilters = invoiceWhereClause(filters);

    return this.db.prepare(`
      SELECT
        ${hsnExpression()} AS hsn_sac,
        COALESCE(SUM(invoice_items.quantity), 0) AS quantity,
        COALESCE(SUM(invoice_items.line_revenue), 0) AS taxable_value,
        COALESCE(SUM(invoice_items.cgst_amount), 0) AS cgst_amount,
        COALESCE(SUM(invoice_items.sgst_amount), 0) AS sgst_amount,
        COALESCE(SUM(invoice_items.igst_amount), 0) AS igst_amount,
        COALESCE(SUM(
          invoice_items.cgst_amount
          + invoice_items.sgst_amount
          + invoice_items.igst_amount
        ), 0) AS total_tax
      FROM invoice_items
      JOIN invoices ON invoices.id = invoice_items.invoice_id
      LEFT JOIN inventory_items ON inventory_items.id = invoice_items.inventory_item_id
      ${invoiceFilters.clause}
      GROUP BY ${hsnExpression()}
      ORDER BY taxable_value DESC, hsn_sac
    `).all(invoiceFilters.params);
  }
}
