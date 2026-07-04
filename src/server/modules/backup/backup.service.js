import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { BackupRepository } from './backup.repository.js';
import { AppError } from '../../shared/errors/AppError.js';

export class BackupService {
  constructor(db) {
    this.db = db;
    this.repository = new BackupRepository(db);
  }

  async backupDatabase({ type, customPath, userId } = {}) {
    if (!type) {
      throw new AppError('Backup type is required', 400, 'BACKUP_TYPE_REQUIRED');
    }

    const allowedTypes = ['AUTO', 'MANUAL', 'PRE_MIGRATION'];
    if (!allowedTypes.includes(type)) {
      throw new AppError(`Invalid backup type: ${type}`, 400, 'INVALID_BACKUP_TYPE');
    }

    const dbPath = this.db.name;
    const dbBase = (dbPath && dbPath !== ':memory:') ? path.basename(dbPath, path.extname(dbPath)) : 'goldy_erp';
    const dbExt = (dbPath && dbPath !== ':memory:') ? path.extname(dbPath) : '.db';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${dbBase}_backup_${type}_${timestamp}${dbExt}`;

    let targetPath;
    if (customPath) {
      const resolvedCustom = path.resolve(customPath);
      let isDir = false;
      try {
        if (fs.existsSync(resolvedCustom)) {
          isDir = fs.statSync(resolvedCustom).isDirectory();
        } else {
          isDir = !path.extname(resolvedCustom) || customPath.endsWith('/') || customPath.endsWith('\\');
        }
      } catch (err) {
        isDir = false;
      }
      targetPath = isDir ? path.join(resolvedCustom, filename) : resolvedCustom;
    } else {
      targetPath = path.join(env.appDataPath, 'backups', filename);
    }

    const targetDir = path.dirname(targetPath);

    let logRecord;
    try {
      logRecord = this.repository.createBackupLog({
        filename: path.basename(targetPath),
        filepath: targetPath,
        type,
        status: 'PENDING',
        created_by: userId || null
      });
    } catch (dbErr) {
      throw new AppError(`Failed to initialize backup log: ${dbErr.message}`, 500, 'BACKUP_LOG_INIT_FAILED');
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
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        this.db.prepare(`VACUUM INTO '${escapedPath}'`).run();
      }

      if (!fs.existsSync(targetPath)) {
        throw new Error('Backup file was not created');
      }

      const fileSize = fs.statSync(targetPath).size;

      logRecord = this.repository.updateBackupLogStatus(logRecord.id, 'SUCCESS', {
        file_size: fileSize
      });

      // Run retention policy asynchronously or inline for AUTO backups
      if (type === 'AUTO') {
        try {
          this.enforceRetentionPolicy();
        } catch (retentionErr) {
          console.error('Failed to enforce backup retention policy:', retentionErr);
        }
      }

      return logRecord;
    } catch (err) {
      try {
        logRecord = this.repository.updateBackupLogStatus(logRecord.id, 'FAILED', {
          error_message: err.message
        });
      } catch (logErr) {
        console.error('Failed to update backup log status to FAILED:', logErr);
      }

      throw new AppError(`Database backup failed: ${err.message}`, 500, 'BACKUP_FAILED');
    }
  }

  list(query = {}) {
    const limit = Number(query.limit) || 50;
    const offset = Number(query.offset) || 0;
    const data = this.repository.getBackupLogs(limit, offset);
    return { data };
  }

  getSettings() {
    return this.repository.getSchedulerSettings();
  }

  updateSettings(settings) {
    if (!settings || typeof settings !== 'object') {
      throw new AppError('Settings payload is required.', 400, 'VALIDATION_ERROR');
    }

    const cleanSettings = {};

    if (settings['backup.auto_enabled'] !== undefined) {
      cleanSettings['backup.auto_enabled'] = settings['backup.auto_enabled'] === true || settings['backup.auto_enabled'] === 'true' || settings['backup.auto_enabled'] === 1 || settings['backup.auto_enabled'] === '1' ? 'true' : 'false';
    }

    if (settings['backup.missed_recovery'] !== undefined) {
      cleanSettings['backup.missed_recovery'] = settings['backup.missed_recovery'] === true || settings['backup.missed_recovery'] === 'true' || settings['backup.missed_recovery'] === 1 || settings['backup.missed_recovery'] === '1' ? 'true' : 'false';
    }

    if (settings['backup.retention_count'] !== undefined) {
      const count = Number(settings['backup.retention_count']);
      if (!Number.isInteger(count) || count < 1) {
        throw new AppError('Retention count must be an integer greater than or equal to 1.', 400, 'VALIDATION_ERROR');
      }
      cleanSettings['backup.retention_count'] = count;
    }

    if (settings['backup.interval_hours'] !== undefined) {
      const hours = Number(settings['backup.interval_hours']);
      if (!Number.isInteger(hours) || hours < 1) {
        throw new AppError('Interval hours must be an integer greater than or equal to 1.', 400, 'VALIDATION_ERROR');
      }
      cleanSettings['backup.interval_hours'] = hours;
    }

    if (settings['backup.preferred_time'] !== undefined) {
      const time = String(settings['backup.preferred_time']).trim();
      if (!/^\d{2}:\d{2}$/.test(time)) {
        throw new AppError('Preferred time must be in HH:MM format.', 400, 'VALIDATION_ERROR');
      }
      cleanSettings['backup.preferred_time'] = time;
    }

    if (settings['backup.schedule_type'] !== undefined) {
      const st = String(settings['backup.schedule_type']).toUpperCase();
      if (!['DAILY', 'WEEKLY', 'INTERVAL'].includes(st)) {
        throw new AppError('Schedule type must be DAILY, WEEKLY, or INTERVAL.', 400, 'VALIDATION_ERROR');
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
      cleanSettings['backup.last_run_at'] = settings['backup.last_run_at'] ? String(settings['backup.last_run_at']).trim() : null;
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

    const activeBackups = this.repository.getUnpurgedSuccessfulAutoBackups();
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
          console.warn(`Failed to physically delete backup file at ${log.filepath}: ${err.message}`);
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
