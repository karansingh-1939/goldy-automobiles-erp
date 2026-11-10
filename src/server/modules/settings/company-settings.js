import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/auth-middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { AuditRepository } from '../audit/audit.repository.js';

// GST state codes (first two digits of a GSTIN).
export const GST_STATES = Object.freeze({
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  10: 'Bihar',
  11: 'Sikkim',
  12: 'Arunachal Pradesh',
  13: 'Nagaland',
  14: 'Manipur',
  15: 'Mizoram',
  16: 'Tripura',
  17: 'Meghalaya',
  18: 'Assam',
  19: 'West Bengal',
  20: 'Jharkhand',
  21: 'Odisha',
  22: 'Chhattisgarh',
  23: 'Madhya Pradesh',
  24: 'Gujarat',
  26: 'Dadra and Nagar Haveli and Daman and Diu',
  27: 'Maharashtra',
  29: 'Karnataka',
  30: 'Goa',
  31: 'Lakshadweep',
  32: 'Kerala',
  33: 'Tamil Nadu',
  34: 'Puducherry',
  35: 'Andaman and Nicobar Islands',
  36: 'Telangana',
  37: 'Andhra Pradesh',
  38: 'Ladakh',
});

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const DEFAULTS = {
  name: 'GOLDY AUTOMOBILE',
  address: '',
  phone: '',
  email: '',
  gstin: '',
  state: 'Haryana',
  jobCardTerms: "Vehicle stored repaired & driven at customer's risk.",
  invoiceTerms: '',
};
const KEYS = {
  name: 'company.name',
  address: 'company.address',
  phone: 'company.phone',
  email: 'company.email',
  gstin: 'company.gstin',
  state: 'company.state',
  jobCardTerms: 'company.job_card_terms',
  invoiceTerms: 'company.invoice_terms',
};

export class CompanySettingsService {
  constructor(db, auditRepository = new AuditRepository(db)) {
    this.db = db;
    this.auditRepository = auditRepository;
  }

  get() {
    const rows = this.db
      .prepare("SELECT key, value FROM system_settings WHERE key LIKE 'company.%'")
      .all();
    const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const company = this.db.prepare('SELECT state FROM companies WHERE id = 1').get();
    const profile = Object.fromEntries(
      Object.entries(KEYS).map(([field, key]) => [field, stored[key] || DEFAULTS[field]]),
    );
    if (!stored[KEYS.state] && company?.state) profile.state = company.state;
    profile.stateCode = stateCodeFor(profile.state);
    return profile;
  }

  update(payload = {}, userId = null) {
    const next = this.validate({ ...this.get(), ...payload });
    const previous = this.get();
    this.db.transaction(() => {
      const upsert = this.db.prepare(
        `INSERT INTO system_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      );
      for (const [field, key] of Object.entries(KEYS)) upsert.run(key, next[field]);
      // Accounting and GST read the company row; keep it in step with the profile.
      this.db
        .prepare(
          `UPDATE companies SET name = ?, address = ?, phone = ?, email = ?, gstin = ?, state = ?,
             gstin_state_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        )
        .run(
          next.name,
          next.address || next.name,
          next.phone || null,
          next.email || null,
          next.gstin || null,
          next.state,
          stateCodeFor(next.state),
        );
      this.auditRepository.create({
        userId,
        action: 'UPDATE',
        entityType: 'company_settings',
        entityId: 1,
        oldValue: previous,
        newValue: next,
      });
    })();
    return this.get();
  }

  validate(input) {
    const clean = (value, max) =>
      String(value ?? '')
        .trim()
        .slice(0, max);
    const profile = {
      name: clean(input.name, 120),
      address: clean(input.address, 300),
      phone: clean(input.phone, 80),
      email: clean(input.email, 120),
      gstin: clean(input.gstin, 15).toUpperCase(),
      state: clean(input.state, 60),
      jobCardTerms: clean(input.jobCardTerms, 1000),
      invoiceTerms: clean(input.invoiceTerms, 1000),
    };
    const fail = (message) => {
      throw new AppError(message, 400, 'VALIDATION_ERROR');
    };
    if (!profile.name) fail('Workshop name is required.');
    if (!profile.address) fail('Address is required; it is printed on every bill.');
    if (!stateCodeFor(profile.state)) fail('Choose a valid Indian state.');
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
      fail('Email address is not valid.');
    if (profile.gstin) {
      if (!GSTIN_PATTERN.test(profile.gstin))
        fail('GSTIN must be 15 characters, e.g. 06ABCDE1234F1Z5.');
      if (profile.gstin.slice(0, 2) !== stateCodeFor(profile.state))
        fail(
          `GSTIN starts with ${profile.gstin.slice(0, 2)}, which does not match ${profile.state}.`,
        );
    }
    return profile;
  }
}

export function stateCodeFor(state) {
  const wanted = String(state || '')
    .trim()
    .toLowerCase();
  const match = Object.entries(GST_STATES).find(([, name]) => name.toLowerCase() === wanted);
  return match ? String(match[0]).padStart(2, '0') : null;
}

export function createCompanySettingsRouter(db) {
  const router = Router();
  const service = new CompanySettingsService(db);
  const requireAuth = authenticate(createAuthService(db));

  // Read stays open to local pages such as the printed job card; the API only listens on loopback.
  router.get('/', (req, res, next) => {
    try {
      res.status(200).json({ status: 'success', data: service.get() });
    } catch (error) {
      next(error);
    }
  });
  router.get('/states', (req, res) => {
    res.status(200).json({
      data: Object.entries(GST_STATES).map(([code, name]) => ({
        code: String(code).padStart(2, '0'),
        name,
      })),
    });
  });
  router.put('/', requireAuth, requirePermission('settings.write'), (req, res, next) => {
    try {
      res.status(200).json({ status: 'success', data: service.update(req.body, req.user.id) });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
