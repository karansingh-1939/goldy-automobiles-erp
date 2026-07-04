import { AppError } from '../../shared/errors/AppError.js';

/**
 * Service to enforce accounting locks, active financial years, and closed financial years boundaries.
 */
export class PeriodLockService {
  /**
   * @param {object} db - Database connection instance
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Asserts that a given date is editable.
   * Throws an error if the period containing the date is locked, or if the financial year is inactive/closed.
   * 
   * @param {number} companyId - Active company ID
   * @param {string} date - Posting date in YYYY-MM-DD format
   */
  verifyPeriodLock(companyId, date) {
    if (!companyId) {
      throw new AppError('Company ID is required to verify period locks.', 400, 'PERIOD_LOCK_INVALID_COMPANY');
    }
    if (!date) {
      throw new AppError('Date is required to verify period locks.', 400, 'PERIOD_LOCK_INVALID_DATE');
    }

    // 1. Check Locked Periods
    const locked = this.db.prepare(`
      SELECT 1 FROM locked_periods 
      WHERE company_id = ? AND start_date <= ? AND end_date >= ? AND is_locked = 1 
      LIMIT 1
    `).get(companyId, date, date);

    if (locked) {
      throw new AppError('The financial period containing this date is locked.', 400, 'PERIOD_LOCKED');
    }

    // 1b. Check GST Period Locks
    const taxPeriod = date.slice(0, 7); // Format 'YYYY-MM'
    const gstLocked = this.db.prepare(`
      SELECT 1 FROM gst_period_locks 
      WHERE company_id = ? AND tax_period = ? AND is_locked = 1 
      LIMIT 1
    `).get(companyId, taxPeriod);

    if (gstLocked) {
      throw new AppError('The GST tax period containing this date is locked.', 400, 'GST_PERIOD_LOCKED');
    }

    // 2. Validate Financial Year boundary status
    const fy = this.db.prepare(`
      SELECT name, is_active, is_closed FROM financial_years 
      WHERE company_id = ? AND start_date <= ? AND end_date >= ?
      LIMIT 1
    `).get(companyId, date, date);

    if (!fy) {
      throw new AppError('No financial year covers this posting date.', 400, 'NO_FINANCIAL_YEAR');
    }

    if (fy.is_closed) {
      throw new AppError(`The financial year (${fy.name}) for this posting date is already closed.`, 400, 'FINANCIAL_YEAR_CLOSED');
    }

    if (!fy.is_active) {
      throw new AppError(`The financial year (${fy.name}) for this posting date is inactive.`, 400, 'FINANCIAL_YEAR_INACTIVE');
    }
  }
}
