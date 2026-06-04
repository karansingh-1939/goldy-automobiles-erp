import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { InventoryController } from './inventory.controller.js';
import { createInventoryService } from './inventory.service.js';

export function createInventoryRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new InventoryController(createInventoryService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  router.get('/items', requirePermission('inventory.read'), controller.listItems);
  router.get('/items/:id', requirePermission('inventory.read'), controller.getItem);
  router.post('/items', requirePermission('inventory.write'), controller.createItem);
  router.patch('/items/:id', requirePermission('inventory.write'), controller.updateItem);

  router.post('/opening-stock', requirePermission('inventory.adjust'), controller.createOpeningStock);
  router.post('/adjustments', requirePermission('inventory.adjust'), controller.createAdjustment);
  router.post('/transfers', requirePermission('inventory.adjust'), controller.transferStock);

  router.get('/reports/summary', requirePermission('inventory.read'), controller.stockSummary);
  router.get('/reports/valuation', requirePermission('inventory.read'), controller.stockValuation);
  router.get('/reports/movements', requirePermission('inventory.read'), controller.movements);
  router.get('/reports/low-stock', requirePermission('inventory.read'), controller.lowStock);
  router.get('/reports/expiring', requirePermission('inventory.read'), controller.expiringStock);

  return router;
}
