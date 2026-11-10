import { AppError } from '../../shared/errors/app-error.js';
import { localDate } from '../../shared/utils/local-date.js';

// Indian financial years run 1 April to 31 March.
function financialYearBounds(date) {
  const year = Number(date.slice(0, 4));
  const startYear = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return {
    name: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

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
      throw new AppError(
        'Company ID is required to verify period locks.',
        400,
        'PERIOD_LOCK_INVALID_COMPANY',
      );
    }
    if (!date) {
      throw new AppError(
        'Date is required to verify period locks.',
        400,
        'PERIOD_LOCK_INVALID_DATE',
      );
    }

    // 1. Check Locked Periods
    const locked = this.db
      .prepare(
        `
      SELECT 1 FROM locked_periods 
      WHERE company_id = ? AND start_date <= ? AND end_date >= ? AND is_locked = 1 
      LIMIT 1
    `,
      )
      .get(companyId, date, date);

    if (locked) {
      throw new AppError(
        'The financial period containing this date is locked.',
        400,
        'PERIOD_LOCKED',
      );
    }

    // 1b. Check GST Period Locks
    const taxPeriod = date.slice(0, 7); // Format 'YYYY-MM'
    const gstLocked = this.db
      .prepare(
        `
      SELECT 1 FROM gst_period_locks 
      WHERE company_id = ? AND tax_period = ? AND is_locked = 1 
      LIMIT 1
    `,
      )
      .get(companyId, taxPeriod);

    if (gstLocked) {
      throw new AppError(
        'The GST tax period containing this date is locked.',
        400,
        'GST_PERIOD_LOCKED',
      );
    }

    // 2. Validate Financial Year boundary status
    const findYear = () =>
      this.db
        .prepare(
          `
      SELECT name, is_active, is_closed FROM financial_years 
      WHERE company_id = ? AND start_date <= ? AND end_date >= ?
      LIMIT 1
    `,
        )
        .get(companyId, date, date);
    let fy = findYear();
    if (!fy && this.ensureFinancialYear(companyId, date)) fy = findYear();

    if (!fy) {
      throw new AppError('No financial year covers this posting date.', 400, 'NO_FINANCIAL_YEAR');
    }

    if (fy.is_closed) {
      throw new AppError(
        `The financial year (${fy.name}) for this posting date is already closed.`,
        400,
        'FINANCIAL_YEAR_CLOSED',
      );
    }

    if (!fy.is_active) {
      throw new AppError(
        `The financial year (${fy.name}) for this posting date is inactive.`,
        400,
        'FINANCIAL_YEAR_INACTIVE',
      );
    }
  }

  /**
   * Rolls financial years forward so billing continues past 31 March without
   * manual setup: creates every missing April-March year after the latest
   * existing one, up to the year containing `date`. Years before the first
   * configured year and future years are never created, so back-dated or
   * mistyped dates stay rejected. Returns true when a year was created.
   */
  ensureFinancialYear(companyId, date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const target = financialYearBounds(date);
    if (target.start > financialYearBounds(localDate()).start) return false;
    const latest = this.db
      .prepare('SELECT MAX(end_date) AS end_date FROM financial_years WHERE company_id = ?')
      .get(companyId)?.end_date;
    if (!latest || target.start <= latest) return false;

    const insert = this.db.prepare(
      `INSERT INTO financial_years (company_id, name, start_date, end_date, is_active, is_closed)
       VALUES (?, ?, ?, ?, 1, 0)`,
    );
    let next = financialYearBounds(
      `${Number(latest.slice(0, 4)) + (latest.slice(5) >= '04' ? 1 : 0)}-04-01`,
    );
    if (next.start <= latest)
      next = financialYearBounds(`${Number(next.start.slice(0, 4)) + 1}-04-01`);
    while (next.start <= target.start) {
      insert.run(companyId, next.name, next.start, next.end);
      next = financialYearBounds(`${Number(next.start.slice(0, 4)) + 1}-04-01`);
    }
    return true;
  }
}
