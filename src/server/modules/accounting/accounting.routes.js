import { Router } from 'express';
import { createAuthService } from '../auth/auth.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authMiddleware.js';
import { AccountingPostingEngine } from './postingEngine.service.js';
import { AccountingReportService } from './accountingReport.service.js';
import { AllocationService } from './allocation.service.js';
import { CustomerReceiptService } from './customerReceipt.service.js';
import { DirectBillingService } from './directBilling.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { createInventoryService } from '../inventory/inventory.service.js';
import { SupplierService } from './supplier.service.js';
import { PurchaseBillService } from './purchaseBill.service.js';
import { SupplierPaymentService } from './supplierPayment.service.js';

export function createAccountingRouter(db) {
  const router = Router();
  const authService = createAuthService(db);
  const requireAuth = authenticate(authService);

  const postingEngine = new AccountingPostingEngine(db);
  const reportService = new AccountingReportService(db);
  const allocationService = new AllocationService(db);
  const receiptService = new CustomerReceiptService(db);
  const directBillingService = new DirectBillingService(db);
  const reconciliationService = new ReconciliationService(db);
  const inventoryService = createInventoryService(db);
  const supplierService = new SupplierService(db, postingEngine);
  const purchaseBillService = new PurchaseBillService(db, postingEngine, inventoryService);
  const supplierPaymentService = new SupplierPaymentService(db, postingEngine, allocationService);

  // Authenticate all routes
  router.use(requireAuth);

  // --- LEDGER MASTER READ ENDPOINT ---
  router.get('/ledgers', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1; // Default tenant
      const ledgers = db.prepare(`
        SELECT l.id, l.name, l.group_id, l.opening_balance, l.nature, l.system_key, ag.name AS group_name
        FROM ledgers l
        JOIN account_groups ag ON l.group_id = ag.id
        WHERE l.company_id = ?
        ORDER BY l.name ASC
      `).all(companyId);

      res.status(200).json({
        status: 'success',
        data: ledgers
      });
    } catch (err) {
      next(err);
    }
  });

  // --- DIRECT BILLING ENDPOINTS ---

  // List direct invoices
  router.get('/direct-invoices', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const { customerId, status } = req.query;

      let sql = `
        SELECT di.*, c.name AS customer_name
        FROM direct_invoices di
        JOIN customers c ON di.customer_id = c.id
        WHERE di.company_id = ?
      `;
      const params = [companyId];

      if (customerId) {
        sql += ' AND di.customer_id = ?';
        params.push(customerId);
      }
      if (status) {
        sql += ' AND di.status = ?';
        params.push(status);
      }

      sql += ' ORDER BY di.invoice_date DESC, di.id DESC';

      const invoices = db.prepare(sql).all(...params);
      res.status(200).json({ status: 'success', data: invoices });
    } catch (err) {
      next(err);
    }
  });

  // Create direct invoice
  router.post('/direct-invoices', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      const result = directBillingService.createDirectInvoice({
        companyId,
        customerId: req.body.customerId,
        invoiceDate: req.body.invoiceDate,
        items: req.body.items,
        narration: req.body.narration,
        createdBy: req.user.id
      });

      res.status(201).json({
        status: 'success',
        message: 'Direct invoice created successfully.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  // Get specific direct invoice
  router.get('/direct-invoices/:id', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const invoice = db.prepare('SELECT * FROM direct_invoices WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
      if (!invoice) {
        return res.status(404).json({ error: { message: 'Direct invoice not found.' } });
      }

      const items = db.prepare(`
        SELECT dii.*, ii.item_name, ii.sku
        FROM direct_invoice_items dii
        LEFT JOIN inventory_items ii ON dii.item_id = ii.id
        WHERE dii.direct_invoice_id = ?
      `).all(invoice.id);

      res.status(200).json({
        status: 'success',
        data: {
          ...invoice,
          items
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // Cancel direct invoice
  router.post('/direct-invoices/:id/cancel', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      directBillingService.cancelDirectInvoice(req.params.id, companyId, req.user.id);
      res.status(200).json({ status: 'success', message: 'Direct invoice cancelled successfully.' });
    } catch (err) {
      next(err);
    }
  });

  // --- CUSTOMER RECEIPTS & ALLOCATION ENDPOINTS ---

  // Get outstanding invoices and direct invoices for a customer
  router.get('/customers/:id/outstanding', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const list = allocationService.getOutstandingReceivables(companyId, req.params.id);
      res.status(200).json({ status: 'success', data: list });
    } catch (err) {
      next(err);
    }
  });

  // Record a customer receipt
  router.post('/receipts', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      const result = receiptService.createReceipt({
        companyId,
        customerId: req.body.customerId,
        receiptDate: req.body.receiptDate,
        amount: req.body.amount,
        paymentMode: req.body.paymentMode,
        bankLedgerId: req.body.bankLedgerId,
        narration: req.body.narration,
        createdBy: req.user.id,
        autoAllocate: req.body.autoAllocate
      });

      res.status(201).json({
        status: 'success',
        message: 'Receipt posted successfully.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  // Manually allocate receipt to outstanding invoices
  router.post('/receipts/:id/allocate', requirePermission('accounting.write'), (req, res, next) => {
    try {
      receiptService.allocateReceiptManual(req.params.id, req.body.allocations);
      res.status(200).json({ status: 'success', message: 'Receipt allocated successfully.' });
    } catch (err) {
      next(err);
    }
  });

  // Cancel receipt
  router.delete('/receipts/:id', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      receiptService.cancelReceipt(req.params.id, companyId);
      res.status(200).json({ status: 'success', message: 'Receipt cancelled successfully.' });
    } catch (err) {
      next(err);
    }
  });

  // --- MANUAL VOUCHER ENDPOINTS ---

  // List all vouchers with optional filters (startDate, endDate, type, search)
  router.get('/vouchers', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const { startDate, endDate, type, search } = req.query;

      let sql = 'SELECT * FROM vouchers WHERE company_id = ?';
      const params = [companyId];

      if (startDate) {
        sql += ' AND voucher_date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        sql += ' AND voucher_date <= ?';
        params.push(endDate);
      }
      if (type) {
        sql += ' AND voucher_type = ?';
        params.push(type);
      }
      if (search) {
        sql += ' AND (voucher_number LIKE ? OR narration LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY voucher_date DESC, id DESC';

      const vouchers = db.prepare(sql).all(...params);

      res.status(200).json({
        status: 'success',
        data: vouchers
      });
    } catch (err) {
      next(err);
    }
  });

  // Create a manual voucher (Contra, Receipt, Payment, Journal)
  router.post('/vouchers', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      const { voucherType, voucherDate, narration, entries } = req.body;

      const result = postingEngine.post({
        companyId,
        voucherType,
        voucherDate,
        narration,
        created_by: req.user.id,
        entries
      });

      res.status(201).json({
        status: 'success',
        message: 'Voucher posted successfully.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  // Fetch details of a specific voucher with all ledger posting lines
  router.get('/vouchers/:id', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
      if (!voucher) {
        return res.status(404).json({ error: { message: 'Voucher not found.' } });
      }

      const entries = db.prepare(`
        SELECT je.*, l.name AS ledger_name, l.nature AS ledger_nature
        FROM journal_entries je
        JOIN ledgers l ON je.ledger_id = l.id
        WHERE je.voucher_id = ?
        ORDER BY je.entry_type DESC, je.id ASC
      `).all(voucher.id);

      res.status(200).json({
        status: 'success',
        data: {
          ...voucher,
          entries
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // Cancel/delete a manual or integrated voucher
  router.delete('/vouchers/:id', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      postingEngine.deleteVoucher(companyId, req.params.id);

      res.status(200).json({
        status: 'success',
        message: 'Voucher cancelled and deleted successfully.'
      });
    } catch (err) {
      next(err);
    }
  });

  // --- REPORT ENDPOINTS ---

  // Live Trial Balance compilation
  router.get('/reports/trial-balance', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const { asOfDate } = req.query;

      const report = reportService.getTrialBalance(companyId, asOfDate);
      res.status(200).json({
        status: 'success',
        data: report
      });
    } catch (err) {
      next(err);
    }
  });

  // Live Profit & Loss statement compilation
  router.get('/reports/profit-loss', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const { startDate, endDate } = req.query;

      const report = reportService.getProfitLoss(companyId, startDate, endDate);
      res.status(200).json({
        status: 'success',
        data: report
      });
    } catch (err) {
      next(err);
    }
  });

  // Live Balance Sheet compilation
  router.get('/reports/balance-sheet', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const { asOfDate } = req.query;

      const report = reportService.getBalanceSheet(companyId, asOfDate);
      res.status(200).json({
        status: 'success',
        data: report
      });
    } catch (err) {
      next(err);
    }
  });

  // Detailed Ledger Transaction Statement (running ledgers details)
  router.get('/ledgers/:id/statement', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const { startDate, endDate } = req.query;

      const report = reportService.getLedgerStatement(companyId, req.params.id, startDate, endDate);
      res.status(200).json({
        status: 'success',
        data: report
      });
    } catch (err) {
      next(err);
    }
  });

  // --- ADMIN-ONLY DEBUG ENDPOINTS ---
  router.get('/debug/voucher/:id', requirePermission('users.manage'), (req, res, next) => {
    try {
      const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(req.params.id);
      if (!voucher) {
        return res.status(404).json({ error: { message: 'Voucher not found.' } });
      }
      const entries = db.prepare('SELECT * FROM journal_entries WHERE voucher_id = ?').all(voucher.id);
      res.status(200).json({
        status: 'success',
        data: {
          ...voucher,
          entries
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/debug/ledger/:id', requirePermission('users.manage'), (req, res, next) => {
    try {
      const ledger = db.prepare('SELECT * FROM ledgers WHERE id = ?').get(req.params.id);
      if (!ledger) {
        return res.status(404).json({ error: { message: 'Ledger not found.' } });
      }
      const balance = db.prepare('SELECT running_balance FROM ledger_balances WHERE ledger_id = ?').get(ledger.id);
      const entries = db.prepare(`
        SELECT je.*, v.voucher_number, v.voucher_type, v.voucher_date, v.narration as voucher_narration
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        WHERE je.ledger_id = ?
        ORDER BY v.voucher_date DESC, je.id DESC
      `).all(ledger.id);

      res.status(200).json({
        status: 'success',
        data: {
          ...ledger,
          runningBalance: balance ? balance.running_balance : 0,
          entries
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // --- SUPPLIER REGISTRY ENDPOINTS ---

  router.get('/suppliers', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const suppliers = supplierService.listSuppliers(req.query);
      res.status(200).json({ status: 'success', data: suppliers });
    } catch (err) {
      next(err);
    }
  });

  router.post('/suppliers', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      const supplier = supplierService.createSupplier(companyId, req.body);
      res.status(201).json({ status: 'success', data: supplier });
    } catch (err) {
      next(err);
    }
  });

  router.get('/suppliers/:id', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const supplier = supplierService.getSupplier(req.params.id);
      res.status(200).json({ status: 'success', data: supplier });
    } catch (err) {
      next(err);
    }
  });

  router.put('/suppliers/:id', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const supplier = supplierService.updateSupplier(req.params.id, req.body);
      res.status(200).json({ status: 'success', data: supplier });
    } catch (err) {
      next(err);
    }
  });

  // --- PURCHASING BILL ENDPOINTS ---

  router.get('/purchases/bills', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const bills = purchaseBillService.listPurchaseBills(req.query);
      res.status(200).json({ status: 'success', data: bills });
    } catch (err) {
      next(err);
    }
  });

  router.post('/purchases/bills', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      const payload = { ...req.body, createdBy: req.user.id };
      const bill = purchaseBillService.createPurchaseBill(companyId, payload);
      res.status(201).json({ status: 'success', data: bill });
    } catch (err) {
      next(err);
    }
  });

  router.get('/purchases/bills/:id', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const bill = purchaseBillService.getPurchaseBill(req.params.id);
      res.status(200).json({ status: 'success', data: bill });
    } catch (err) {
      next(err);
    }
  });

  router.post('/purchases/bills/:id/cancel', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      const result = purchaseBillService.cancelPurchaseBill(companyId, req.params.id, req.user.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  });

  // --- SUPPLIER OUTSTANDING ENDPOINTS ---

  router.get('/suppliers/:id/outstanding', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const companyId = 1;
      const outstanding = allocationService.getOutstanding('SUPPLIER', companyId, req.params.id);
      res.status(200).json({ status: 'success', data: outstanding });
    } catch (err) {
      next(err);
    }
  });

  // --- SUPPLIER PAYMENT ENDPOINTS ---

  router.get('/payments', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const payments = supplierPaymentService.listPayments(req.query);
      res.status(200).json({ status: 'success', data: payments });
    } catch (err) {
      next(err);
    }
  });

  router.post('/payments', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      const payload = { ...req.body, createdBy: req.user.id };
      const payment = supplierPaymentService.createPayment(companyId, payload);
      res.status(201).json({ status: 'success', data: payment });
    } catch (err) {
      next(err);
    }
  });

  router.get('/payments/:id', requirePermission('accounting.read'), (req, res, next) => {
    try {
      const payment = supplierPaymentService.getPayment(req.params.id);
      res.status(200).json({ status: 'success', data: payment });
    } catch (err) {
      next(err);
    }
  });

  router.post('/payments/:id/cancel', requirePermission('accounting.write'), (req, res, next) => {
    try {
      const companyId = 1;
      const result = supplierPaymentService.cancelPayment(companyId, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  });

  router.post('/payments/:id/allocate', requirePermission('accounting.write'), (req, res, next) => {
    try {
      allocationService.allocateManual('SUPPLIER', req.params.id, req.body.allocations);
      res.status(200).json({ status: 'success', message: 'Supplier allocations matched successfully.' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports/reconciliation', requirePermission('users.manage'), (req, res, next) => {
    try {
      const companyId = 1;
      const report = reconciliationService.runReconciliation(companyId);
      res.status(200).json({ status: 'success', data: report });
    } catch (err) {
      next(err);
    }
  });

  router.post('/reports/reconciliation/repair', requirePermission('users.manage'), (req, res, next) => {
    try {
      const companyId = 1;
      reconciliationService.repairLedgerBalances(companyId);
      res.status(200).json({ status: 'success', message: 'Ledger balances successfully repaired.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
