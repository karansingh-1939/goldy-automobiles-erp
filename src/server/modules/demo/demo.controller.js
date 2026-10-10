import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { isDemoMode, toggleDemoMode, demoDbFile } from '../../database/connection.js';
import { runMigrations, MigrationRunner } from '../../database/migration-runner.js';
import { BackupService } from '../../database/backup-service.js';
import { runSeeds } from '../../database/seed-runner.js';
import { seedDemoDatabase } from '../../database/demo-seeder.js';
import { DbSafetyService } from '../../database/db-safety-service.js';
import { AppError } from '../../shared/errors/app-error.js';

const businessTables = [
  'customers',
  'vehicles',
  'suppliers',
  'warehouses',
  'inventory_categories',
  'inventory_items',
  'inventory_batches',
  'inventory_transactions',
  'stock_adjustments',
  'stock_transfers',
  'purchase_orders',
  'purchase_receipts',
  'purchase_items',
  'purchase_returns',
  'purchase_return_items',
  'supplier_ledgers',
  'technicians',
  'job_cards',
  'job_card_items',
  'job_card_labour',
  'job_card_assignments',
  'invoices',
  'invoice_items',
  'expenses',
  'gst_records',
  'profit_records',
  'fixed_assets',
  'stock_verifications',
  'companies',
  'account_groups',
  'ledgers',
  'vouchers',
  'journal_entries',
  'ledger_balances',
  'financial_years',
  'locked_periods',
  'direct_invoices',
  'direct_invoice_items',
  'customer_receipts',
  'receipt_allocations',
  'purchase_bills',
  'purchase_bill_items',
  'supplier_payments',
  'supplier_allocations',
  'gst_period_locks',
  'inventory_reservations',
  'quotations',
  'quotation_items',
  'sales_orders',
  'sales_order_items',
  'sales_shipments',
  'sales_shipment_items',
  'warranty_registrations',
  'warranty_claims',
  'customer_returns',
  'customer_return_items',
  'supplier_returns',
  'supplier_return_items',
  'loyalty_memberships',
  'loyalty_ledger',
  'customer_referrals',
  'promotions',
  'service_reminders',
];

export class DemoController {
  constructor(db) {
    this.db = db;
    this.changingMode = false;
  }

  getStatus = (req, res) => {
    res.status(200).json({ status: 'success', data: { demoMode: isDemoMode() } });
  };

  assertMaintenanceAvailable() {
    const activePath = this.db.name;
    const directory = path.dirname(activePath);
    if (
      this.changingMode ||
      fs.existsSync(path.join(directory, 'restore.lock')) ||
      fs.existsSync(`${activePath}.backup.lock`)
    ) {
      throw new AppError(
        'Database maintenance is already in progress.',
        409,
        'MAINTENANCE_IN_PROGRESS',
      );
    }
  }

  assertDemoDatabase() {
    if (!isDemoMode() || path.resolve(this.db.name) !== path.resolve(demoDbFile)) {
      throw new AppError(
        'This operation is available only for the demo database.',
        400,
        'DEMO_MODE_REQUIRED',
      );
    }
  }

  toggleMode = async (req, res, next) => {
    try {
      if (typeof req.body.enable !== 'boolean')
        throw new AppError('enable must be a boolean.', 400, 'VALIDATION_ERROR');
      this.assertMaintenanceAvailable();
      this.changingMode = true;
      if (req.body.enable) await this.ensureDemoInitialized();
      const demoMode = toggleDemoMode(req.body.enable);
      res.status(200).json({ status: 'success', data: { demoMode } });
    } catch (error) {
      next(error);
    } finally {
      this.changingMode = false;
    }
  };

  loadData = async (req, res, next) => {
    let demoDb;
    try {
      this.assertMaintenanceAvailable();
      this.assertDemoDatabase();
      demoDb = new Database(demoDbFile, { fileMustExist: true });
      demoDb.pragma('foreign_keys = ON');
      await seedDemoDatabase(demoDb);
      res.status(200).json({ status: 'success', message: 'Demo data loaded successfully.' });
    } catch (error) {
      next(error);
    } finally {
      demoDb?.close();
    }
  };

  clearData = async (req, res, next) => this.rebuildDemo(res, next, false);
  resetDb = async (req, res, next) => this.rebuildDemo(res, next, true);

