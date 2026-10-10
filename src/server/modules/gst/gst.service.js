import { localDate } from '../../shared/utils/local-date.js';
import { AppError } from '../../shared/errors/app-error.js';
import { GstRepository } from './gst.repository.js';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function todayString() {
  return localDate();
}

function firstDayOfMonth(dateText) {
  return `${dateText.slice(0, 7)}-01`;
}

function firstDayOfYear(dateText) {
  return `${dateText.slice(0, 4)}-01-01`;
}

function normalizePeriod(period) {
  if (!period) {
    return null;
  }

  return String(period)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeDate(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = String(value).trim();
  if (!isoDatePattern.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
    throw new AppError(`${label} must be a valid YYYY-MM-DD date.`, 400, 'VALIDATION_ERROR');
  }

  return date;
}

function parseFilters(query = {}) {
  const period = normalizePeriod(query.period);
  const today = todayString();
  let dateFrom = normalizeDate(query.dateFrom ?? query.from, 'Date from');
  let dateTo = normalizeDate(query.dateTo ?? query.to, 'Date to');

  if (period === 'today') {
    dateFrom = today;
    dateTo = today;
  } else if (period === 'this_month') {
    dateFrom = firstDayOfMonth(today);
    dateTo = today;
  } else if (period === 'this_year') {
    dateFrom = firstDayOfYear(today);
    dateTo = today;
  } else if (period === 'custom') {
    if (!dateFrom || !dateTo) {
      throw new AppError('Custom range requires dateFrom and dateTo.', 400, 'VALIDATION_ERROR');
    }
  } else if (period) {
    throw new AppError('GST report period is invalid.', 400, 'VALIDATION_ERROR');
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AppError('Date range is invalid.', 400, 'VALIDATION_ERROR');
  }

  return {
    period,
    dateFrom,
    dateTo,
  };
}

function mapSummaryRow(row) {
  return {
    invoiceCount: row.invoice_count,
    creditNoteCount: row.credit_note_count || 0,
    lineCount: row.line_count,
    taxableValue: money(row.taxable_value),
    cgstAmount: money(row.cgst_amount),
    sgstAmount: money(row.sgst_amount),
    igstAmount: money(row.igst_amount),
    totalTax: money(row.total_tax),
    grossValue: money(row.gross_value),
  };
}

function mapGstr1Row(row) {
  return {
    documentType: row.document_type || 'INVOICE',
    originalInvoiceNumber: row.original_invoice_number || null,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    status: row.status,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerGstin: row.customer_gstin,
    placeOfSupply: row.place_of_supply,
    lineId: row.line_id,
    itemType: row.item_type,
    hsnSac: row.hsn_sac,
    description: row.description,
    quantity: money(row.quantity),
    unitPrice: money(row.unit_price),
    taxableValue: money(row.taxable_value),
    gstRate: money(row.gst_rate),
    cgstAmount: money(row.cgst_amount),
    sgstAmount: money(row.sgst_amount),
    igstAmount: money(row.igst_amount),
    totalTax: money(row.total_tax),
    lineTotal: money(row.line_total),
  };
}

function mapGstr3bDataset(dataset) {
  const outward = dataset.outward_supplies;
  const itc = dataset.eligible_itc;

  return {
    outwardSupplies: {
      invoiceCount: outward.invoice_count,
      taxableValue: money(outward.taxable_value),
      integratedTax: money(outward.integrated_tax),
      centralTax: money(outward.central_tax),
      stateUtTax: money(outward.state_ut_tax),
      cess: money(outward.cess),
      totalTax: money(outward.total_tax),
    },
    eligibleItc: {
      billCount: itc.bill_count,
      taxableValue: money(itc.taxable_value),
      integratedTax: money(itc.integrated_tax),
      centralTax: money(itc.central_tax),
      stateUtTax: money(itc.state_ut_tax),
      cess: money(itc.cess),
      totalTax: money(itc.total_tax),
    },
    rateBreakdown: dataset.rate_breakdown.map((row) => ({
      gstRate: money(row.gst_rate),
      taxableValue: money(row.taxable_value),
      cgstAmount: money(row.cgst_amount),
      sgstAmount: money(row.sgst_amount),
      igstAmount: money(row.igst_amount),
      totalTax: money(row.total_tax),
    })),
  };
}

function mapHsnRow(row) {
  return {
    hsnSac: row.hsn_sac,
    quantity: money(row.quantity),
    taxableValue: money(row.taxable_value),
    cgstAmount: money(row.cgst_amount),
    sgstAmount: money(row.sgst_amount),
    igstAmount: money(row.igst_amount),
    totalTax: money(row.total_tax),
  };
}

export class GstService {
  constructor(db) {
    this.db = db;
    this.repository = new GstRepository(db);
  }

  summary(query = {}) {
    const filters = parseFilters(query);

    return {
      filters,
      data: mapSummaryRow(this.repository.summary(filters)),
    };
  }

  gstr1(query = {}) {
    const filters = parseFilters(query);

    return {
      filters,
      data: this.repository.gstr1Dataset(filters).map(mapGstr1Row),
    };
  }

  gstr3b(query = {}) {
    const filters = parseFilters(query);

    return {
      filters,
      data: mapGstr3bDataset(this.repository.gstr3bDataset(filters)),
    };
  }

  hsnSummary(query = {}) {
    const filters = parseFilters(query);

    return {
      filters,
      data: this.repository.hsnSummary(filters).map(mapHsnRow),
    };
  }

  getPeriodLocks(companyId) {
    return this.db
      .prepare(
        `
      SELECT * FROM gst_period_locks 
      WHERE company_id = ? 
      ORDER BY tax_period DESC
    `,
      )
      .all(companyId);
  }

  updatePeriodLock(companyId, taxPeriod, isLocked, userId) {
    if (!/^\d{4}-\d{2}$/.test(taxPeriod)) {
      throw new AppError('Tax period must be in YYYY-MM format.', 400, 'VALIDATION_ERROR');
    }

    return this.db.transaction(() => {
      this.db
        .prepare(
          `
        INSERT INTO gst_period_locks (company_id, tax_period, is_locked, locked_by, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(company_id, tax_period) DO UPDATE SET
          is_locked = excluded.is_locked,
          locked_by = excluded.locked_by,
          updated_at = CURRENT_TIMESTAMP
      `,
        )
        .run(companyId, taxPeriod, Number(isLocked), userId);

      return { companyId, taxPeriod, isLocked: Boolean(isLocked) };
    })();
  }
}

export function createGstService(db) {
  return new GstService(db);
}
