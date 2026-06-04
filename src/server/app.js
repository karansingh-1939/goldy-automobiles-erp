import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './database/connection.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createExpenseRouter } from './modules/expenses/expense.routes.js';
import { createInventoryRouter } from './modules/inventory/inventory.routes.js';
import { createJobCardRouter } from './modules/jobCards/jobCard.routes.js';
import { registerMasterRoutes } from './modules/masters/master.routes.js';
import { createProfitRouter } from './modules/profit/profit.routes.js';
import { createPurchasingRouter } from './modules/purchasing/purchasing.routes.js';
import { errorHandler, notFoundHandler } from './shared/middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../../public');

export function createApp({ db = getDatabase() } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(publicDir));

  app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/v1/auth', createAuthRouter(db));
  app.use('/api/v1/expenses', createExpenseRouter(db));
  app.use('/api/v1/inventory', createInventoryRouter(db));
  app.use('/api/v1/profit', createProfitRouter(db));
  app.use('/api/v1', createJobCardRouter(db));
  app.use('/api/v1/purchases', createPurchasingRouter(db));
  registerMasterRoutes(app, db);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
