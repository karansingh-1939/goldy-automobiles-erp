import { AppError } from '../../shared/errors/app-error.js';
import { GstService } from './gst.service.js';
import { stateCodeFor } from '../settings/company-settings.js';

/**
 * GSTR-1 files for the CA, in the column layout of the GST offline tool
 * sheets (b2b, b2cs, cdnr/cdnur, hsn, docs). Each section downloads as CSV,
 * which opens directly in Excel.
 */

// Byte-order mark so Excel opens the CSV as UTF-8 (₹ and Hindi names).
const BOM = String.fromCharCode(0xfeff);
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const pos = (state, fallback) => {
  const name = state || fallback || '';
  const code = stateCodeFor(name);
  return code ? `${code}-${name}` : name;
};

function groupBy(rows, keyFn, init, add) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, init(row));
    add(map.get(key), row);
  }
  return [...map.values()];
}

export const SECTIONS = {
  b2b: {
    title: 'B2B invoices (customers with GSTIN)',
    columns: [
      'GSTIN of Recipient',
      'Receiver Name',
      'Invoice Number',
      'Invoice date',
      'Invoice Value',
      'Place Of Supply',
      'Reverse Charge',
      'Invoice Type',
      'Rate',
      'Taxable Value',
      'Integrated Tax',
      'Central Tax',
      'State/UT Tax',
      'Cess Amount',
    ],
  },
  b2cs: {
    title: 'B2C small (customers without GSTIN), by state and rate',
    columns: [
      'Type',
      'Place Of Supply',
      'Rate',
      'Taxable Value',
      'Integrated Tax',
      'Central Tax',
      'State/UT Tax',
      'Cess Amount',
    ],
  },
  cdn: {
    title: 'Credit notes issued (returns)',
    columns: [
      'Registered',
      'GSTIN of Recipient',
      'Receiver Name',
      'Note Number',
      'Note Date',
      'Original Invoice Number',
      'Note Value',
      'Place Of Supply',
      'Rate',
      'Taxable Value',
      'Integrated Tax',
      'Central Tax',
      'State/UT Tax',
    ],
  },
  hsn: {
    title: 'HSN/SAC summary (split B2B and B2C)',
    columns: [
      'Section',
      'HSN',
      'Description',
      'UQC',
      'Total Quantity',
      'Rate',
      'Taxable Value',
      'Integrated Tax',
      'Central Tax',
      'State/UT Tax',
      'Total Value',
    ],
  },
  docs: {
    title: 'Documents issued',
    columns: [
      'Nature of Document',
      'Series',
      'Sr. No. From',
      'Sr. No. To',
      'Total Number',
      'Cancelled',
      'Net Issued',
    ],
  },
};

export class Gstr1ExportService {
  constructor(db) {
    this.db = db;
    this.gst = new GstService(db);
  }

