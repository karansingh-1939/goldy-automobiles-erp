import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { WarrantyController } from './warranty.controller.js';

export function createWarrantyRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new WarrantyController(db);
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  // Reports
  router.get('/reports/status-count', requirePermission('warranty.read'), controller.getStatusCountReport);
  router.get('/reports/failure-analysis', requirePermission('warranty.read'), controller.getFailureAnalysisReport);

  // Lookup
  router.get('/lookup', requirePermission('warranty.read'), controller.lookupWarranty);

  // Claims
  router.get('/claims', requirePermission('warranty.read'), controller.listWarrantyClaims);
  router.get('/claims/:id', requirePermission('warranty.read'), controller.getWarrantyClaimById);
  router.post('/claims', requirePermission('warranty.write'), controller.fileClaim);
  router.post('/claims/:id/approve', requirePermission('warranty.write'), controller.settleClaim);
  router.post('/claims/:id/reject', requirePermission('warranty.write'), controller.rejectClaim);

  // Registrations
  router.get('/', requirePermission('warranty.read'), controller.listWarrantyRegistrations);
  router.get('/:id', requirePermission('warranty.read'), controller.getWarrantyRegistrationById);
  router.post('/', requirePermission('warranty.write'), controller.registerWarranty);

  return router;
}
