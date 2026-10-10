import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

export function getBackupDirectory(dbPath) {
  const resolved = path.resolve(dbPath);
  const identity = createHash('sha256')
    .update(process.platform === 'win32' ? resolved.toLowerCase() : resolved)
    .digest('hex')
    .slice(0, 16);
  return path.join(
    path.dirname(resolved),
    '..',
    'backups',
    `${path.basename(resolved).replace(/[^a-zA-Z0-9_.-]/g, '_')}-${identity}`,
  );
}

export function isManagedBackup(filePath, directory) {
  const resolved = path.resolve(filePath);
  if (path.dirname(resolved) !== path.resolve(directory)) return false;
  if (!/\.db$|\.sqlite$/i.test(resolved)) return false;
  if (!fs.existsSync(directory)) return false;
  if (fs.realpathSync(path.dirname(resolved)) !== fs.realpathSync(directory)) return false;
  return !fs.existsSync(resolved) || !fs.lstatSync(resolved).isSymbolicLink();
}

export class BackupService {
  /**
   * @param {object} db - Active better-sqlite3 database connection
   */
  constructor(db) {
    if (!db) {
      throw new Error('Database connection is required for BackupService');
    }
    this.db = db;
  }

  /**
   * Creates a backup copy of the database file in the backups folder.
   * Handles in-memory databases gracefully.
   * @param {object} options - Options containing label
   * @returns {string} The path to the created backup file
   */
  createBackup({ label = 'BACKUP' } = {}) {
    const dbPath = this.db.name;

    // In-memory databases cannot be physically backed up via copying
    if (!dbPath || dbPath === ':memory:') {
      return 'in_memory_mock_backup';
    }

    const resolvedDbPath = path.resolve(dbPath);
    const backupsDir = getBackupDirectory(resolvedDbPath);

    // Ensure backups directory exists
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Format timestamp as YYYY-MM-DD_HH-mm-ss
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    const backupFilename = `goldy_backup_${timestamp}_${label.replace(/[^a-zA-Z0-9_-]/g, '_')}_${randomUUID()}.db`;
    const targetBackupPath = path.join(backupsDir, backupFilename);

    // SQLite creates a consistent snapshot including committed pages still in the WAL.
    this.db.prepare('VACUUM INTO ?').run(targetBackupPath);

    return targetBackupPath;
  }

  /**
   * Verifies the backup database file integrity.
   * @param {string} filePath - Path to backup file
   * @returns {boolean} True if valid
   */
  verifyBackup(filePath) {
    if (filePath === 'in_memory_mock_backup') {
      return true;
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup file does not exist: ${filePath}`);
    }

    const size = fs.statSync(filePath).size;
    if (size === 0) {
      throw new Error(`Backup file is empty: ${filePath}`);
    }

    let tempDb;
    try {
      // Attempt to open and verify the SQLite database copy
      tempDb = new Database(filePath, { readonly: true });
      const check = tempDb.pragma('integrity_check');
      if (!check || check.length === 0 || check[0].integrity_check !== 'ok') {
        throw new Error(`Integrity check failed: ${check?.[0]?.integrity_check || 'corrupted'}`);
      }
      return true;
    } catch (err) {
      throw new Error(`Backup SQLite integrity verification failed: ${err.message}`);
    } finally {
      if (tempDb) {
        tempDb.close();
      }
    }
  }

  /**
   * Enforces backup retention policy by keeping only the latest 30 backups.
   */
  enforceRetentionPolicy() {
    const dbPath = this.db.name;
    if (!dbPath || dbPath === ':memory:') {
      return;
    }

    const resolvedDbPath = path.resolve(dbPath);
    const backupsDir = getBackupDirectory(resolvedDbPath);

    if (!fs.existsSync(backupsDir)) {
      return;
    }

    // List all goldy backup files
    const files = fs
      .readdirSync(backupsDir)
      .filter(
        (f) =>
          f.startsWith('goldy_backup_') && isManagedBackup(path.join(backupsDir, f), backupsDir),
      )
      .sort(); // Alphabetic sort is chronological due to YYYY-MM-DD_HH-mm-ss format

    const retentionLimit = 30;
    if (files.length <= retentionLimit) {
      return;
    }

    // Delete oldest backups
    const toDeleteCount = files.length - retentionLimit;
    for (let i = 0; i < toDeleteCount; i++) {
      const filePath = path.join(backupsDir, files[i]);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.warn(`Failed to clean up old backup file ${filePath}:`, err.message);
      }
    }
  }

  /**
   * Checks if a silent backup was already performed today. If not, performs one.
   */
  checkAndRunDailyBackup() {
    const dbPath = this.db.name;
    if (!dbPath || dbPath === ':memory:') {
      return;
    }

    const resolvedDbPath = path.resolve(dbPath);
    const backupsDir = getBackupDirectory(resolvedDbPath);

    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayPrefix = `goldy_backup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Scan for any backup made today
    const files = fs.readdirSync(backupsDir);
    const hasDailyBackup = files.some((f) => {
      const file = path.join(backupsDir, f);
      if (!f.startsWith(todayPrefix) || !isManagedBackup(file, backupsDir)) return false;
      try {
        return this.verifyBackup(file);
      } catch {
        return false;
      }
    });

    if (!hasDailyBackup) {
      try {
        const backupPath = this.createBackup({ label: 'DAILY' });
        this.verifyBackup(backupPath);
        this.enforceRetentionPolicy();
        console.log(`Automatic daily silent backup created successfully at: ${backupPath}`);
      } catch (err) {
        console.error('Automatic daily silent backup failed:', err.message);
      }
    }
  }
}
