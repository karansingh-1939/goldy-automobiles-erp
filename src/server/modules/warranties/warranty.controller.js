import { WarrantyService } from './warranty.service.js';

export class WarrantyController {
  constructor(db) {
    this.service = new WarrantyService(db);
  }

  registerWarranty = async (req, res, next) => {
    try {
      const data = this.service.registerWarranty(req.body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  };

  fileClaim = async (req, res, next) => {
    try {
      const data = this.service.fileClaim(req.body, req.user?.id || 1);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  };

  settleClaim = async (req, res, next) => {
    try {
      const data = this.service.settleClaim(Number(req.params.id), req.body, req.user?.id || 1);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };

  rejectClaim = async (req, res, next) => {
    try {
      const data = this.service.rejectClaim(Number(req.params.id), req.body, req.user?.id || 1);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };

  getWarrantyRegistrationById = async (req, res, next) => {
    try {
      const data = this.service.repository.findWarrantyRegistrationById(Number(req.params.id));
      if (!data) {
        return res.status(404).json({ error: { message: 'Warranty registration not found.' } });
      }
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };

  listWarrantyRegistrations = async (req, res, next) => {
    try {
      const query = {
        companyId: req.query.companyId ? Number(req.query.companyId) : 1,
        customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
        vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : undefined,
        itemId: req.query.itemId ? Number(req.query.itemId) : undefined,
        status: req.query.status,
      };
      const data = this.service.repository.listWarrantyRegistrations(query);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };

  getWarrantyClaimById = async (req, res, next) => {
    try {
      const data = this.service.repository.findWarrantyClaimById(Number(req.params.id));
      if (!data) {
        return res.status(404).json({ error: { message: 'Warranty claim not found.' } });
      }
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };

  listWarrantyClaims = async (req, res, next) => {
    try {
      const query = {
        companyId: req.query.companyId ? Number(req.query.companyId) : 1,
        status: req.query.status,
      };
      const data = this.service.repository.listWarrantyClaims(query);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };

  lookupWarranty = async (req, res, next) => {
    try {
      const data = this.service.lookupWarranty(req.query);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  };

  // REPORTS
  getStatusCountReport = async (req, res, next) => {
    try {
      const companyId = req.query.companyId ? Number(req.query.companyId) : 1;
      const rows = this.service.db
        .prepare(
          `
        SELECT w.status, COUNT(*) as count
        FROM warranty_registrations w
        WHERE w.company_id = ?
        GROUP BY w.status
      `,
        )
        .all(companyId);
      res.status(200).json({ data: rows });
    } catch (error) {
      next(error);
    }
  };

  getFailureAnalysisReport = async (req, res, next) => {
    try {
      const companyId = req.query.companyId ? Number(req.query.companyId) : 1;
      const rows = this.service.db
        .prepare(
          `
        SELECT item.sku, item.item_name, COUNT(*) as claimCount
        FROM warranty_claims c
        JOIN warranty_registrations w ON c.warranty_registration_id = w.id
        JOIN inventory_items item ON w.item_id = item.id
        WHERE c.company_id = ?
        GROUP BY item.id
        ORDER BY claimCount DESC
      `,
        )
        .all(companyId);
      res.status(200).json({ data: rows });
    } catch (error) {
      next(error);
    }
  };
}
