import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './database/connection.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { createExpenseRouter } from './modules/expenses/expense.routes.js';
import { createInventoryRouter } from './modules/inventory/inventory.routes.js';
import { createJobCardRouter } from './modules/job-cards/job-card.routes.js';
import { registerMasterRoutes } from './modules/masters/master.routes.js';
import { createProfitRouter } from './modules/profit/profit.routes.js';
import { createPurchasingRouter } from './modules/purchasing/purchasing.routes.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { createGstRouter } from './modules/gst/gst.routes.js';
import { createServiceHistoryRouter } from './modules/service-history/service-history.routes.js';
import { createBackupRouter } from './modules/backup/backup.routes.js';
import { createTechnicianRouter } from './modules/technicians/technician.routes.js';
import { createAuditRouter } from './modules/audit/audit.routes.js';
import { createDemoRouter } from './modules/demo/demo.routes.js';
import { createAccountingRouter } from './modules/accounting/accounting.routes.js';
import { createSalesOrdersRouter } from './modules/sales-orders/sales-order.routes.js';
import { createReturnsRouter } from './modules/returns/returns.routes.js';
import { createWarrantyRouter } from './modules/warranties/warranty.routes.js';
import { createCrmRouter } from './modules/crm/crm.routes.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../../dist/renderer');

export function createApp({ db: rawDb = getDatabase(), backupScheduler } = {}) {
  const isGlobalDb = rawDb === getDatabase();

  const db = new Proxy(
    {},
    {
      get(target, prop) {
        const activeDb = isGlobalDb ? getDatabase() : rawDb;
        const value = Reflect.get(activeDb, prop);
        if (typeof value === 'function') {
          return value.bind(activeDb);
        }
        return value;
      },
      set(target, prop, value) {
        const activeDb = isGlobalDb ? getDatabase() : rawDb;
        return Reflect.set(activeDb, prop, value);
      },
    },
  );

  const app = express();

  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  const authRepository = new AuthRepository(db);
  const authService = new AuthService(authRepository);

  // Centralized authentication page protection middleware
  app.use((req, res, next) => {
    const filePath = req.path;
    const isHtml = filePath.endsWith('.html') && filePath !== '/index.html';
    const isRoot = filePath === '/';

    if (isHtml || isRoot) {
      const cookieHeader = req.headers.cookie || '';
      const match = cookieHeader.match(/goldy_session_token=([^;]+)/);
      const token = match ? match[1] : null;

      let user = null;
      if (token) {
        try {
          user = authService.getUserByToken(token);
        } catch (e) {
          // Treat invalid token as unauthenticated
        }
      }

      if (isRoot) return next();

      if (isHtml) {
        if (!user) {
          return res.redirect('/index.html');
        }
        // Enforce cache control on protected pages
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return next();
      }
    }

    return next();
  });

  app.use(express.static(publicDir));

  app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/v1/settings/company', (req, res) => {
    try {
      const settings = db
        .prepare("SELECT key, value FROM system_settings WHERE key LIKE 'company.%'")
        .all();
      const companyConfig = {};
      settings.forEach((s) => {
        companyConfig[s.key] = s.value;
      });
      res.status(200).json({
        status: 'success',
        data: {
          name: companyConfig['company.name'] || 'GOLDY AUTOMOBILE',
          address:
            companyConfig['company.address'] || 'Opp. Randhir Cinema, Kunjpura Road, KARNAL-132001',
          phone: companyConfig['company.phone'] || '0184-2206673, 94160-30673',
          email: companyConfig['company.email'] || '',
          gstin: companyConfig['company.gstin'] || '',
          jobCardTerms:
            companyConfig['company.job_card_terms'] ||
            "Vehicle stored repaired & driven at customer's risk.",
        },
      });
    } catch (err) {
      res.status(500).json({ error: { message: err.message } });
    }
  });

  app.use('/api/v1/auth', createAuthRouter(db));
  app.use('/api/v1/expenses', createExpenseRouter(db));
  app.use('/api/v1/inventory', createInventoryRouter(db));
  app.use('/api/v1/profit', createProfitRouter(db));
  app.use('/api/v1/dashboard', createDashboardRouter(db));
  app.use('/api/v1/gst', createGstRouter(db));
  app.use('/api/v1/backups', createBackupRouter(db, backupScheduler));
  app.use('/api/v1/technicians', createTechnicianRouter(db));
  app.use('/api/v1/audit-logs', createAuditRouter(db));
  app.use('/api/v1', createServiceHistoryRouter(db));
  app.use('/api/v1', createJobCardRouter(db));
  app.use('/api/v1/purchases', createPurchasingRouter(db));
  app.use('/api/v1/demo', createDemoRouter(db));
  app.use('/api/v1/accounting', createAccountingRouter(db));
  app.use('/api/v1/sales-orders', createSalesOrdersRouter(db, authService));
  app.use('/api/v1/returns', createReturnsRouter(db));
  app.use('/api/v1/warranties', createWarrantyRouter(db));
  app.use('/api/v1/crm', createCrmRouter(db));
  registerMasterRoutes(app, db);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
