import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { closeDatabase, reopenDatabase, cleanupWalFiles } from '../../database/connection.js';
import { AppError } from '../../shared/errors/AppError.js';

export class RestoreService {
  /**
   * @param {object} db - Active better-sqlite3 database connection
   * @param {object} backupService - Injected BackupService instance
   */
  constructor(db, backupService) {
    this.db = db;
    this.backupService = backupService;
  }

  /**
   * Performs database restoration from a specified backup file.
   * Includes emergency backups, integrity checks, and clean rollbacks.
   * 
   * @param {object} options - Options containing backupFilePath and userId
   */
  async restoreDatabase({ backupFilePath, userId } = {}) {
    if (!backupFilePath) {
      throw new AppError('Backup file path is required for restore', 400, 'RESTORE_FILE_REQUIRED');
    }

    const resolvedSourcePath = path.resolve(backupFilePath);

    // 1. Validate restore source file exists on disk
    if (!fs.existsSync(resolvedSourcePath)) {
      throw new AppError('Restore source file does not exist on disk', 404, 'RESTORE_FILE_NOT_FOUND');
    }

    const dbPath = this.db.name;
    // In-memory databases cannot be swapped via file copy
    if (!dbPath || dbPath === ':memory:') {
      throw new AppError('Database restore is not supported for in-memory databases', 400, 'RESTORE_NOT_SUPPORTED');
    }

    const resolvedDbPath = path.resolve(dbPath);
    const dbDir = path.dirname(resolvedDbPath);
    const lockFilePath = path.join(dbDir, 'restore.lock');

    // 2. Prevent concurrent restore executions
    if (fs.existsSync(lockFilePath)) {
      throw new AppError('A restore operation is already in progress.', 409, 'RESTORE_IN_PROGRESS');
    }

    // 3. Prevent restore if backup job is running (scheduler lock)
    // We check if the global/scheduler lock is active (this is usually handled at the controller or scheduler level,
    // but we can query scheduler states or locks if we want, or keep an active property lock).
    // Let's acquire the restore lock first to block scheduler from starting
    try {
      fs.writeFileSync(lockFilePath, `RESTORE_ACTIVE_PID_${process.pid}_TIME_${Date.now()}`);
    } catch (lockErr) {
      throw new AppError(`Failed to acquire restore lock: ${lockErr.message}`, 500, 'RESTORE_LOCK_FAILED');
    }

    // 4. Verify restore file integrity BEFORE modifying active database
    try {
      const tempDb = new Database(resolvedSourcePath, { readonly: true });
      try {
        const check = tempDb.pragma('integrity_check');
        if (!check || check.length === 0 || check[0].integrity_check !== 'ok') {
          throw new Error(`Integrity check failed: ${check?.[0]?.integrity_check || 'unknown error'}`);
        }
      } finally {
        tempDb.close();
      }
    } catch (integrityErr) {
      // Remove lock file before throwing
      if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
      }
      throw new AppError(`Restore source file is corrupted or invalid: ${integrityErr.message}`, 400, 'RESTORE_FILE_CORRUPTED');
    }

    // 5. Create emergency pre-restore backup of the current production database
    try {
      // The backup runs while db is still open
      await this.backupService.backupDatabase({ type: 'PRE_MIGRATION', userId });
    } catch (backupErr) {
      // Remove lock file before throwing
      if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
      }
      throw new AppError(`Emergency pre-restore backup failed: ${backupErr.message}. Restore aborted.`, 500, 'RESTORE_BACKUP_FAILED');
    }

    const rollbackPath = `${resolvedDbPath}.rollback`;

    try {
      // 6. Close active database connection safely
      if (this.db) {
        try {
          this.db.close();
        } catch (closeErr) {
          // Ignore if already closed
        }
      }
      closeDatabase();

      // Ensure WAL and SHM files are cleaned up to prevent orphan frames
      cleanupWalFiles(resolvedDbPath);

      // 7. Preserve current database until restore succeeds (rename current to rollback)
      fs.renameSync(resolvedDbPath, rollbackPath);

      // 8. Replace production database with restore database
      fs.copyFileSync(resolvedSourcePath, resolvedDbPath);

      // 9. Re-open database connection
      const newDb = reopenDatabase(resolvedDbPath);

      // 10. Verify restored database integrity
      const check = newDb.pragma('integrity_check');
      if (!check || check.length === 0 || check[0].integrity_check !== 'ok') {
        throw new Error(`Restored database integrity scan failed: ${check?.[0]?.integrity_check || 'unknown error'}`);
      }

      // Success! Delete the rollback file
      if (fs.existsSync(rollbackPath)) {
        fs.unlinkSync(rollbackPath);
      }

      // 11. Record successful restore_logs audit entry
      newDb.prepare(`
        INSERT INTO restore_logs (filename, filepath, status, error_message, created_by)
        VALUES (?, ?, 'SUCCESS', NULL, ?)
      `).run(path.basename(resolvedSourcePath), resolvedSourcePath, userId || null);

      // Update the local db reference in service
      this.db = newDb;

      // 12. Release restore lock
      if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
      }

      return { success: true };

    } catch (err) {
      console.error('Database restore failed, triggering rollback:', err.message);

      // Rollback execution
      try {
        if (this.db) {
          try {
            this.db.close();
          } catch (closeErr) {}
        }
        closeDatabase();

        if (fs.existsSync(resolvedDbPath)) {
          fs.unlinkSync(resolvedDbPath);
        }

        // Rename rollback file back to active
        if (fs.existsSync(rollbackPath)) {
          fs.renameSync(rollbackPath, resolvedDbPath);
        }

        const originalDb = reopenDatabase(resolvedDbPath);

        // Record failure in restore_logs of the original database
        originalDb.prepare(`
          INSERT INTO restore_logs (filename, filepath, status, error_message, created_by)
          VALUES (?, ?, 'FAILED', ?, ?)
        `).run(path.basename(resolvedSourcePath), resolvedSourcePath, err.message, userId || null);

        this.db = originalDb;
      } catch (rollbackErr) {
        console.error('CRITICAL: Database rollback failed:', rollbackErr.message);
      }

      // Release lock
      if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
      }

      throw new AppError(`Database restore failed. Rollback executed successfully. Error: ${err.message}`, 500, 'RESTORE_FAILED');
    }
  }
}
