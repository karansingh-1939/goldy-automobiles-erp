import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/auth-middleware.js';
import { GstController } from './gst.controller.js';
import { createGstService } from './gst.service.js';
import { Gstr1ExportService } from './gstr1-export.service.js';

export function createGstRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const controller = new GstController(createGstService(db));
  const requireAuth = authenticate(authService);

  router.use(requireAuth);
  router.use(requirePermission('gst.read'));

  router.get('/summary', controller.summary);
  router.get('/gstr1', controller.gstr1);
  router.get('/gstr3b', controller.gstr3b);
  router.get('/hsn-summary', controller.hsnSummary);

  // GSTR-1 files for the CA (CSV opens in Excel)
  const gstr1Export = new Gstr1ExportService(db);
  router.get('/gstr1-export', (req, res, next) => {
    try {
      const built = gstr1Export.build(req.query);
      res.status(200).json({
        filters: built.filters,
        data: Object.fromEntries(
          ['b2b', 'b2cs', 'cdn', 'hsn', 'docs'].map((key) => [key, built[key]]),
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  router.get('/gstr1-export/:section.csv', (req, res, next) => {
    try {
      const body = gstr1Export.csv(req.params.section, req.query);
      const from = String(req.query.dateFrom || req.query.from || '').replaceAll('-', '');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="GSTR1_${req.params.section}_${from || 'period'}.csv"`,
      );
      res.status(200).send(body);
    } catch (error) {
      next(error);
    }
  });

  // Period Locks endpoints
  router.get('/locks', controller.getPeriodLocks);
  router.post('/locks', requirePermission('gst.write'), controller.updatePeriodLock);

  return router;
}
