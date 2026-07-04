import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { ReturnsController } from './returns.controller.js';

export function createReturnsRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new ReturnsController(db);
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  // Reports
  router.get('/reports/customer-summary', requirePermission('returns.read'), controller.getCustomerSummaryReport);
  router.get('/reports/supplier-summary', requirePermission('returns.read'), controller.getSupplierSummaryReport);
  router.get('/reports/open-rmas', requirePermission('returns.read'), controller.getOpenRmasReport);

  // Customer Returns
  router.get('/customer', requirePermission('returns.read'), controller.listCustomerReturns);
  router.get('/customer/:id', requirePermission('returns.read'), controller.getCustomerReturnById);
  router.post('/customer', requirePermission('returns.write'), controller.createCustomerReturn);
  router.post('/customer/:id/approve', requirePermission('returns.approve'), controller.completeCustomerReturn);
  router.post('/customer/:id/cancel', requirePermission('returns.approve'), controller.cancelCustomerReturn);

  // Supplier Returns
  router.get('/supplier', requirePermission('returns.read'), controller.listSupplierReturns);
  router.get('/supplier/:id', requirePermission('returns.read'), controller.getSupplierReturnById);
  router.post('/supplier', requirePermission('returns.write'), controller.createSupplierReturn);
  router.post('/supplier/:id/approve', requirePermission('returns.approve'), controller.completeSupplierReturn);
  router.post('/supplier/:id/cancel', requirePermission('returns.approve'), controller.cancelSupplierReturn);

  return router;
}
