import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/auth-middleware.js';
import { WorkshopService } from './workshop.service.js';

export function createWorkshopRouter(db) {
  const router = Router();
  const service = new WorkshopService(db);
  const handle = (fn) => (req, res, next) => {
    try {
      res.json({ data: fn(req) });
    } catch (error) {
      next(error);
    }
  };
  router.use(authenticate(createAuthService(db)));
  router.get(
    '/queue',
    requirePermission('job_cards.read'),
    handle(() => service.queue()),
  );
  router.get(
    '/jobs/:id/time',
    requirePermission('job_cards.read'),
    handle((req) => service.timeEntries(Number(req.params.id))),
  );
  router.post(
    '/jobs/:id/time',
    requirePermission('job_cards.write'),
    handle((req) => service.startTimer(Number(req.params.id), req.body, req.user.id)),
  );
  router.post(
    '/time/:id/stop',
    requirePermission('job_cards.write'),
    handle((req) => service.stopTimer(Number(req.params.id), req.user.id)),
  );
  router.get(
    '/jobs/:id/estimates',
    requirePermission('job_cards.read'),
    handle((req) => service.history(Number(req.params.id))),
  );
  router.patch(
    '/jobs/:id/delivery',
    requirePermission('job_cards.write'),
    handle((req) => service.delivery(Number(req.params.id), req.body)),
  );
  router.post(
    '/jobs/:id/estimates',
    requirePermission('job_cards.write'),
    handle((req) => service.requestEstimate(Number(req.params.id), req.body, req.user.id)),
  );
  router.post(
    '/estimates/:id/decision',
    requirePermission('job_cards.write'),
    handle((req) => service.decide(Number(req.params.id), req.body, req.user.id)),
  );
  return router;
}
