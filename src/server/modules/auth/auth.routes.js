import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth-middleware.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';

export function createAuthRouter(db) {
  const router = Router();
  const repository = new AuthRepository(db);
  const service = new AuthService(repository);
  const controller = new AuthController(service);
  const requireAuth = authenticate(service);

  router.get('/setup-status', controller.getSetupStatus);
  router.post('/setup', controller.setup);
  router.post('/forgot-password', controller.forgotPassword);
  router.post('/login', controller.login);
  router.post('/logout', requireAuth, controller.logout);
  router.get('/me', requireAuth, controller.me);

  return router;
}

export function createAuthService(db) {
  return new AuthService(new AuthRepository(db));
}
