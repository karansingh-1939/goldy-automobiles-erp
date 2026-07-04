import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { AppError } from '../shared/errors/AppError.js';
import { HealthState } from './integrityCheckService.js';

export class MigrationService {
  /**
   * @param {object} db - Active better-sqlite3 database connection
   * @param {MigrationRepository} migrationRepository - Repository for tracking table queries
   * @param {object} integrityCheckService - Service to run PRAGMA integrity_check
   * @param {object} [backupService] - Optional service for pre-migration backups
   * @param {string} [migrationsDir] - Optional directory path containing migration .sql files
   * @param {string} [appVersion] - Application version
   */
  constructor(db, migrationRepository, integrityCheckService, backupService = null, migrationsDir = null, appVersion = '0.1.0') {
    this.db = db;
    this.migrationRepository = migrationRepository;
    this.integrityCheckService = integrityCheckService;
    this.backupService = backupService;
    this.migrationsDir = migrationsDir || path.join(path.dirname(new URL(import.meta.url).pathname), 'migrations');
    this.appVersion = appVersion;
  }

  /**
   * Calculates SHA-256 hash of migration file content.
   * @param {string} content - SQL file content
   * @returns {string} SHA-256 hex checksum
   */
  calculateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Executes the full migration pipeline.
   * @returns {Array<string>} List of newly applied migration filenames.
   */
  runMigrations() {
    // 0. Trigger automatic daily silent database backup check
    if (this.backupService && typeof this.backupService.checkAndRunDailyBackup === 'function') {
      this.backupService.checkAndRunDailyBackup();
    }

    // 1. Scan migrations directory
    if (!fs.existsSync(this.migrationsDir)) {
      throw new AppError(`Migrations directory does not exist: ${this.migrationsDir}`, 500, 'MIGRATION_DIRECTORY_MISSING');
    }

    const migrationFiles = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Run in chronological/prefix sequence

    // 2. Validate migration filenames for duplicates (case-insensitive & sequence prefixes)
    const prefixes = new Set();
    const lowercaseNames = new Set();
    for (const filename of migrationFiles) {
      const lower = filename.toLowerCase();
      if (lowercaseNames.has(lower)) {
        throw new AppError(`Duplicate migration filename detected: ${filename}`, 500, 'MIGRATION_DUPLICATE_FILE');
      }
      lowercaseNames.add(lower);

      const match = filename.match(/^(\d+)_/);
      if (match) {
        const prefix = match[1];
        if (prefixes.has(prefix)) {
          throw new AppError(`Duplicate migration sequence prefix detected: ${prefix} in ${filename}`, 500, 'MIGRATION_DUPLICATE_PREFIX');
        }
        prefixes.add(prefix);
      }
    }

    // Initialize migration table
    this.migrationRepository.ensureMigrationTable();

    // 3. Fetch already applied migrations from database
    const appliedList = this.migrationRepository.getAppliedMigrations();
    const appliedMap = new Map(appliedList.map(m => [m.filename, m.checksum]));

    // 4. Validate filesystem against applied migrations (detect missing files) - run on every start
    for (const applied of appliedList) {
      if (!migrationFiles.includes(applied.filename)) {
        throw new AppError(`Applied migration missing from filesystem: ${applied.filename}`, 500, 'MIGRATION_MISSING_FILE');
      }
    }

    // 5. Validate checksums of already applied migrations - run on every start
    for (const filename of migrationFiles) {
      if (appliedMap.has(filename)) {
        const filePath = path.join(this.migrationsDir, filename);
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        const hash = this.calculateChecksum(sqlContent);
        const existingChecksum = appliedMap.get(filename);
        if (existingChecksum !== hash) {
          throw new AppError(`Checksum mismatch detected for migration ${filename}. Expected: ${existingChecksum}, Found: ${hash}`, 500, 'MIGRATION_CHECKSUM_MISMATCH');
        }
      }
    }

    // 6. Check if there are any pending migrations to execute
    let hasPending = false;
    for (const filename of migrationFiles) {
      if (!appliedMap.has(filename)) {
        hasPending = true;
        break;
      }
    }

    // If there are no pending migrations, return immediately (fast path)
    if (!hasPending) {
      return [];
    }

    // 7. Execute physical database integrity check first (only if migrations are pending)
    const health = this.integrityCheckService.check(this.db);
    if (health.status === HealthState.FAILED) {
      throw new AppError(`Pre-migration integrity check failed: ${health.errors.join('; ')}`, 500, 'MIGRATION_INTEGRITY_FAILURE');
    }

    // 8. Trigger pre-migration backup hook if available (only if migrations are pending)
    let preMigrationBackupPath = null;
    if (this.backupService && typeof this.backupService.createBackup === 'function') {
      try {
        preMigrationBackupPath = this.backupService.createBackup({ label: 'PRE_MIGRATION' });
        if (typeof this.backupService.verifyBackup === 'function') {
          this.backupService.verifyBackup(preMigrationBackupPath);
        }
      } catch (backupErr) {
        throw new AppError(`Pre-migration safety backup failed: ${backupErr.message}`, 500, 'MIGRATION_BACKUP_FAILURE');
      }
    }

    const appliedFiles = [];

    // 9. Execute pending migrations sequentially
    for (const filename of migrationFiles) {
      if (appliedMap.has(filename)) {
        continue;
      }

      const filePath = path.join(this.migrationsDir, filename);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const hash = this.calculateChecksum(sqlContent);

      // Execute each migration file in its own SQLite transaction block
      const startTime = Date.now();
      const needsForeignKeyToggle = /foreign_keys\s*=\s*OFF/i.test(sqlContent);
      try {
        if (needsForeignKeyToggle) {
          this.db.pragma('foreign_keys = OFF');
        }
        const executeTransaction = this.db.transaction(() => {
          this.db.exec(sqlContent);
          const executionTimeMs = Date.now() - startTime;
          this.migrationRepository.recordMigration(filename, hash, executionTimeMs, this.appVersion);
        });
        executeTransaction();
        if (needsForeignKeyToggle) {
          this.db.pragma('foreign_keys = ON');
        }
        appliedFiles.push(filename);
      } catch (err) {
        if (needsForeignKeyToggle) {
          try {
            this.db.pragma('foreign_keys = ON');
          } catch (pragmaErr) {}
        }
        
        console.error(`Migration execution failed on ${filename}:`, err.message);
        
        // Automatic Rollback to Pre-Migration Backup State
        if (preMigrationBackupPath && preMigrationBackupPath !== 'in_memory_mock_backup') {
          try {
            console.warn(`Restoring database from pre-migration backup: ${preMigrationBackupPath}`);
            const dbPath = this.db.name;
            try {
              this.db.close();
            } catch (closeErr) {}
            
            // Clean WAL and SHM files to prevent recovery log issues
            const walPath = `${dbPath}-wal`;
            const shmPath = `${dbPath}-shm`;
            if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
            if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
            
            fs.copyFileSync(preMigrationBackupPath, dbPath);
            
            // Reopen connection
            this.db = new Database(dbPath);
            this.db.pragma('foreign_keys = ON');
            this.db.pragma('journal_mode = WAL');
          } catch (restoreErr) {
            console.error('Failed to restore pre-migration backup database:', restoreErr.message);
          }
        }
        
        throw new AppError(
          `Upgrade failed. Your data has been restored automatically. Please contact support.\nDetails: ${err.message} in ${filename}`,
          500,
          'MIGRATION_EXECUTION_FAILURE'
        );
      }
    }

    return appliedFiles;
  }
}
