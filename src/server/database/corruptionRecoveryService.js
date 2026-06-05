import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const RecoveryStatus = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  NO_BACKUP: 'NO_BACKUP'
};

export class RecoveryResult {
  /**
   * RecoveryResult DTO contract
   * @param {string} status - SUCCESS | FAILED | NO_BACKUP
   * @param {string|null} corruptedFilename - Isolate database filename on disk
   * @param {string|null} backupSource - Name of backup file used for recovery
   * @param {Array<string>} errors - Detailed logs of failures during recovery attempts
   */
  constructor(status, corruptedFilename = null, backupSource = null, errors = []) {
    this.status = status;
    this.corruptedFilename = corruptedFilename;
    this.backupSource = backupSource;
    this.errors = errors;
    this.timestamp = new Date().toISOString();
  }
}

export class CorruptionRecoveryService {
  /**
   * Automates the recovery of a corrupted database
   * @param {string} dbPath - File path to the active database
   * @param {string} [backupsDir] - Optional custom path to backups folder
   * @returns {RecoveryResult} Outcome of recovery sequence
   */
  static recover(dbPath, backupsDir = null) {
    const errors = [];
    let corruptedFilename = null;
    let backupSource = null;

    try {
      const resolvedDbPath = path.resolve(dbPath);
      const dbDir = path.dirname(resolvedDbPath);

      // Sibling folder resolution for backups directory
      const resolvedBackupsDir = backupsDir
        ? path.resolve(backupsDir)
        : path.join(path.dirname(dbDir), 'backups');

      // 1. Verify backups folder exists
      if (!fs.existsSync(resolvedBackupsDir)) {
        errors.push(`Backups directory does not exist: ${resolvedBackupsDir}`);
        return new RecoveryResult(RecoveryStatus.NO_BACKUP, null, null, errors);
      }

      // 2. Isolate (rename) corrupted database file if it exists
      if (fs.existsSync(resolvedDbPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dbExt = path.extname(resolvedDbPath);
        const dbBase = path.basename(resolvedDbPath, dbExt);
        corruptedFilename = `${dbBase}_corrupted_${timestamp}${dbExt}`;
        const targetCorruptPath = path.join(dbDir, corruptedFilename);

        fs.renameSync(resolvedDbPath, targetCorruptPath);

        // Also check and rename WAL temporary files if they exist to prevent cleanups conflicts
        const walPath = `${resolvedDbPath}-wal`;
        const shmPath = `${resolvedDbPath}-shm`;
        if (fs.existsSync(walPath)) {
          fs.renameSync(walPath, `${targetCorruptPath}-wal`);
        }
        if (fs.existsSync(shmPath)) {
          fs.renameSync(shmPath, `${targetCorruptPath}-shm`);
        }
      }

      // 3. Scan backups folder for available backup databases
      const files = fs.readdirSync(resolvedBackupsDir)
        .filter(f => f.endsWith('.db') || f.endsWith('.sqlite'))
        .map(f => {
          const filepath = path.join(resolvedBackupsDir, f);
          return { filepath, stat: fs.statSync(filepath) };
        })
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs); // Sort newest first

      if (files.length === 0) {
        errors.push('No backup database files found in the backups directory.');
        return new RecoveryResult(RecoveryStatus.NO_BACKUP, corruptedFilename, null, errors);
      }

      // 4. Validate backups descending (newest first)
      let selectedBackupPath = null;
      for (const file of files) {
        const backupPath = file.filepath;

        try {
          // Check file size is not empty
          if (file.stat.size === 0) {
            throw new Error(`Backup file is empty: ${path.basename(backupPath)}`);
          }

          // Verify SQLite Header signature (first 16 bytes)
          const fd = fs.openSync(backupPath, 'r');
          const buffer = Buffer.alloc(16);
          fs.readSync(fd, buffer, 0, 16, 0);
          fs.closeSync(fd);

          if (buffer.toString('utf8', 0, 15) !== 'SQLite format 3') {
            throw new Error(`Invalid SQLite header signature in file: ${path.basename(backupPath)}`);
          }

          // Verify integrity check (open temp connection in readonly mode)
          const tempDb = new Database(backupPath, { readonly: true });
          try {
            const rows = tempDb.pragma('integrity_check');
            if (rows.length !== 1 || rows[0].integrity_check !== 'ok') {
              const checkErrors = rows.map(r => r.integrity_check).join('; ');
              throw new Error(`Integrity check failed: ${checkErrors}`);
            }
          } finally {
            tempDb.close();
          }

          // Selected backup has passed all checks
          selectedBackupPath = backupPath;
          break;
        } catch (validationError) {
          errors.push(`Validation failed for backup "${path.basename(backupPath)}": ${validationError.message}`);
        }
      }

      // 5. Restore backup if found
      if (!selectedBackupPath) {
        errors.push('All available backups failed verification checks.');
        return new RecoveryResult(RecoveryStatus.FAILED, corruptedFilename, null, errors);
      }

      backupSource = path.basename(selectedBackupPath);
      fs.copyFileSync(selectedBackupPath, resolvedDbPath);

      return new RecoveryResult(RecoveryStatus.SUCCESS, corruptedFilename, backupSource, errors);
    } catch (err) {
      errors.push(`Critical error during recovery operation: ${err.message}`);
      return new RecoveryResult(RecoveryStatus.FAILED, corruptedFilename, backupSource, errors);
    }
  }
}
