import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  closeDatabase,
  reopenDatabase,
  cleanupWalFiles,
  getDatabase,
} from '../../database/connection.js';
import { runMigrations } from '../../database/migration-runner.js';
import { AppError } from '../../shared/errors/app-error.js';

function verifySnapshot(db) {
  const check = db.pragma('integrity_check');
  if (check.length !== 1 || check[0].integrity_check !== 'ok')
    throw new Error('Database integrity scan failed.');
  if (db.pragma('foreign_key_check').length)
    throw new Error('Database foreign-key validation failed.');
}

function auditActor(db, userId) {
  return userId && db.prepare('SELECT id FROM users WHERE id = ?').get(userId) ? userId : null;
}

function verifySchema(db) {
  const expected = new Database(':memory:');
  try {
    runMigrations(expected);
    const tables = expected
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all();
    for (const { name } of tables) {
      const actual = new Map(
        db
          .prepare(`PRAGMA table_info("${name}")`)
          .all()
          .map((column) => [column.name, column]),
      );
      for (const column of expected.prepare(`PRAGMA table_info("${name}")`).all()) {
        const found = actual.get(column.name);
        if (
          !found ||
          found.type !== column.type ||
          found.pk !== column.pk ||
          found.notnull !== column.notnull
        ) {
          throw new Error(`Incompatible ERP schema: ${name}.${column.name}`);
        }
      }
    }
  } finally {
    expected.close();
  }
}

export class RestoreService {
  constructor(db, backupService) {
    this.db = db;
    this.backupService = backupService;
  }

