import fs from 'node:fs';
import Database from 'better-sqlite3';
import { isDemoMode, toggleDemoMode, demoDbFile } from '../../database/connection.js';
import { runMigrations } from '../../database/migrationRunner.js';
import { runSeeds } from '../../database/seedRunner.js';
import { seedDemoDatabase } from '../../database/demoSeeder.js';
import { DbSafetyService } from '../../database/dbSafetyService.js';

export class DemoController {
  constructor(db) {
    this.db = db;
  }

  getStatus = async (req, res, next) => {
    try {
      res.status(200).json({
        status: 'success',
        data: {
          demoMode: isDemoMode()
        }
      });
    } catch (err) {
      next(err);
    }
  };

  toggleMode = async (req, res, next) => {
    try {
      const { enable } = req.body;
      const willBeDemo = !!enable;
      
      if (willBeDemo) {
        const demoDbExists = fs.existsSync(demoDbFile);
        if (!demoDbExists) {
          await this._initializeDemoDb();
        }
      }
      
      const activeState = toggleDemoMode(willBeDemo);
      
      res.status(200).json({
        status: 'success',
        data: {
          demoMode: activeState
        }
      });
    } catch (err) {
      next(err);
    }
  };

  loadData = async (req, res, next) => {
    try {
      if (!isDemoMode()) {
        return res.status(400).json({
          status: 'error',
          error: { message: 'Demo mode is not active. Cannot load demo data in production.' }
        });
      }
      
      await seedDemoDatabase(this.db);
      
      res.status(200).json({
        status: 'success',
        message: 'Demo data loaded successfully.'
      });
    } catch (err) {
      next(err);
    }
  };

  clearData = async (req, res, next) => {
    try {
      if (!isDemoMode()) {
        return res.status(400).json({
          status: 'error',
          error: { message: 'Demo mode is not active. Cannot clear data in production.' }
        });
      }
      
      this.db.transaction(() => {
        this.db.prepare("DELETE FROM profit_records").run();
        this.db.prepare("DELETE FROM invoice_items").run();
        this.db.prepare("DELETE FROM invoices").run();
        this.db.prepare("DELETE FROM job_card_items").run();
        this.db.prepare("DELETE FROM job_card_labour").run();
        this.db.prepare("DELETE FROM job_cards").run();
        this.db.prepare("DELETE FROM expenses").run();
        this.db.prepare("DELETE FROM inventory_transactions").run();
        this.db.prepare("DELETE FROM vehicles").run();
        this.db.prepare("DELETE FROM customers").run();
        
        // Reset inventory quantities
        this.db.prepare("UPDATE inventory_batches SET quantity = 0").run();
        this.db.prepare("UPDATE inventory_items SET current_quantity = 0").run();
      })();
      
      res.status(200).json({
        status: 'success',
        message: 'Demo transaction data cleared successfully.'
      });
    } catch (err) {
      next(err);
    }
  };

  resetDb = async (req, res, next) => {
    try {
      if (!isDemoMode()) {
        return res.status(400).json({
          status: 'error',
          error: { message: 'Demo mode is not active. Cannot reset database in production.' }
        });
      }
      
      toggleDemoMode(false);
      
      if (fs.existsSync(demoDbFile)) {
        try {
          fs.unlinkSync(demoDbFile);
          const wal = `${demoDbFile}-wal`;
          const shm = `${demoDbFile}-shm`;
          if (fs.existsSync(wal)) fs.unlinkSync(wal);
          if (fs.existsSync(shm)) fs.unlinkSync(shm);
        } catch (e) {
          console.warn('Failed to delete demo sqlite file, trying to clean up tables instead:', e);
        }
      }
      
      await this._initializeDemoDb();
      toggleDemoMode(true);
      
      res.status(200).json({
        status: 'success',
        message: 'Demo database reset and seeded successfully.'
      });
    } catch (err) {
      next(err);
    }
  };

  exportJsonData = async (req, res, next) => {
    try {
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'seed_history' AND name NOT LIKE 'migrations'").all().map(r => r.name);
      
      const data = {};
      for (const table of tables) {
        data[table] = this.db.prepare(`SELECT * FROM "${table}"`).all();
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=goldy_business_data_${Date.now()}.json`);
      res.status(200).send(JSON.stringify(data, null, 2));
    } catch (err) {
      next(err);
    }
  };

  importJsonData = async (req, res, next) => {
    try {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({
          status: 'error',
          error: { message: 'Invalid JSON data payload.' }
        });
      }
      
      this.db.transaction(() => {
        this.db.pragma('foreign_keys = OFF');
        
        for (const [table, rows] of Object.entries(data)) {
          const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
          if (!tableExists) continue;
          
          this.db.prepare(`DELETE FROM "${table}"`).run();
          
          if (rows.length === 0) continue;
          
          const columns = Object.keys(rows[0]);
          const placeholders = columns.map(() => '?').join(', ');
          const sql = `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
          const stmt = this.db.prepare(sql);
          
          for (const row of rows) {
            const values = columns.map(col => row[col]);
            stmt.run(...values);
          }
        }
        
        this.db.pragma('foreign_keys = ON');
      })();
      
      res.status(200).json({
        status: 'success',
        message: 'Business data imported successfully.'
      });
    } catch (err) {
      next(err);
    }
  };

  async _initializeDemoDb() {
    const demoDb = new Database(demoDbFile);
    try {
      demoDb.pragma('foreign_keys = ON');
      demoDb.pragma('journal_mode = WAL');
      demoDb.pragma('synchronous = NORMAL');
      DbSafetyService.verifyConfiguration(demoDb);
      
      runMigrations(demoDb);
      await runSeeds(demoDb);
      await seedDemoDatabase(demoDb);
    } finally {
      demoDb.close();
    }
  }
}
