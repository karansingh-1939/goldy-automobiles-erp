import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/auth-middleware.js';
import { CrmController } from './crm.controller.js';
import { createCrmService } from './crm.service.js';

export function createCrmRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new CrmController(createCrmService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  // Loyalty Program endpoints
  router.get('/loyalty', requirePermission('customers.read'), controller.listLoyalties);
  router.post('/loyalty', requirePermission('customers.write'), controller.registerLoyalty);
  router.get(
    '/loyalty/customer/:customerId',
    requirePermission('customers.read'),
    controller.getLoyalty,
  );
  router.post(
    '/loyalty/:id/adjust',
    requirePermission('customers.write'),
    controller.adjustLoyaltyPoints,
  );
  router.get(
    '/loyalty/:id/history',
    requirePermission('customers.read'),
    controller.getLoyaltyHistory,
  );

  // Referrals endpoints
  router.get('/referrals', requirePermission('customers.read'), controller.listReferrals);
  router.post('/referrals', requirePermission('customers.write'), controller.generateReferral);
  router.post(
    '/referrals/complete',
    requirePermission('customers.write'),
    controller.completeReferral,
  );

  // Promotions endpoints
  router.get('/promotions', requirePermission('sales-orders.read'), controller.listPromotions);
  router.post('/promotions', requirePermission('sales-orders.write'), controller.createPromotion);
  router.get(
    '/promotions/evaluate',
    requirePermission('sales-orders.read'),
    controller.evaluatePromotion,
  );

  // Reminders endpoints
  router.get('/reminders', requirePermission('customers.read'), controller.listReminders);
  router.post('/reminders', requirePermission('customers.write'), controller.createReminder);
  router.post(
    '/reminders/:id/dismiss',
    requirePermission('customers.write'),
    controller.dismissReminder,
  );

  return router;
}
