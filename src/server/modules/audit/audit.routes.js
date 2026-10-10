import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/auth-middleware.js';
import { AuditController } from './audit.controller.js';
import { createAuditService } from './audit.service.js';

export function createAuditRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new AuditController(createAuditService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  router.get('/', requirePermission('audit.read'), controller.list);

  return router;
}
