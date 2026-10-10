import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { getBackupDirectory, isManagedBackup } from './backup-service.js';

export const RecoveryStatus = { SUCCESS: 'SUCCESS', FAILED: 'FAILED', NO_BACKUP: 'NO_BACKUP' };

export class RecoveryResult {
  constructor(status, corruptedFilename = null, backupSource = null, errors = []) {
    this.status = status;
    this.corruptedFilename = corruptedFilename;
    this.backupSource = backupSource;
    this.errors = errors;
    this.timestamp = new Date().toISOString();
  }
}

export class CorruptionRecoveryService {
  static recover(dbPath, backupsDir = null) {
    const errors = [];
    let corruptedFilename = null;
    let backupSource = null;
    let stagedPath;
    try {
      const activePath = path.resolve(dbPath);
      const directory = getBackupDirectory(activePath);
      if (backupsDir && path.resolve(backupsDir) !== path.resolve(directory)) {
        throw new Error('Recovery backups must belong to the active database identity.');
      }
      // Preserve the damaged main file and its sidecars even when no backup is available.
      if (fs.existsSync(activePath)) {
        const ext = path.extname(activePath);
        const base = path.basename(activePath, ext);
        corruptedFilename = `${base}_corrupted_${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID()}${ext}`;
        const forensicPath = path.join(path.dirname(activePath), corruptedFilename);
        fs.renameSync(activePath, forensicPath);
        for (const suffix of ['-wal', '-shm']) {
          if (fs.existsSync(`${activePath}${suffix}`))
            fs.renameSync(`${activePath}${suffix}`, `${forensicPath}${suffix}`);
        }
      }
      if (!fs.existsSync(directory))
        return new RecoveryResult(RecoveryStatus.NO_BACKUP, corruptedFilename, null, [
          'No backups found for this database identity.',
        ]);
      const files = fs
        .readdirSync(directory)
        .filter((name) => isManagedBackup(path.join(directory, name), directory))
        .map((name) => ({
          file: path.join(directory, name),
          stat: fs.lstatSync(path.join(directory, name)),
        }))
        .filter(({ stat }) => stat.isFile())
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
      if (!files.length)
        return new RecoveryResult(RecoveryStatus.NO_BACKUP, corruptedFilename, null, [
          'No backups found for this database identity.',
        ]);
      for (const { file } of files) {
        let source;
        let staged;
        try {
          if (fs.statSync(file).size === 0) throw new Error('Backup file is empty.');
          source = new Database(file, { readonly: true, fileMustExist: true });
          const check = source.pragma('integrity_check');
          if (check.length !== 1 || check[0].integrity_check !== 'ok')
            throw new Error('Integrity check failed.');
          if (source.pragma('foreign_key_check').length)
            throw new Error('Foreign-key validation failed.');
          const settings = source
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'system_settings'",
            )
            .get();
          const sourceMode = settings
            ? source.prepare("SELECT value FROM system_settings WHERE key = 'database.mode'").get()
                ?.value
            : undefined;
          const targetMode = /_demo\.[^.]+$/i.test(path.basename(activePath))
            ? 'demo'
            : 'production';
          if ((sourceMode || 'production') !== targetMode)
            throw new Error('Backup belongs to a different database mode.');
          stagedPath = `${activePath}.${randomUUID()}.recovery`;
          source.prepare('VACUUM INTO ?').run(stagedPath);
          source.close();
          source = null;
          staged = new Database(stagedPath, { readonly: true });
          const stagedCheck = staged.pragma('integrity_check');
          if (stagedCheck.length !== 1 || stagedCheck[0].integrity_check !== 'ok')
            throw new Error('Snapshot integrity check failed.');
          staged.close();
          staged = null;
          fs.renameSync(stagedPath, activePath);
          backupSource = path.basename(file);
          return new RecoveryResult(
            RecoveryStatus.SUCCESS,
            corruptedFilename,
            backupSource,
            errors,
          );
        } catch (error) {
          errors.push(`Validation failed for backup "${path.basename(file)}": ${error.message}`);
        } finally {
          source?.close();
          staged?.close();
          if (stagedPath && fs.existsSync(stagedPath)) fs.unlinkSync(stagedPath);
        }
      }
      return new RecoveryResult(RecoveryStatus.FAILED, corruptedFilename, backupSource, errors);
    } catch (error) {
      errors.push(`Critical error during recovery operation: ${error.message}`);
      return new RecoveryResult(RecoveryStatus.FAILED, corruptedFilename, backupSource, errors);
    }
  }
}
