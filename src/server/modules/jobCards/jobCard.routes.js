import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { JobCardController } from './jobCard.controller.js';
import { createJobCardService } from './jobCard.service.js';

export function createJobCardRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new JobCardController(createJobCardService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  router.get('/job-cards', requirePermission('job_cards.read'), controller.list);
  router.get('/job-cards/:id', requirePermission('job_cards.read'), controller.get);
  router.post('/job-cards', requirePermission('job_cards.write'), controller.create);
  router.post('/job-cards/:id/parts', requirePermission('job_cards.write'), controller.addPart);
  router.post('/job-cards/:id/labour', requirePermission('job_cards.write'), controller.addLabour);
  router.post('/job-cards/:id/finalize', requirePermission('invoices.finalize'), controller.finalize);

  router.get('/invoices/:id', requirePermission('invoices.read'), controller.getInvoice);
  router.post('/invoices/:id/cancel', requirePermission('invoices.cancel'), controller.cancelInvoice);

  return router;
}
