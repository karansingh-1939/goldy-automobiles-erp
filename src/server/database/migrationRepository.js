export class MigrationRepository {
  /**
   * @param {object} db - Active better-sqlite3 database connection
   */
  constructor(db) {
    if (!db) {
      throw new Error('Database connection is required for MigrationRepository');
    }
    this.db = db;
  }

  /**
   * Initializes the schema_migrations tracking table if missing.
   * Leverages migrations schema fields: id, filename, checksum, applied_at, execution_time_ms, application_version.
   */
  ensureMigrationTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER NOT NULL,
        application_version TEXT NOT NULL
      );
    `);
  }

  /**
   * Retrieves all applied migration records from the tracking table.
   * @returns {Array<object>} List of applied migrations sorted by filename.
   */
  getAppliedMigrations() {
    return this.db.prepare(`
      SELECT filename, checksum, applied_at, execution_time_ms, application_version
      FROM schema_migrations
      ORDER BY filename ASC
    `).all();
  }

  /**
   * Inserts a new migration record into the database.
   * @param {string} filename - Filename of the migration script
   * @param {string} checksum - SHA-256 hash of migration contents
   * @param {number} executionTimeMs - Duration in milliseconds of migration run
   * @param {string} appVersion - Current version of the application
   */
  recordMigration(filename, checksum, executionTimeMs, appVersion) {
    const stmt = this.db.prepare(`
      INSERT INTO schema_migrations (
        filename, checksum, execution_time_ms, application_version
      ) VALUES (?, ?, ?, ?)
    `);
    return stmt.run(filename, checksum, executionTimeMs, appVersion);
  }
}
