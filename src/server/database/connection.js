import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { DbSafetyService } from './dbSafetyService.js';
import { IntegrityCheckService, HealthState } from './integrityCheckService.js';
import { AppError } from '../shared/errors/AppError.js';
import { CorruptionRecoveryService } from './corruptionRecoveryService.js';

let activeDatabase = null;

function ensureRequiredDirectories(dbPath) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const baseDir = path.resolve(dbDir, '..');
  const backupsDir = path.join(baseDir, 'backups');
  const logsDir = path.join(baseDir, 'logs');

  if (!fs.existsSync(backupsDir)) {

    fs.mkdirSync(backupsDir, { recursive: true });
  }
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

export function createDatabase(filePath = env.dbFile) {
  const resolvedPath = path.resolve(filePath);
  ensureRequiredDirectories(resolvedPath);

  const db = new Database(resolvedPath);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 10000');

    // 1. Verify connection safety settings
    DbSafetyService.verifyConfiguration(db);

    // 2. Run Database Integrity Scan
    const health = IntegrityCheckService.check(db);
    if (health.status === HealthState.FAILED) {
      const errorMsg = `Database integrity check failed: ${health.errors.join('; ')}`;
      const error = new AppError(errorMsg, 500, 'DATABASE_CORRUPTION');
      error.diagnostics = health;

      // Trigger corruption recovery hook (to be resolved in Task B4)
      if (global.onDatabaseCorruption) {
        global.onDatabaseCorruption(resolvedPath, health);
      }

      throw error;
    }

    return db;
  } catch (error) {
    db.close();

    const isCorruption = error.message.includes('file is not a database') ||
                         error.message.includes('database disk image is malformed') ||
                         error.code === 'SQLITE_CORRUPT' ||
                         error.message.includes('integrity check failed');

    if (isCorruption) {
      const health = {
        status: 'FAILED',
        errors: [error.message],
        timestamp: new Date().toISOString()
      };

      // 1. Execute recovery callback or use fallback service
      let recoveryResult = null;
      if (global.onDatabaseCorruption) {
        try {
          recoveryResult = global.onDatabaseCorruption(resolvedPath, health);
        } catch (recoveryErr) {
          throw new AppError(`Database recovery hook failed: ${recoveryErr.message}`, 500, 'DATABASE_RECOVERY_FAILED');
        }
      } else {
        recoveryResult = CorruptionRecoveryService.recover(resolvedPath);
      }

      // 2. If recovery succeeded, re-attempt connecting to recovered database
      if (recoveryResult && recoveryResult.status === 'SUCCESS') {
        try {
          const recoveredDb = new Database(resolvedPath);
          recoveredDb.pragma('foreign_keys = ON');
          recoveredDb.pragma('journal_mode = WAL');
          recoveredDb.pragma('synchronous = NORMAL');
          recoveredDb.pragma('busy_timeout = 10000');

          DbSafetyService.verifyConfiguration(recoveredDb);

          const healthCheck = IntegrityCheckService.check(recoveredDb);
          if (healthCheck.status === HealthState.FAILED) {
            recoveredDb.close();
            throw new Error(`Recovered database failed integrity scan: ${healthCheck.errors.join('; ')}`);
          }

          return recoveredDb;
        } catch (retryError) {
          const appErr = new AppError(`Database connection failed after recovery: ${retryError.message}`, 500, 'DATABASE_RECOVERY_FAILED');
          appErr.diagnostics = { recoveryResult, retryError: retryError.message };
          throw appErr;
        }
      }

      // Recovery failed
      const recoveryInstructions = 
        `RECOVERY INSTRUCTIONS:\n` +
        `1. Locate the backups folder (typically sibling to your 'data' folder: %APPDATA%/Goldy_Automobiles/backups).\n` +
        `2. Identify the latest valid backup file (e.g. goldy_erp_backup_YYYYMMDD.db).\n` +
        `3. Verify it is not empty (size > 0).\n` +
        `4. Rename it to 'goldy_erp.db' and copy it to the 'data' directory.\n` +
        `5. Restart the application. If the problem persists, contact administrator/technical support.`;

      const errorMsg = `Database corruption detected: ${error.message}. Recovery failed: ${recoveryResult ? recoveryResult.errors.join('; ') : 'No recovery strategy succeeded'}.\n\n${recoveryInstructions}`;
      const corrError = new AppError(errorMsg, 500, 'DATABASE_RECOVERY_FAILED');
      corrError.diagnostics = { health, recoveryResult };
      corrError.recoveryInstructions = recoveryInstructions;
      throw corrError;
    }

    throw error;
  }
}


export function getDatabase() {
  if (!activeDatabase) {
    activeDatabase = createDatabase();
  }

  return activeDatabase;
}

export function closeDatabase() {
  if (activeDatabase) {
    activeDatabase.close();
    activeDatabase = null;
  }
}
