/**
 * GST-compliant document numbering.
 *
 * Rule 46 of the CGST Rules requires tax invoice numbers that are consecutive,
 * unique for a financial year (April to March) and at most 16 characters.
 * Numbers look like `INV/26-27/0001`: series, financial year, sequence.
 */

export const DocumentSeries = Object.freeze({
  WORKSHOP_INVOICE: 'INV', // job card tax invoices
  COUNTER_INVOICE: 'CS', // counter sale and sales-order shipment tax invoices
});

const MAX_LENGTH = 16;

/** Financial year label for a YYYY-MM-DD business date, e.g. 2026-11-10 -> "26-27". */
export function financialYearLabel(businessDate) {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(String(businessDate || ''));
  if (!match) throw new Error(`Invalid business date for document numbering: ${businessDate}`);
  const year = Number(match[1]);
  const startYear = Number(match[2]) >= 4 ? year : year - 1;
  const short = (y) => String(y % 100).padStart(2, '0');
  return `${short(startYear)}-${short(startYear + 1)}`;
}

/**
 * Reserves the next number in a series. Call inside the transaction that
 * creates the document so a rollback also releases the number.
 */
export function nextDocumentNumber(db, series, businessDate) {
  const financialYear = financialYearLabel(businessDate);
  const { last_number: sequence } = db
    .prepare(
      `INSERT INTO document_sequences (series, financial_year, last_number)
       VALUES (?, ?, 1)
       ON CONFLICT (series, financial_year)
       DO UPDATE SET last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP
       RETURNING last_number`,
    )
    .get(series, financialYear);
  const number = `${series}/${financialYear}/${String(sequence).padStart(4, '0')}`;
  if (number.length > MAX_LENGTH) {
    throw new Error(`Document number ${number} exceeds the GST limit of ${MAX_LENGTH} characters.`);
  }
  return number;
}
