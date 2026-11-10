import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/auth-middleware.js';
import { StaffPayService } from './staff-pay.service.js';

export function createStaffPayRouter(db) {
  const router = Router();
  const service = new StaffPayService(db);
  router.use(authenticate(createAuthService(db)));
  const handle = (status, fn) => (req, res, next) => {
    try {
      res.status(status).json({ data: fn(req) });
    } catch (error) {
      next(error);
    }
  };

  router.get(
    '/',
    requirePermission('accounting.read'),
    handle(200, (req) => service.summary(req.query.month)),
  );
  router.get(
    '/:id/history',
    requirePermission('accounting.read'),
    handle(200, (req) => service.history(req.params.id)),
  );
  router.patch(
    '/:id/salary',
    requirePermission('accounting.write'),
    handle(200, (req) => service.setMonthlySalary(req.params.id, req.body, req.user.id)),
  );
  router.post(
    '/:id/advance',
    requirePermission('accounting.write'),
    handle(201, (req) => service.giveAdvance(req.params.id, req.body, req.user.id)),
  );
  router.post(
    '/:id/pay',
    requirePermission('accounting.write'),
    handle(201, (req) => service.paySalary(req.params.id, req.body, req.user.id)),
  );
  return router;
}
