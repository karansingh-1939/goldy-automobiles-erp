import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { ServiceHistoryController } from './serviceHistory.controller.js';
import { createServiceHistoryService } from './serviceHistory.service.js';

/**
 * Factory function to create the Express Router for Service History.
 * Sets up dependency injections, authentication checkpoints, and RBAC rules.
 * 
 * @param {import('better-sqlite3').Database} db - The SQLite database instance.
 * @returns {Router} The configured Express router.
 */
export function createServiceHistoryRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new ServiceHistoryController(createServiceHistoryService(db));
  const requireAuth = authenticate(authService);

  // 1. Enforce global authentication for all service history lookups
  router.use(requireAuth);

  // 2. Map endpoints with specific resource permissions
  router.get(
    '/vehicles/:vehicleId/service-history',
    requirePermission('vehicles.read'),
    controller.getVehicleServiceHistory
  );

  router.get(
    '/customers/:customerId/service-history',
    requirePermission('customers.read'),
    controller.getCustomerServiceHistory
  );

  return router;
}
