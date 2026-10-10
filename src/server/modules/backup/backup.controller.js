import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { getBackupDirectory } from '../../database/backup-service.js';
import { AppError } from '../../shared/errors/app-error.js';

export class BackupController {
  constructor(backupService, restoreService, backupScheduler) {
    this.backupService = backupService;
    this.restoreService = restoreService;
    this.backupScheduler = backupScheduler;
  }

  manualBackup = async (req, res, next) => {
    try {
      const backupLog = await this.backupService.backupDatabase({
        type: 'MANUAL',
        userId: req.user?.id,
      });
      res.status(201).json({ data: backupLog });
    } catch (error) {
      next(error);
    }
  };
  list = (req, res, next) => {
    try {
      res.status(200).json(this.backupService.list(req.query));
    } catch (error) {
      next(error);
    }
  };
  verifyBackup = async (req, res, next) => {
    try {
      res.json({ data: await this.backupService.verifyBackup(Number(req.params.id)) });
    } catch (error) {
      next(error);
    }
  };
  getSettings = (req, res, next) => {
    try {
      res.status(200).json({ status: 'success', data: this.backupService.getSettings() });
    } catch (error) {
      next(error);
    }
  };
  updateSettings = (req, res, next) => {
    try {
      const settings = this.backupService.updateSettings(req.body);
      this.backupScheduler?.restart();
      res.status(200).json({ status: 'success', data: settings });
    } catch (error) {
      next(error);
    }
  };
  restoreDatabase = async (req, res, next) => {
    try {
      const result = await this.restoreService.restoreDatabase({
        backupFilePath: req.body.backupFilePath,
        userId: req.user?.id,
      });
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };
  restoreUploadedDatabase = async (req, res, next) => {
    const tempDir = path.join(env.appDataPath, 'temp');
    let tempFilePath;
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      tempFilePath = path.join(tempDir, `upload_restore_${randomUUID()}.db`);
      // A local ERP upload is bounded so a stalled or oversized client cannot fill the disk.
      const maximumBytes = 512 * 1024 * 1024;
      const output = fs.createWriteStream(tempFilePath, { flags: 'wx' });
      let bytes = 0;
      await new Promise((resolve, reject) => {
        req.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > maximumBytes) {
            req.unpipe(output);
            output.destroy(
              new AppError('Backup upload exceeds 512 MB.', 413, 'RESTORE_UPLOAD_TOO_LARGE'),
            );
          }
        });
        req.on('aborted', () =>
          output.destroy(
            new AppError('Backup upload was interrupted.', 400, 'RESTORE_UPLOAD_ABORTED'),
          ),
        );
        req.on('error', (error) => output.destroy(error));
        output.on('error', reject);
        output.on('finish', resolve);
        req.pipe(output);
      });
      const result = await this.restoreService.restoreDatabase({
        backupFilePath: tempFilePath,
        userId: req.user?.id,
      });
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
  };
  restoreLatestBackup = async (req, res, next) => {
    try {
      const directory = getBackupDirectory(this.backupService.db.name);
      const candidates = fs.existsSync(directory)
        ? fs
            .readdirSync(directory)
            .filter((name) => /\.(db|sqlite)$/i.test(name))
            .map((name) => ({
              file: path.join(directory, name),
              stat: fs.lstatSync(path.join(directory, name)),
            }))
            .filter(({ stat }) => stat.isFile())
            .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
        : [];
      if (!candidates.length)
        throw new AppError('No backups found for the active database.', 404, 'BACKUP_NOT_FOUND');
      const result = await this.restoreService.restoreDatabase({
        backupFilePath: candidates[0].file,
        userId: req.user?.id,
      });
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };
  purgeDemoData = (req, res, next) => {
    next(
      new AppError(
        'Heuristic data deletion is disabled. Use Reset Demo Database while in demo mode.',
        400,
        'DEMO_PURGE_DISABLED',
      ),
    );
  };
}
