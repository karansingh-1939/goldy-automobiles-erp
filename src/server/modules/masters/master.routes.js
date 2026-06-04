import { Router } from 'express';
import { createAuditService } from '../audit/audit.service.js';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { masterConfigs } from './master.config.js';
import { MasterController } from './master.controller.js';
import { MasterRepository } from './master.repository.js';
import { MasterService } from './master.service.js';

export function createMasterRouter(db, config) {
  const router = Router();
  const authService = createAuthService(db);
  const auditService = createAuditService(db);
  const repository = new MasterRepository(db, config);
  const service = new MasterService({ repository, auditService, config });
  const controller = new MasterController(service);
  const requireAuth = authenticate(authService);

  router.use(requireAuth);
  router.get('/', requirePermission(config.readPermission), controller.list);
  router.get('/:id', requirePermission(config.readPermission), controller.get);
  router.post('/', requirePermission(config.writePermission), controller.create);
  router.patch('/:id', requirePermission(config.writePermission), controller.update);
  router.delete('/:id', requirePermission(config.writePermission), controller.delete);

  return router;
}

export function registerMasterRoutes(app, db) {
  for (const config of Object.values(masterConfigs)) {
    app.use(`/api/v1${config.route}`, createMasterRouter(db, config));
  }
}