  async rebuildDemo(res, next, seedData) {
    try {
      this.assertMaintenanceAvailable();
      this.assertDemoDatabase();
      this.changingMode = true;
      toggleDemoMode(false);
      await this._initializeDemoDb({ seedData });
      toggleDemoMode(true);
      res.status(200).json({
        status: 'success',
        message: seedData
          ? 'Demo database reset and seeded successfully.'
          : 'Demo database cleared successfully.',
      });
    } catch (error) {
      next(error);
    } finally {
      this.changingMode = false;
    }
  }

  exportJsonData = (req, res, next) => {
    try {
      const existing = new Set(
        this.db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => row.name),
      );
      const data = {};
      this.db.transaction(() => {
        for (const table of businessTables) {
          if (existing.has(table)) data[table] = this.db.prepare(`SELECT * FROM "${table}"`).all();
        }
      })();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=goldy_business_data_${Date.now()}.json`,
      );
      res.status(200).send(JSON.stringify(data, null, 2));
    } catch (error) {
      next(error);
    }
  };

  importJsonData = (req, res, next) => {
    next(
      new AppError(
        'JSON imports are disabled. Restore a verified ERP SQLite backup instead.',
        400,
        'JSON_IMPORT_DISABLED',
      ),
    );
  };

  async ensureDemoInitialized() {
    if (!fs.existsSync(demoDbFile)) return this._initializeDemoDb();
    const existing = new Database(demoDbFile, { fileMustExist: true });
    let empty;
    try {
      empty =
        existing
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .get().count === 0;
      if (!empty) {
        existing.pragma('foreign_keys = ON');
        if (
          existing
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'system_settings'",
            )
            .get()
        ) {
          existing
            .prepare(
              "INSERT INTO system_settings (key, value) VALUES ('database.mode', 'demo') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            )
            .run();
        }
        new MigrationRunner(existing, new BackupService(existing)).run();
        existing
          .prepare(
            "INSERT INTO system_settings (key, value) VALUES ('database.mode', 'demo') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          )
          .run();
      }
    } finally {
      existing.close();
    }
    if (empty) return this._initializeDemoDb();
  }

  async _initializeDemoDb({ seedData = true } = {}) {
    fs.mkdirSync(path.dirname(demoDbFile), { recursive: true });
    const temporary = `${demoDbFile}.${randomUUID()}.tmp`;
    const previous = `${demoDbFile}.${randomUUID()}.previous`;
    let demoDb;
    try {
      demoDb = new Database(temporary);
      demoDb.pragma('foreign_keys = ON');
      demoDb.pragma('journal_mode = WAL');
      demoDb.pragma('synchronous = NORMAL');
      demoDb.pragma('busy_timeout = 10000');
      DbSafetyService.verifyConfiguration(demoDb);
      runMigrations(demoDb);
      await runSeeds(demoDb);
      demoDb
        .prepare(
          "INSERT INTO system_settings (key, value) VALUES ('database.mode', 'demo') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run();
      if (seedData) await seedDemoDatabase(demoDb);
      else {
        const role = demoDb.prepare("SELECT id FROM roles WHERE name = 'Admin'").get();
        demoDb
          .prepare('INSERT INTO users (name, username, password_hash, role_id) VALUES (?, ?, ?, ?)')
          .run('Demo Administrator', 'admin', bcrypt.hashSync('Admin@12345', 12), role.id);
      }
      const foreignKeys = demoDb.pragma('foreign_key_check');
      if (foreignKeys.length) throw new Error('Demo data failed foreign-key validation.');
      demoDb.close();
      demoDb = null;
      if (fs.existsSync(demoDbFile)) {
        const existing = new Database(demoDbFile, { fileMustExist: true });
        try {
          const checkpoint = existing.pragma('wal_checkpoint(TRUNCATE)')[0];
          if (checkpoint?.busy)
            throw new AppError(
              'Close other demo database readers before resetting.',
              409,
              'DEMO_DATABASE_BUSY',
            );
        } finally {
          existing.close();
        }
      }
      if (fs.existsSync(demoDbFile)) fs.renameSync(demoDbFile, previous);
      try {
        fs.renameSync(temporary, demoDbFile);
      } catch (error) {
        if (fs.existsSync(previous)) fs.renameSync(previous, demoDbFile);
        throw error;
      }
      if (fs.existsSync(previous)) fs.unlinkSync(previous);
    } finally {
      demoDb?.close();
      for (const file of [temporary, `${temporary}-wal`, `${temporary}-shm`]) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
    }
  }
}
