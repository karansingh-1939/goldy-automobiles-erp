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
  router.get('/items/:id/batches', requirePermission('inventory.read'), controller.getItemBatches);
  router.post('/items', requirePermission('inventory.write'), controller.createItem);
  router.patch('/items/:id', requirePermission('inventory.write'), controller.updateItem);

  router.post('/opening-stock', requirePermission('inventory.adjust'), controller.createOpeningStock);
  router.post('/adjustments', requirePermission('inventory.adjust'), controller.createAdjustment);
  router.post('/transfers', requirePermission('inventory.adjust'), controller.transferStock);
  router.get('/seed-status', requirePermission('inventory.read'), controller.getSeedStatus);
  router.post('/seed-starter', requirePermission('inventory.write'), controller.seedStarter);
  router.get('/dashboard-stats', requirePermission('inventory.read'), controller.dashboardStats);
  router.post('/bulk-save', requirePermission('inventory.adjust'), controller.bulkSave);

  router.get('/reports/summary', requirePermission('inventory.read'), controller.stockSummary);
  router.get('/reports/valuation', requirePermission('inventory.read'), controller.stockValuation);
  router.get('/reports/movements', requirePermission('inventory.read'), controller.movements);
  router.get('/reports/low-stock', requirePermission('inventory.read'), controller.lowStock);
  router.get('/reports/expiring', requirePermission('inventory.read'), controller.expiringStock);
  router.get('/reports/reconciliation', requirePermission('inventory.read'), controller.reconcileInventory);

  router.get('/assets', requirePermission('inventory.read'), controller.listFixedAssets);
  router.post('/assets', requirePermission('inventory.write'), controller.createFixedAsset);

  router.get('/verifications', requirePermission('inventory.read'), controller.listStockVerifications);
  router.post('/verifications', requirePermission('inventory.adjust'), controller.verifyStock);
  router.post('/verifications/:id/approve', requirePermission('inventory.adjust'), controller.approveVerification);
  router.post('/verifications/:id/reject', requirePermission('inventory.adjust'), controller.rejectVerification);

  router.post('/reservations', requirePermission('inventory.adjust'), controller.reserveStock);
  router.post('/reservations/:id/cancel', requirePermission('inventory.adjust'), controller.cancelReservation);

  router.get('/warehouses/:id/permissions', requirePermission('warehouses.write'), controller.getWarehousePermissions);
  router.post('/warehouses/:id/permissions', requirePermission('warehouses.write'), controller.saveWarehousePermissions);

  router.post('/transfers/:id/receive', requirePermission('inventory.adjust'), controller.receiveTransfer);
  router.post('/transfers/:id/cancel', requirePermission('inventory.adjust'), controller.cancelTransfer);

  return router;
}
