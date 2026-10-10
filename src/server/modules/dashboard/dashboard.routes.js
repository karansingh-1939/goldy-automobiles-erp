import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/auth-middleware.js';
import { DashboardController } from './dashboard.controller.js';
import { createDashboardService } from './dashboard.service.js';

export function createDashboardRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new DashboardController(createDashboardService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);
  router.use(requirePermission('dashboard.read'));

  router.get('/operations', controller.getOperationsMetrics);
  router.get('/financial', controller.getFinancialMetrics);
  router.get('/inventory', controller.getInventoryMetrics);
  router.get('/sales', controller.getSalesMetrics);

  return router;
}
