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

  // Autocomplete and Lookup APIs
  router.get('/autocomplete/vehicles', requirePermission('job_cards.read'), (req, res, next) => {
    try {
      const q = `%${req.query.q || ''}%`;
      const rows = db.prepare(`
        SELECT
          v.*,
          c.name AS customer_name,
          c.phone AS customer_phone,
          c.address AS customer_address,
          c.city AS customer_city,
          c.notes AS customer_notes,
          (SELECT COUNT(*) FROM vehicles WHERE customer_id = c.id) AS customer_vehicle_count,
          (SELECT COUNT(*) FROM job_cards WHERE customer_id = c.id) AS customer_job_card_count,
          (SELECT MAX(opened_at) FROM job_cards WHERE customer_id = c.id) AS customer_last_visit_at
        FROM vehicles v
        JOIN customers c ON c.id = v.customer_id
        WHERE v.registration_number LIKE ?
        ORDER BY
          customer_last_visit_at DESC,
          customer_job_card_count DESC,
          v.registration_number ASC
        LIMIT 10
      `).all(q);
      res.status(200).json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/autocomplete/customers', requirePermission('job_cards.read'), (req, res, next) => {
    try {
      const q = `%${req.query.q || ''}%`;
      const rows = db.prepare(`
        SELECT
          c.*,
          (SELECT COUNT(*) FROM vehicles WHERE customer_id = c.id) AS vehicle_count,
          (SELECT COUNT(*) FROM job_cards WHERE customer_id = c.id) AS job_card_count,
          (SELECT MAX(opened_at) FROM job_cards WHERE customer_id = c.id) AS last_visit_at
        FROM customers c
        WHERE c.name LIKE ? OR c.phone LIKE ?
        ORDER BY
          last_visit_at DESC,
          job_card_count DESC,
          c.name ASC
        LIMIT 10
      `).all(q, q);
      res.status(200).json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/vehicles/lookup', requirePermission('job_cards.read'), (req, res, next) => {
    try {
      const reg = req.query.registration_number;
      if (!reg) {
        return res.status(400).json({ error: { message: 'registration_number is required.' } });
      }

      const vehicle = db.prepare(`
        SELECT
          v.*,
          c.name AS customer_name,
          c.phone AS customer_phone,
          c.address AS customer_address,
          c.city AS customer_city,
          c.notes AS customer_notes,
          (SELECT COUNT(*) FROM vehicles WHERE customer_id = c.id) AS customer_vehicle_count,
          (SELECT COUNT(*) FROM job_cards WHERE customer_id = c.id) AS customer_job_card_count,
          (SELECT MAX(opened_at) FROM job_cards WHERE customer_id = c.id) AS customer_last_visit_at
        FROM vehicles v
        JOIN customers c ON c.id = v.customer_id
        WHERE v.registration_number = ? COLLATE NOCASE
      `).get(reg);

      if (!vehicle) {
        return res.status(200).json({ data: null });
      }

      const totalJobCards = db.prepare('SELECT COUNT(*) AS count FROM job_cards WHERE vehicle_id = ?').get(vehicle.id).count;
      const lastJobCard = db.prepare('SELECT * FROM job_cards WHERE vehicle_id = ? ORDER BY id DESC LIMIT 1').get(vehicle.id);
      const outstandingBalance = db.prepare("SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS balance FROM invoices WHERE vehicle_id = ? AND status = 'FINALIZED'").get(vehicle.id).balance;

      const lastServiceDate = lastJobCard ? (lastJobCard.closed_at || lastJobCard.opened_at) : null;
      const lastOdometer = lastJobCard ? lastJobCard.odometer_reading : vehicle.odometer_reading;

      let nextServiceDate = null;
      if (lastServiceDate) {
        const d = new Date(lastServiceDate);
        d.setMonth(d.getMonth() + 6);
        nextServiceDate = d.toISOString().slice(0, 10);
      }
      const nextServiceOdometer = lastOdometer + 5000;

      res.status(200).json({
        data: {
          ...vehicle,
          vehicleStats: {
            lastServiceDate,
            lastOdometer,
            nextServiceDate,
            nextServiceOdometer,
            totalJobCards,
            lastComplaint: lastJobCard ? lastJobCard.complaint : null,
            outstandingBalance,
          }
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/customers/:id/details', requirePermission('job_cards.read'), (req, res, next) => {
    try {
      const customerId = Number(req.params.id);
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      if (!customer) {
        return res.status(404).json({ error: { message: 'Customer not found.' } });
      }
      const vehicles = db.prepare('SELECT * FROM vehicles WHERE customer_id = ?').all(customerId);
      const stats = db.prepare(`
        SELECT
          COUNT(id) AS job_card_count,
          MAX(opened_at) AS last_visit_at
        FROM job_cards
        WHERE customer_id = ?
      `).get(customerId);

      res.status(200).json({
        data: {
          ...customer,
          vehicle_count: vehicles.length,
          job_card_count: stats.job_card_count,
          last_visit_at: stats.last_visit_at,
          vehicles,
        }
      });
    } catch (err) {
      next(err);
    }
  });

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
