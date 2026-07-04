import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';

export class BackupController {
  constructor(backupService, restoreService, backupScheduler) {
    this.backupService = backupService;
    this.restoreService = restoreService;
    this.backupScheduler = backupScheduler;
  }

  manualBackup = async (req, res, next) => {
    try {
      const backupLog = await this.backupService.backupDatabase({
        type: 'MANUAL',
        userId: req.user?.id
      });
      res.status(201).json({ data: backupLog });
    } catch (error) {
      next(error);
    }
  };

  list = (req, res, next) => {
    try {
      res.status(200).json(this.backupService.list(req.query));
    } catch (error) {
      next(error);
    }
  };

  getSettings = async (req, res, next) => {
    try {
      const settings = this.backupService.getSettings();
      res.status(200).json({ status: 'success', data: settings });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req, res, next) => {
    try {
      const settings = this.backupService.updateSettings(req.body);
      if (this.backupScheduler) {
        this.backupScheduler.restart();
      }
      res.status(200).json({ status: 'success', data: settings });
    } catch (error) {
      next(error);
    }
  };

  restoreDatabase = async (req, res, next) => {
    try {
      const { backupFilePath } = req.body;
      const result = await this.restoreService.restoreDatabase({
        backupFilePath,
        userId: req.user?.id
      });
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  restoreUploadedDatabase = async (req, res, next) => {
    try {
      const tempDir = path.join(env.appDataPath, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempFilePath = path.join(tempDir, `upload_restore_${Date.now()}.db`);
      const writeStream = fs.createWriteStream(tempFilePath);
      
      req.pipe(writeStream);
      
      writeStream.on('finish', async () => {
        try {
          const result = await this.restoreService.restoreDatabase({
            backupFilePath: tempFilePath,
            userId: req.user?.id
          });
          
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          
          res.status(200).json({ status: 'success', data: result });
        } catch (err) {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          next(err);
        }
      });
      
      writeStream.on('error', (err) => {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        next(err);
      });
    } catch (error) {
      next(error);
    }
  };

  restoreLatestBackup = async (req, res, next) => {
    try {
      const dbPath = env.dbFile;
      const resolvedDbPath = path.resolve(dbPath);
      const dbDir = path.dirname(resolvedDbPath);
      const baseDir = path.resolve(dbDir, '..');
      const backupsDir = path.join(baseDir, 'backups');

      if (!fs.existsSync(backupsDir)) {
        throw new Error('No backups directory found.');
      }

      const files = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('goldy_backup_') && f.endsWith('.db'))
        .sort(); // Alphabetic sort is chronological

      if (files.length === 0) {
        throw new Error('No backups found to restore.');
      }

      const latestBackup = files[files.length - 1];
      const backupFilePath = path.join(backupsDir, latestBackup);

      console.warn(`Restore Latest triggered. Resolving to newest backup: ${backupFilePath}`);

      const result = await this.restoreService.restoreDatabase({
        backupFilePath,
        userId: req.user?.id
      });

      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  purgeDemoData = async (req, res, next) => {
    try {
      // 1. Take a backup before deleting (Accidental Delete Protection)
      const backupLog = await this.backupService.backupDatabase({
        type: 'MANUAL',
        userId: req.user?.id
      });

      const db = this.backupService.db;
      const deleteTransaction = db.transaction(() => {
        // A. Delete profit records linked to demo invoices
        db.prepare(`
          DELETE FROM profit_records 
          WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_number LIKE 'INV-178%')
        `).run();

        // B. Delete demo invoices
        db.prepare(`
          DELETE FROM invoices 
          WHERE invoice_number LIKE 'INV-178%'
        `).run();

        // C. Delete demo job cards
        db.prepare(`
          DELETE FROM job_cards 
          WHERE job_card_number LIKE 'JC-178%'
        `).run();

        // D. Delete orphan inventory transactions
        db.prepare(`
          DELETE FROM inventory_transactions 
          WHERE reference_type = 'invoices' AND reference_id NOT IN (SELECT id FROM invoices)
        `).run();
        db.prepare(`
          DELETE FROM inventory_transactions 
          WHERE reference_type = 'job_cards' AND reference_id NOT IN (SELECT id FROM job_cards)
        `).run();
        db.prepare(`
          DELETE FROM inventory_transactions 
          WHERE transaction_type = 'Opening Stock' OR reference_type = 'system_seed' OR reference_type = 'opening_stock'
        `).run();

        // E. Delete opening stock batches
        db.prepare(`
          DELETE FROM inventory_batches 
          WHERE batch_number LIKE '%-OPEN' OR batch_number = 'BATCH-OPENING'
        `).run();

        // F. Delete demo vehicle
        db.prepare(`
          DELETE FROM vehicles 
          WHERE registration_number = 'OD02AB1234'
        `).run();

        // G. Delete demo customer
        db.prepare(`
          DELETE FROM customers 
          WHERE phone = '9876543210'
        `).run();

        // H. Delete demo suppliers
        db.prepare(`
          DELETE FROM suppliers 
          WHERE id IN (1, 2, 3, 4)
        `).run();

        // I. Reset and recalculate stock levels for all inventory items
        db.prepare('UPDATE inventory_items SET current_quantity = 0').run();
        db.prepare(`
          UPDATE inventory_items
          SET current_quantity = COALESCE((
            SELECT SUM(CASE WHEN direction = 'IN' THEN quantity ELSE -quantity END)
            FROM inventory_transactions
            WHERE inventory_transactions.item_id = inventory_items.id
          ), 0)
        `).run();
      });

      deleteTransaction();

      res.status(200).json({
        status: 'success',
        message: 'Demo data purged successfully.',
        backup: backupLog
      });
    } catch (error) {
      next(error);
    }
  };
}
