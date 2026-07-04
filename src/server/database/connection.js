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

    // 2. Run Database Integrity Scan (using quick_check for fast startup)
    const health = IntegrityCheckService.check(db, true);
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

          const healthCheck = IntegrityCheckService.check(recoveredDb, true);
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

const dbDir = path.dirname(env.dbFile);
const dbExt = path.extname(env.dbFile);
const dbBase = path.basename(env.dbFile, dbExt);
export const demoDbFile = path.join(dbDir, `${dbBase}_demo${dbExt}`);
const configFilePath = path.join(dbDir, 'setup', 'app_config.json');

function readAppConfig() {
  try {
    if (fs.existsSync(configFilePath)) {
      return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to read app_config.json:', err);
  }
  return { demoMode: false };
}

function writeAppConfig(config) {
  try {
    const configDir = path.dirname(configFilePath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write app_config.json:', err);
  }
}

export function isDemoMode() {
  return readAppConfig().demoMode === true;
}

export function toggleDemoMode(enable) {
  const config = readAppConfig();
  config.demoMode = !!enable;
  writeAppConfig(config);
  
  const filePath = config.demoMode ? demoDbFile : env.dbFile;
  reopenDatabase(filePath);
  return config.demoMode;
}

export function getDatabase() {
  if (!activeDatabase) {
    const config = readAppConfig();
    const filePath = config.demoMode ? demoDbFile : env.dbFile;
    activeDatabase = createDatabase(filePath);
  }

  return activeDatabase;
}

export function closeDatabase() {
  if (activeDatabase) {
    activeDatabase.close();
    activeDatabase = null;
  }
}

export function reopenDatabase(filePath = null) {
  closeDatabase();
  let targetPath = filePath;
  if (!targetPath) {
    const config = readAppConfig();
    targetPath = config.demoMode ? demoDbFile : env.dbFile;
  }
  activeDatabase = createDatabase(targetPath);
  return activeDatabase;
}

export function cleanupWalFiles(dbPath) {
  const resolvedPath = path.resolve(dbPath);
  const walPath = `${resolvedPath}-wal`;
  const shmPath = `${resolvedPath}-shm`;

  if (fs.existsSync(walPath)) {
    try {
      fs.unlinkSync(walPath);
    } catch (err) {
      console.warn(`Failed to clean up WAL file: ${err.message}`);
    }
  }

  if (fs.existsSync(shmPath)) {
    try {
      fs.unlinkSync(shmPath);
    } catch (err) {
      console.warn(`Failed to clean up SHM file: ${err.message}`);
    }
  }
}
