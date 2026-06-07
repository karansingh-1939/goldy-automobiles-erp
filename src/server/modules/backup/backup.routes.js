import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { BackupController } from './backup.controller.js';
import { createBackupService } from './backup.service.js';

export function createBackupRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new BackupController(createBackupService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  router.post('/manual', requirePermission('backups.write'), controller.manualBackup);
  router.get('/', requirePermission('backups.read'), controller.list);

  return router;
}
