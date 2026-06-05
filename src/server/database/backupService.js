import fs from 'node:fs';
import path from 'node:path';

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
    const dbDir = path.dirname(resolvedDbPath);
    const baseDir = path.resolve(dbDir, '..');
    const backupsDir = path.join(baseDir, 'backups');

    // Ensure backups directory exists
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Format timestamp safe for Windows/UNIX filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbExt = path.extname(resolvedDbPath);
    const dbBase = path.basename(resolvedDbPath, dbExt);
    const backupFilename = `${dbBase}_backup_${label}_${timestamp}${dbExt}`;
    const targetBackupPath = path.join(backupsDir, backupFilename);

    // Sync copy the database file to backups
    fs.copyFileSync(resolvedDbPath, targetBackupPath);

    return targetBackupPath;
  }
}
