import { AppError } from '../../shared/errors/app-error.js';

/**
 * Service to resolve database ledger IDs and records from permanent immutable system keys.
 * Caches resolved keys in memory to minimize SQL query overhead during batch postings.
 */
export class LedgerResolverService {
  /**
   * @param {object} db - Database connection instance
   */
  constructor(db) {
    this.db = db;
    this.cache = new Map(); // Key format: "companyId:systemKey" -> ledgerObject
  }

  /**
   * Resolves the ledger ID for a given company and system key.
   * Uses cached results or queries and caches the lookup on cache miss (lazy loading).
   *
   * @param {number} companyId - Active company ID
   * @param {string} systemKey - Permanent immutable ledger identifier
   * @returns {number} Ledger ID
   */
  getLedgerId(companyId, systemKey) {
    const ledger = this.getSystemLedger(companyId, systemKey);
    return ledger.id;
  }

  /**
   * Resolves the entire ledger row for a given company and system key.
   *
   * @param {number} companyId - Active company ID
   * @param {string} systemKey - Permanent immutable ledger identifier
   * @returns {object} Database ledger row
   */
  getSystemLedger(companyId, systemKey) {
    if (!companyId) {
      throw new AppError(
        'Company ID is required to resolve ledgers.',
        400,
        'RESOLVER_INVALID_COMPANY',
      );
    }
    if (!systemKey) {
      throw new AppError('Ledger system key is required.', 400, 'RESOLVER_INVALID_KEY');
    }

    const cacheKey = `${companyId}:${systemKey}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const row = this.db
      .prepare('SELECT * FROM ledgers WHERE company_id = ? AND system_key = ?')
      .get(companyId, systemKey);
    if (!row) {
      throw new AppError(
        `System ledger key '${systemKey}' not found for company ${companyId}.`,
        404,
        'LEDGER_KEY_NOT_FOUND',
      );
    }

    this.cache.set(cacheKey, row);
    return row;
  }

  /**
   * Pre-populates the cache with all system ledgers for a company to prevent query latency.
   *
   * @param {number} companyId - Company ID to warm cache for
   */
  warmCache(companyId) {
    if (!companyId) {
      throw new AppError('Company ID is required to warm cache.', 400, 'RESOLVER_INVALID_COMPANY');
    }

    const rows = this.db
      .prepare('SELECT * FROM ledgers WHERE company_id = ? AND system_key IS NOT NULL')
      .all(companyId);
    for (const row of rows) {
      this.cache.set(`${companyId}:${row.system_key}`, row);
    }
  }

  /**
   * Clears the cache for a specific company or clears the entire cache.
   *
   * @param {number} [companyId] - Optional company ID. If omitted, clears all cache entries.
   */
  clearCache(companyId) {
    if (companyId) {
      const prefix = `${companyId}:`;
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}
