import { AppError } from '../shared/errors/AppError.js';

export const HealthState = {
  HEALTHY: 'HEALTHY',
  WARNING: 'WARNING',
  FAILED: 'FAILED'
};

export class HealthStatus {
  /**
   * HealthStatus outcome payload
   * @param {string} status - HEALTHY | WARNING | FAILED
   * @param {Array<string>} errors - Array of corruption anomalies
   * @param {string} timestamp - ISO timestamp of validation run
   */
  constructor(status, errors = [], timestamp = new Date().toISOString()) {
    this.status = status;
    this.errors = errors;
    this.timestamp = timestamp;
  }
}

export class IntegrityCheckService {
  /**
   * Performs a physical SQLite database check
   * @param {object} db - Active better-sqlite3 database connection
   * @param {boolean} [quick=false] - Whether to perform a fast quick_check
   * @returns {HealthStatus} The result status log
   */
  static check(db, quick = false) {
    try {
      const pragmaQuery = quick ? 'PRAGMA quick_check' : 'PRAGMA integrity_check';
      const rows = db.prepare(pragmaQuery).all();

      // If check returns a single row containing "ok", the file structure is verified healthy
      const resultKey = quick ? 'quick_check' : 'integrity_check';
      if (rows.length === 1 && rows[0][resultKey] === 'ok') {
        return new HealthStatus(HealthState.HEALTHY);
      }

      // Extract details of any structural anomalies or corrupt pages
      const errors = rows.map(r => r[resultKey] || r.integrity_check || JSON.stringify(r));
      return new HealthStatus(HealthState.FAILED, errors);
    } catch (error) {
      return new HealthStatus(HealthState.FAILED, [error.message]);
    }
  }
}