  async restoreDatabase({ backupFilePath, userId } = {}) {
    if (typeof backupFilePath !== 'string' || !backupFilePath.trim()) {
      throw new AppError('Backup file path is required for restore', 400, 'RESTORE_FILE_REQUIRED');
    }
    const sourcePath = path.resolve(backupFilePath);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new AppError(
        'Restore source file does not exist on disk',
        404,
        'RESTORE_FILE_NOT_FOUND',
      );
    }
    const dbPath = this.db.name;
    if (!dbPath || dbPath === ':memory:')
      throw new AppError('Restore requires a file database.', 400, 'RESTORE_NOT_SUPPORTED');
    const activePath = path.resolve(dbPath);
    const lockPath = path.join(path.dirname(activePath), 'restore.lock');
    if (fs.existsSync(lockPath))
      throw new AppError('A restore is already in progress.', 409, 'RESTORE_IN_PROGRESS');
    if (fs.realpathSync(sourcePath) === fs.realpathSync(activePath)) {
      throw new AppError(
        'Restore source cannot be the active database.',
        400,
        'RESTORE_SOURCE_ACTIVE',
      );
    }
    if (fs.existsSync(`${dbPath}.backup.lock`))
      throw new AppError('A backup is already in progress.', 409, 'BACKUP_IN_PROGRESS');
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    } catch (error) {
      throw new AppError(
        'A restore is already in progress or its lock cannot be acquired.',
        409,
        'RESTORE_IN_PROGRESS',
      );
    }

    const stagedPath = `${activePath}.${randomUUID()}.restore`;
    const rollbackPath = `${activePath}.${randomUUID()}.rollback`;
    const initialConnection = this.db;
    const isGlobal = getDatabase().name === dbPath;
    const followsGlobal = isGlobal && this.db !== getDatabase();
    let movedOriginal = false;
    let closedOriginal = false;
    let source;
    let staged;
    let restored;
    try {
      try {
        source = new Database(sourcePath, { readonly: true, fileMustExist: true });
        verifySnapshot(source);
      } catch (error) {
        throw new AppError(
          `Restore source is corrupted or invalid: ${error.message}`,
          400,
          'RESTORE_FILE_CORRUPTED',
        );
      }
      const required = [
        'schema_migrations',
        'users',
        'roles',
        'customers',
        'vehicles',
        'inventory_items',
        'job_cards',
        'invoices',
      ];
      const tables = new Set(
        source
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => row.name),
      );
      if (required.some((table) => !tables.has(table))) {
        throw new AppError(
          'Restore source is not a supported ERP database.',
          400,
          'RESTORE_SCHEMA_INVALID',
        );
      }
      const sourceMode = tables.has('system_settings')
        ? source.prepare("SELECT value FROM system_settings WHERE key = 'database.mode'").get()
            ?.value
        : undefined;
      const activeMode = this.db
        .prepare("SELECT value FROM system_settings WHERE key = 'database.mode'")
        .get()?.value;
      if ((sourceMode || 'production') !== (activeMode || 'production')) {
        throw new AppError(
          'Production and demo backups cannot be restored into each other.',
          400,
          'RESTORE_MODE_MISMATCH',
        );
      }
      // SQLite materializes committed WAL frames into a standalone snapshot.
      await source.backup(stagedPath);
      source.close();
      source = null;
      staged = new Database(stagedPath);
      staged.pragma('foreign_keys = ON');
      try {
        runMigrations(staged);
        verifySnapshot(staged);
        verifySchema(staged);
      } catch (error) {
        throw new AppError(
          `Restore schema is incompatible: ${error.message}`,
          400,
          'RESTORE_SCHEMA_INVALID',
        );
      }
      staged.close();
      staged = null;
      if (this.db.name !== dbPath)
        throw new AppError(
          'Active database changed during restore.',
          409,
          'RESTORE_DATABASE_CHANGED',
        );
      try {
        await this.backupService.backupDatabase({
          type: 'PRE_MIGRATION',
          userId: auditActor(this.db, userId),
          allowDuringRestore: true,
        });
      } catch (error) {
        throw new AppError(
          `Emergency pre-restore backup failed: ${error.message}. Restore aborted.`,
          500,
          'RESTORE_BACKUP_FAILED',
        );
      }
      if (this.db.name !== dbPath)
        throw new AppError(
          'Active database changed during restore.',
          409,
          'RESTORE_DATABASE_CHANGED',
        );
      const checkpoint = this.db.pragma('wal_checkpoint(TRUNCATE)')[0];
      if (checkpoint?.busy)
        throw new AppError(
          'Close other database readers before restoring.',
          409,
          'RESTORE_DATABASE_BUSY',
        );
      this.db.close();
      closedOriginal = true;
      if (isGlobal) closeDatabase();
      cleanupWalFiles(activePath);
      fs.renameSync(activePath, rollbackPath);
      movedOriginal = true;
      fs.renameSync(stagedPath, activePath);
      restored = reopenDatabase(activePath, { allowRestoreLock: true });
      verifySnapshot(restored);
      restored
        .prepare(
          `INSERT INTO restore_logs (filename, filepath, status, error_message, created_by)
        VALUES (?, ?, 'SUCCESS', NULL, ?)`,
        )
        .run(path.basename(sourcePath), sourcePath, auditActor(restored, userId));
      this.db = followsGlobal ? initialConnection : restored;
      if (!followsGlobal) {
        this.backupService.db = restored;
        this.backupService.repository.db = restored;
      }
      // Keep the original until validation and the audit write have both succeeded.
      fs.unlinkSync(rollbackPath);
      movedOriginal = false;
      return { success: true };
    } catch (error) {
      if (!movedOriginal) {
        if (closedOriginal) {
          const original = reopenDatabase(activePath, { allowRestoreLock: true });
          this.db = followsGlobal ? initialConnection : original;
          if (!followsGlobal) {
            this.backupService.db = original;
            this.backupService.repository.db = original;
          }
        }
        throw error;
      }
      try {
        restored?.close();
        closeDatabase();
        cleanupWalFiles(activePath);
        if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
        fs.renameSync(rollbackPath, activePath);
        const original = reopenDatabase(activePath, { allowRestoreLock: true });
        this.db = followsGlobal ? initialConnection : original;
        if (!followsGlobal) {
          this.backupService.db = original;
          this.backupService.repository.db = original;
        }
        original
          .prepare(
            `INSERT INTO restore_logs (filename, filepath, status, error_message, created_by)
          VALUES (?, ?, 'FAILED', ?, ?)`,
          )
          .run(path.basename(sourcePath), sourcePath, error.message, auditActor(original, userId));
      } catch (rollbackError) {
        throw new AppError(
          `Restore failed and automatic rollback failed: ${rollbackError.message}. Preserved original: ${rollbackPath}`,
          500,
          'RESTORE_ROLLBACK_FAILED',
        );
      }
      throw new AppError(
        `Database restore failed. Original database restored. Error: ${error.message}`,
        500,
        'RESTORE_FAILED',
      );
    } finally {
      source?.close();
      staged?.close();
      for (const file of [stagedPath, `${stagedPath}-wal`, `${stagedPath}-shm`, lockPath]) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
    }
  }
}
