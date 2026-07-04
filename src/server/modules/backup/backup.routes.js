import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { BackupController } from './backup.controller.js';
import { createBackupService } from './backup.service.js';
import { RestoreService } from '../restore/restore.service.js';

export function createBackupRouter(db, backupScheduler) {
  const router = Router();
  const authService = createAuthService(db);
  const backupService = createBackupService(db);
  const restoreService = new RestoreService(db, backupService);
  const controller = new BackupController(backupService, restoreService, backupScheduler);
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  router.post('/manual', requirePermission('backups.write'), controller.manualBackup);
  router.get('/', requirePermission('backups.read'), controller.list);
  router.get('/settings', requirePermission('backups.read'), controller.getSettings);
  router.patch('/settings', requirePermission('backups.write'), controller.updateSettings);
  router.post('/restore', requirePermission('backups.write'), controller.restoreDatabase);
  router.post('/restore-latest', requirePermission('backups.write'), controller.restoreLatestBackup);
  router.post('/restore/upload', requirePermission('backups.write'), controller.restoreUploadedDatabase);
  router.post('/purge-demo', requirePermission('backups.write'), controller.purgeDemoData);

  return router;
}
