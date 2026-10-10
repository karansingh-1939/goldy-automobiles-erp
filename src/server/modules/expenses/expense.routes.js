import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/auth-middleware.js';
import { ExpenseController } from './expense.controller.js';
import { createExpenseService } from './expense.service.js';

export function createExpenseRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new ExpenseController(createExpenseService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);

  router.get('/', requirePermission('expenses.read'), controller.list);
  router.get('/:id', requirePermission('expenses.read'), controller.get);
  router.post('/', requirePermission('expenses.write'), controller.create);
  router.patch('/:id', requirePermission('expenses.write'), controller.update);
  router.delete('/:id', requirePermission('expenses.write'), controller.delete);

  return router;
}
