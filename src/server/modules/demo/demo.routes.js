import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate } from '../../shared/middleware/authMiddleware.js';
import { DemoController } from './demo.controller.js';

export function createDemoRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new DemoController(db);
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  router.get('/status', controller.getStatus);
  router.post('/toggle', controller.toggleMode);
  router.post('/load', controller.loadData);
  router.post('/clear', controller.clearData);
  router.post('/reset', controller.resetDb);
  router.get('/export', controller.exportJsonData);
  router.post('/import', controller.importJsonData);

  return router;
}
