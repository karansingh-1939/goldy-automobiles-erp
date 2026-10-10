import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/auth-middleware.js';
import { GstController } from './gst.controller.js';
import { createGstService } from './gst.service.js';

export function createGstRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new GstController(createGstService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);
  router.use(requirePermission('gst.read'));

  router.get('/summary', controller.summary);
  router.get('/gstr1', controller.gstr1);
  router.get('/gstr3b', controller.gstr3b);
  router.get('/hsn-summary', controller.hsnSummary);

  // Period Locks endpoints
  router.get('/locks', controller.getPeriodLocks);
  router.post('/locks', requirePermission('gst.write'), controller.updatePeriodLock);

  return router;
}
