import { AppError } from '../shared/errors/AppError.js';

export class DbSafetyService {
  /**
   * Asserts that database connection configurations match production safety rules
   * @param {object} db - The active better-sqlite3 database instance
   * @throws {AppError} If configuration constraints are violated
   */
  static verifyConfiguration(db) {
    try {
      // 1. Verify Foreign Keys configuration
      const foreignKeys = db.pragma('foreign_keys', { simple: true });
      if (Number(foreignKeys) !== 1) {
        throw new AppError('SQLite foreign_keys constraint check is not enabled.', 500, 'DATABASE_CONFIG_ERROR');
      }

      // 2. Verify Journal Mode (WAL) configuration
      const journalMode = db.pragma('journal_mode', { simple: true });
      if (journalMode !== 'wal') {
        throw new AppError(`SQLite journal_mode is "${journalMode}" (expected "wal").`, 500, 'DATABASE_CONFIG_ERROR');
      }

      // 3. Verify Synchronous Mode (NORMAL) configuration
      // SQLite values: 0 = OFF, 1 = NORMAL, 2 = FULL, 3 = EXTRA
      const synchronous = db.pragma('synchronous', { simple: true });
      if (Number(synchronous) !== 1) {
        throw new AppError(`SQLite synchronous mode is "${synchronous}" (expected 1 [NORMAL]).`, 500, 'DATABASE_CONFIG_ERROR');
      }

      // 4. Verify Busy Timeout configuration
      const busyTimeout = db.pragma('busy_timeout', { simple: true });
      if (Number(busyTimeout) !== 10000) {
        throw new AppError(`SQLite busy_timeout is ${busyTimeout}ms (expected 10000ms).`, 500, 'DATABASE_CONFIG_ERROR');
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(`SQLite safety validation failed: ${error.message}`, 500, 'DATABASE_CONFIG_ERROR');
    }
  }
}
