import { AppError } from '../../shared/errors/app-error.js';

/**
 * Service to generate unique, sequential voucher numbers for specific companies, voucher types, and dates.
 */
export class VoucherNumberService {
  /**
   * @param {object} db - Database connection instance
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Generates the next sequential unique voucher number (e.g. SAL-2026-000001).
   *
   * @param {number} companyId - Active company ID
   * @param {string} voucherType - 'Sales', 'Purchase', 'Receipt', 'Payment', etc.
   * @param {string} date - Posting date in YYYY-MM-DD format
   * @returns {string} Unique sequence string
   */
  getNextVoucherNumber(companyId, voucherType, date) {
    if (!companyId) {
      throw new AppError(
        'Company ID is required to generate sequence.',
        400,
        'SEQUENCING_INVALID_COMPANY',
      );
    }
    if (!voucherType) {
      throw new AppError(
        'Voucher type is required to generate sequence.',
        400,
        'SEQUENCING_INVALID_TYPE',
      );
    }
    if (!date) {
      throw new AppError('Date is required to generate sequence.', 400, 'SEQUENCING_INVALID_DATE');
    }

    const prefix = this.getPrefixForType(voucherType);
    const year = date.split('-')[0];
    const matchPattern = `${prefix}-${year}-%`;

    // Query utilizing compound DESC index for sub-millisecond retrieval
    const row = this.db
      .prepare(
        `
      SELECT voucher_number FROM vouchers 
      WHERE company_id = ? AND voucher_type = ? AND voucher_number LIKE ? 
      ORDER BY voucher_number DESC LIMIT 1
    `,
      )
      .get(companyId, voucherType, matchPattern);

    let nextSeq = 1;
    if (row && row.voucher_number) {
      const parts = row.voucher_number.split('-');
      const lastSeqStr = parts[parts.length - 1];
      const lastSeq = parseInt(lastSeqStr, 10);
      if (!Number.isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }

    return `${prefix}-${year}-${String(nextSeq).padStart(6, '0')}`;
  }

  /**
   * Translates voucher types to code prefixes.
   *
   * @param {string} voucherType - Type string
   * @returns {string} prefix code
   */
  getPrefixForType(voucherType) {
    switch (voucherType) {
      case 'Sales':
        return 'SAL';
      case 'Purchase':
        return 'PUR';
      case 'Receipt':
        return 'REC';
      case 'Payment':
        return 'PAY';
      case 'Contra':
        return 'CON';
      case 'Journal':
        return 'JRN';
      case 'Debit Note':
        return 'DBN';
      case 'Credit Note':
        return 'CRN';
      default:
        return 'VCH';
    }
  }
}