  build(query = {}) {
    const { filters, data } = this.gst.gstr1(query);
    if (!filters.dateFrom || !filters.dateTo)
      throw new AppError('Choose the return period (from and to dates).', 400, 'VALIDATION_ERROR');
    const companyState =
      this.db.prepare('SELECT state FROM companies WHERE id = 1').get()?.state || 'Haryana';
    const invoices = data.filter((row) => row.documentType === 'INVOICE');
    const notes = data.filter((row) => row.documentType === 'CREDIT_NOTE');
    const registered = (row) => Boolean(String(row.customerGstin || '').trim());

    const b2b = groupBy(
      invoices.filter(registered),
      (row) => `${row.invoiceNumber}|${row.gstRate}`,
      (row) => ({
        'GSTIN of Recipient': row.customerGstin,
        'Receiver Name': row.customerName,
        'Invoice Number': row.invoiceNumber,
        'Invoice date': row.invoiceDate,
        'Invoice Value': 0,
        'Place Of Supply': pos(row.placeOfSupply, companyState),
        'Reverse Charge': 'N',
        'Invoice Type': 'Regular B2B',
        Rate: row.gstRate,
        'Taxable Value': 0,
        'Integrated Tax': 0,
        'Central Tax': 0,
        'State/UT Tax': 0,
        'Cess Amount': 0,
      }),
      (acc, row) => {
        acc['Taxable Value'] = round2(acc['Taxable Value'] + row.taxableValue);
        acc['Integrated Tax'] = round2(acc['Integrated Tax'] + row.igstAmount);
        acc['Central Tax'] = round2(acc['Central Tax'] + row.cgstAmount);
        acc['State/UT Tax'] = round2(acc['State/UT Tax'] + row.sgstAmount);
      },
    );
    const invoiceValue = new Map();
    for (const row of invoices)
      invoiceValue.set(
        row.invoiceNumber,
        round2((invoiceValue.get(row.invoiceNumber) || 0) + row.lineTotal),
      );
    for (const row of b2b) row['Invoice Value'] = invoiceValue.get(row['Invoice Number']);

    const b2cs = groupBy(
      invoices.filter((row) => !registered(row)),
      (row) => `${row.placeOfSupply || companyState}|${row.gstRate}`,
      (row) => ({
        Type: 'OE',
        'Place Of Supply': pos(row.placeOfSupply, companyState),
        Rate: row.gstRate,
        'Taxable Value': 0,
        'Integrated Tax': 0,
        'Central Tax': 0,
        'State/UT Tax': 0,
        'Cess Amount': 0,
      }),
      (acc, row) => {
        acc['Taxable Value'] = round2(acc['Taxable Value'] + row.taxableValue);
        acc['Integrated Tax'] = round2(acc['Integrated Tax'] + row.igstAmount);
        acc['Central Tax'] = round2(acc['Central Tax'] + row.cgstAmount);
        acc['State/UT Tax'] = round2(acc['State/UT Tax'] + row.sgstAmount);
      },
    );

    const cdn = groupBy(
      notes,
      (row) => `${row.invoiceNumber}|${row.gstRate}`,
      (row) => ({
        Registered: registered(row) ? 'Yes (CDNR)' : 'No (CDNUR)',
        'GSTIN of Recipient': row.customerGstin || '',
        'Receiver Name': row.customerName,
        'Note Number': row.invoiceNumber,
        'Note Date': row.invoiceDate,
        'Original Invoice Number': row.originalInvoiceNumber || '',
        'Note Value': 0,
        'Place Of Supply': pos(row.placeOfSupply, companyState),
        Rate: row.gstRate,
        'Taxable Value': 0,
        'Integrated Tax': 0,
        'Central Tax': 0,
        'State/UT Tax': 0,
      }),
      (acc, row) => {
        acc['Note Value'] = round2(acc['Note Value'] + Math.abs(row.lineTotal));
        acc['Taxable Value'] = round2(acc['Taxable Value'] + Math.abs(row.taxableValue));
        acc['Integrated Tax'] = round2(acc['Integrated Tax'] + Math.abs(row.igstAmount));
        acc['Central Tax'] = round2(acc['Central Tax'] + Math.abs(row.cgstAmount));
        acc['State/UT Tax'] = round2(acc['State/UT Tax'] + Math.abs(row.sgstAmount));
      },
    );

    // Credit notes reduce the HSN totals of the section they belong to.
    const hsn = groupBy(
      data,
      (row) => `${registered(row) ? 'B2B' : 'B2C'}|${row.hsnSac}|${row.gstRate}`,
      (row) => ({
        Section: registered(row) ? 'B2B' : 'B2C',
        HSN: row.hsnSac,
        Description: row.hsnSac === '9987' ? 'Repair and maintenance services' : row.description,
        UQC: row.hsnSac === '9987' ? 'NA' : 'NOS-NUMBERS',
        'Total Quantity': 0,
        Rate: row.gstRate,
        'Taxable Value': 0,
        'Integrated Tax': 0,
        'Central Tax': 0,
        'State/UT Tax': 0,
        'Total Value': 0,
      }),
      (acc, row) => {
        acc['Total Quantity'] = round2(acc['Total Quantity'] + row.quantity);
        acc['Taxable Value'] = round2(acc['Taxable Value'] + row.taxableValue);
        acc['Integrated Tax'] = round2(acc['Integrated Tax'] + row.igstAmount);
        acc['Central Tax'] = round2(acc['Central Tax'] + row.cgstAmount);
        acc['State/UT Tax'] = round2(acc['State/UT Tax'] + row.sgstAmount);
        acc['Total Value'] = round2(acc['Total Value'] + row.lineTotal);
      },
    );

    return { filters, b2b, b2cs, cdn, hsn, docs: this.documentsIssued(filters) };
  }

  /** Table 13: invoice series issued in the period, including cancelled ones. */
  documentsIssued({ dateFrom, dateTo }) {
    const series = (table, nature) =>
      this.db
        .prepare(
          `SELECT invoice_number, status FROM ${table}
           WHERE invoice_date BETWEEN ? AND ? AND invoice_number LIKE '%/%/%' ORDER BY invoice_number`,
        )
        .all(dateFrom, dateTo)
        .reduce((groups, row) => {
          const prefix = row.invoice_number.slice(0, row.invoice_number.lastIndexOf('/') + 1);
          (groups[prefix] ||= { nature, rows: [] }).rows.push(row);
          return groups;
        }, {});
    const groups = {
      ...series('invoices', 'Invoices for outward supply'),
      ...series('direct_invoices', 'Invoices for outward supply'),
    };
    return Object.entries(groups).map(([prefix, { nature, rows }]) => {
      const cancelled = rows.filter((row) => row.status === 'CANCELLED').length;
      return {
        'Nature of Document': nature,
        Series: prefix,
        'Sr. No. From': rows[0].invoice_number,
        'Sr. No. To': rows[rows.length - 1].invoice_number,
        'Total Number': rows.length,
        Cancelled: cancelled,
        'Net Issued': rows.length - cancelled,
      };
    });
  }

  csv(section, query) {
    const spec = SECTIONS[section];
    if (!spec) throw new AppError('Unknown GSTR-1 section.', 400, 'VALIDATION_ERROR');
    const rows = this.build(query)[section];
    const cell = (value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const lines = [spec.columns.map(cell).join(',')];
    for (const row of rows) lines.push(spec.columns.map((column) => cell(row[column])).join(','));
    return `${BOM}${lines.join('\r\n')}\r\n`;
  }
}
