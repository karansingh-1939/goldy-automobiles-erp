import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { TechnicianController } from './technician.controller.js';
import { createTechnicianService } from './technician.service.js';

export function createTechnicianRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new TechnicianController(createTechnicianService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  router.get('/', requirePermission('job_cards.read'), controller.list);
  router.get('/:id', requirePermission('job_cards.read'), controller.get);
  router.post('/', requirePermission('job_cards.write'), controller.create);
  router.patch('/:id', requirePermission('job_cards.write'), controller.update);
  router.delete('/:id', requirePermission('job_cards.write'), controller.deactivate);
  router.post('/:id/assign', requirePermission('job_cards.assign'), controller.assignToJobCard);
  router.get('/:id/history', requirePermission('job_cards.read'), controller.getHistory);

  return router;
}
