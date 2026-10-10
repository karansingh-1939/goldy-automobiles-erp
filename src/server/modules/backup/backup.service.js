import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getBackupDirectory, isManagedBackup } from '../../database/backup-service.js';
import { BackupRepository } from './backup.repository.js';
import { AppError } from '../../shared/errors/app-error.js';
import { verifyBackupSnapshot } from './snapshot-verification.js';

export class BackupService {
  constructor(db) {
    this.db = db;
    this.repository = new BackupRepository(db);
  }

  async backupDatabase({ type, customPath, userId, allowDuringRestore = false } = {}) {
    if (!type) {
      throw new AppError('Backup type is required', 400, 'BACKUP_TYPE_REQUIRED');
    }

    const allowedTypes = ['AUTO', 'MANUAL', 'PRE_MIGRATION'];
    if (!allowedTypes.includes(type)) {
      throw new AppError(`Invalid backup type: ${type}`, 400, 'INVALID_BACKUP_TYPE');
    }

    const dbPath = this.db.name;
    const dbBase =
      dbPath && dbPath !== ':memory:' ? path.basename(dbPath, path.extname(dbPath)) : 'goldy_erp';
    const dbExt = dbPath && dbPath !== ':memory:' ? path.extname(dbPath) : '.db';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${dbBase}_backup_${type}_${timestamp}_${randomUUID()}${dbExt}`;

    let targetPath;
    if (customPath) {
      const resolvedCustom = path.resolve(customPath);
      let isDir = false;
      try {
        if (fs.existsSync(resolvedCustom)) {
          isDir = fs.statSync(resolvedCustom).isDirectory();
        } else {
          isDir =
            !path.extname(resolvedCustom) || customPath.endsWith('/') || customPath.endsWith('\\');
        }
      } catch (err) {
        isDir = false;
      }
      targetPath = isDir ? path.join(resolvedCustom, filename) : resolvedCustom;
    } else {
      targetPath = path.join(getBackupDirectory(dbPath), filename);
    }

    const targetDir = path.dirname(targetPath);

    if (path.resolve(targetPath) === path.resolve(dbPath)) {
      throw new AppError(
        'A backup cannot overwrite the active database.',
        400,
        'BACKUP_PATH_INVALID',
      );
    }
    const lockPath = `${dbPath}.backup.lock`;
    if (!allowDuringRestore && fs.existsSync(path.join(path.dirname(dbPath), 'restore.lock'))) {
      throw new AppError('A restore is already in progress.', 409, 'RESTORE_IN_PROGRESS');
    }
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    } catch (error) {
      throw new AppError(
        'A backup is already in progress or its lock cannot be acquired.',
        409,
        'BACKUP_IN_PROGRESS',
      );
    }

    let logRecord;
    try {
      logRecord = this.repository.createBackupLog({
        filename: path.basename(targetPath),
        filepath: targetPath,
        type,
        status: 'PENDING',
        created_by: userId || null,
      });
    } catch (dbErr) {
      fs.unlinkSync(lockPath);
      throw new AppError(
        `Failed to initialize backup log: ${dbErr.message}`,
        500,
        'BACKUP_LOG_INIT_FAILED',
      );
    }

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      if (typeof this.db.backup === 'function') {
        // 1. Prefer: db.backup(filepath)
        await this.db.backup(targetPath);
      } else {
        // 2. Fallback: VACUUM INTO 'filepath'
        const escapedPath = targetPath.replace(/'/g, "''");
        this.db.prepare(`VACUUM INTO '${escapedPath}'`).run();
      }

      if (!fs.existsSync(targetPath)) {
        throw new Error('Backup file was not created');
      }

      const fileSize = fs.statSync(targetPath).size;

      if (this.db.name !== dbPath) throw new Error('Active database changed during backup.');

      logRecord = this.repository.updateBackupLogStatus(logRecord.id, 'SUCCESS', {
        file_size: fileSize,
      });

      // Run retention policy asynchronously or inline for AUTO backups
      if (type === 'AUTO') {
        try {
          this.enforceRetentionPolicy();
        } catch (retentionErr) {
          console.error('Failed to enforce backup retention policy:', retentionErr);
        }
      }

      if (!customPath && type !== 'PRE_MIGRATION') {
        logRecord.external = await this.copyToExternalDestination(targetPath);
      }
      return logRecord;
    } catch (err) {
      try {
        if (this.db.name !== dbPath) throw new Error('Active database changed during backup.');
        logRecord = this.repository.updateBackupLogStatus(logRecord.id, 'FAILED', {
          error_message: err.message,
        });
      } catch (logErr) {
        console.error('Failed to update backup log status to FAILED:', logErr);
      }

      throw new AppError(`Database backup failed: ${err.message}`, 500, 'BACKUP_FAILED');
    } finally {
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    }
  }

  list(query = {}) {
    const limit = Number(query.limit) || 50;
    const offset = Number(query.offset) || 0;
    const data = this.repository.getBackupLogs(limit, offset);
    return { data };
  }

  async copyToExternalDestination(sourcePath) {
    const destination = this.getSettings()['backup.external_directory'];
    if (!destination) return { status: 'DISABLED' };
    try {
      // Require an existing destination: a disconnected drive must not silently
      // turn into another directory on the laptop.
      if (!fs.statSync(destination).isDirectory()) throw new Error('Destination is not a folder.');
      const target = path.join(destination, path.basename(sourcePath));
      fs.copyFileSync(sourcePath, target, fs.constants.COPYFILE_EXCL);
      await verifyBackupSnapshot(target);
      this.repository.updateSchedulerSettings({
        'backup.external_last_success': new Date().toISOString(),
        'backup.external_last_error': '',
      });
      return { status: 'SUCCESS', filepath: target };
    } catch (error) {
      this.repository.updateSchedulerSettings({ 'backup.external_last_error': error.message });
      return { status: 'FAILED', message: error.message };
    }
  }

  async verifyBackup(id) {
    const log = this.repository.findById(id);
    if (!log || log.status !== 'SUCCESS' || log.purged) {
      throw new AppError('Successful backup not found.', 404, 'BACKUP_NOT_FOUND');
    }
    try {
      return await verifyBackupSnapshot(log.filepath);
    } catch (error) {
      throw new AppError(`Backup verification failed: ${error.message}`, 400, 'BACKUP_INVALID');
    }
  }

  getSettings() {
    return this.repository.getSchedulerSettings();
  }

  updateSettings(settings) {
    if (!settings || typeof settings !== 'object') {
      throw new AppError('Settings payload is required.', 400, 'VALIDATION_ERROR');
    }

    const cleanSettings = {};

    if (settings['backup.external_directory'] !== undefined) {
      const directory = settings['backup.external_directory'];
      if (typeof directory !== 'string' || directory.length > 1024) {
        throw new AppError('External backup folder must be a path.', 400, 'VALIDATION_ERROR');
      }
      const trimmed = directory.trim();
      if (trimmed) {
        if (
          !path.isAbsolute(trimmed) ||
          !fs.existsSync(trimmed) ||
          !fs.statSync(trimmed).isDirectory()
        ) {
          throw new AppError(
            'Select an existing absolute external backup folder.',
            400,
            'VALIDATION_ERROR',
          );
        }
        const localDirectory = getBackupDirectory(this.db.name);
        if (
          path.resolve(trimmed) === path.resolve(localDirectory) ||
          (fs.existsSync(localDirectory) &&
            fs.realpathSync(trimmed) === fs.realpathSync(localDirectory))
        ) {
          throw new AppError(
            'External folder must differ from the local backup folder.',
            400,
            'VALIDATION_ERROR',
          );
        }
      }
      cleanSettings['backup.external_directory'] = trimmed ? path.resolve(trimmed) : '';
    }

    if (settings['backup.auto_enabled'] !== undefined) {
      cleanSettings['backup.auto_enabled'] =
        settings['backup.auto_enabled'] === true ||
        settings['backup.auto_enabled'] === 'true' ||
        settings['backup.auto_enabled'] === 1 ||
        settings['backup.auto_enabled'] === '1'
          ? 'true'
          : 'false';
    }

    if (settings['backup.missed_recovery'] !== undefined) {
      cleanSettings['backup.missed_recovery'] =
        settings['backup.missed_recovery'] === true ||
        settings['backup.missed_recovery'] === 'true' ||
        settings['backup.missed_recovery'] === 1 ||
        settings['backup.missed_recovery'] === '1'
          ? 'true'
          : 'false';
    }

    if (settings['backup.retention_count'] !== undefined) {
      const count = Number(settings['backup.retention_count']);
      if (!Number.isInteger(count) || count < 1) {
        throw new AppError(
          'Retention count must be an integer greater than or equal to 1.',
          400,
          'VALIDATION_ERROR',
        );
      }
      cleanSettings['backup.retention_count'] = count;
    }

    if (settings['backup.interval_hours'] !== undefined) {
      const hours = Number(settings['backup.interval_hours']);
      if (!Number.isInteger(hours) || hours < 1) {
        throw new AppError(
          'Interval hours must be an integer greater than or equal to 1.',
          400,
          'VALIDATION_ERROR',
        );
      }
      cleanSettings['backup.interval_hours'] = hours;
    }

    if (settings['backup.preferred_time'] !== undefined) {
      const time = String(settings['backup.preferred_time']).trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        throw new AppError('Preferred time must be in HH:MM format.', 400, 'VALIDATION_ERROR');
      }
      cleanSettings['backup.preferred_time'] = time;
    }

    if (settings['backup.schedule_type'] !== undefined) {
      const st = String(settings['backup.schedule_type']).toUpperCase();
      if (!['DAILY', 'WEEKLY', 'INTERVAL'].includes(st)) {
        throw new AppError(
          'Schedule type must be DAILY, WEEKLY, or INTERVAL.',
          400,
          'VALIDATION_ERROR',
        );
      }
      cleanSettings['backup.schedule_type'] = st;
    }

    if (settings['backup.weekly_day'] !== undefined) {
      const day = String(settings['backup.weekly_day']).trim();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      if (!days.includes(day)) {
        throw new AppError('Weekly day is invalid.', 400, 'VALIDATION_ERROR');
      }
      cleanSettings['backup.weekly_day'] = day;
    }

    if (settings['backup.last_run_at'] !== undefined) {
      cleanSettings['backup.last_run_at'] = settings['backup.last_run_at']
        ? String(settings['backup.last_run_at']).trim()
        : null;
    }

    return this.repository.updateSchedulerSettings(cleanSettings);
  }

  recordSuccessfulRun(timestamp) {
    this.repository.updateLastRunAt(timestamp);
  }

  enforceRetentionPolicy() {
    const settings = this.repository.getSchedulerSettings();
    let retentionCount = settings['backup.retention_count'];

    // Boundary conditions / safety guards
    if (typeof retentionCount !== 'number' || isNaN(retentionCount)) {
      retentionCount = 7;
    }
    if (retentionCount < 1) {
      retentionCount = 1;
    }

    const directory = getBackupDirectory(this.db.name);
    const activeBackups = this.repository
      .getUnpurgedSuccessfulAutoBackups()
      .filter((log) => log.filepath && isManagedBackup(log.filepath, directory));
    if (activeBackups.length <= retentionCount) {
      return { success: true, purgedCount: 0 };
    }

    // Identify logs to purge (older than the newest N successful backups)
    const toPurge = activeBackups.slice(retentionCount);
    let purgedCount = 0;

    for (const log of toPurge) {
      if (log.filepath) {
        try {
          if (fs.existsSync(log.filepath)) {
            fs.unlinkSync(log.filepath);
          }
        } catch (err) {
          console.warn(
            `Failed to physically delete backup file at ${log.filepath}: ${err.message}`,
          );
          if (fs.existsSync(log.filepath)) {
            continue; // Skip marking as purged since the file is still present on disk
          }
        }
      }

      this.repository.markBackupAsPurged(log.id);
      purgedCount++;
    }

    return { success: true, purgedCount };
  }
}

export function createBackupService(db) {
  return new BackupService(db);
}
