import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { PurchasingController } from './purchasing.controller.js';
import { createPurchasingService } from './purchasing.service.js';

export function createPurchasingRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new PurchasingController(createPurchasingService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  router.get('/orders', requirePermission('purchases.read'), controller.listOrders);
  router.get('/orders/:id', requirePermission('purchases.read'), controller.getOrder);
  router.post('/orders', requirePermission('purchases.write'), controller.createOrder);

  router.get('/receipts', requirePermission('purchases.read'), controller.listReceipts);
  router.get('/receipts/:id', requirePermission('purchases.read'), controller.getReceipt);
  router.post('/receipts', requirePermission('purchases.write'), controller.createReceipt);

  router.get('/returns/:id', requirePermission('purchases.read'), controller.getReturn);
  router.post('/returns', requirePermission('purchases.write'), controller.createReturn);

  return router;
}
