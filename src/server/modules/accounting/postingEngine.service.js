import { AppError } from '../../shared/errors/AppError.js';
import { LedgerResolverService } from './ledgerResolver.service.js';
import { PeriodLockService } from './periodLock.service.js';
import { VoucherNumberService } from './voucherNumber.service.js';

/**
 * Orchestrator service for double-entry ledger postings.
 * Delegates sequence checks, date validations, and key resolutions to modular sub-services.
 */
export class AccountingPostingEngine {
  /**
   * @param {object} db - Database connection instance
   */
  constructor(db) {
    this.db = db;
    this.ledgerResolver = new LedgerResolverService(db);
    this.periodLock = new PeriodLockService(db);
    this.voucherNumber = new VoucherNumberService(db);
  }

  /**
   * Universal entry point to post double-entry vouchers to the general ledger.
   * Wraps all database modifications in an atomic SQLite transaction.
   * Leverages an automatic retry loop to handle concurrent sequence collisions.
   * 
   * @param {object} event - Voucher payload and entries
   * @returns {object} Created voucher metadata { voucherId, voucherNumber }
   */
  post(event) {
    const {
      companyId = 1,
      voucherType,
      voucherDate,
      referenceTable,
      referenceId,
      narration = '',
      created_by = null,
      entries
    } = event;

    // 1. Validate request payload
    if (!voucherType || !voucherDate || !entries || !Array.isArray(entries) || entries.length === 0) {
      throw new AppError('Voucher type, date, and entries are required.', 400, 'INVALID_VOUCHER_PAYLOAD');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(voucherDate)) {
      throw new AppError('Voucher date must be in YYYY-MM-DD format.', 400, 'INVALID_DATE_FORMAT');
    }

    // Validate debit/credit balance
    this.validateBalance(entries);

    // Validate Contra, Payment, and Receipt specific constraints
    this.validateVoucherTypeRules(voucherType, entries);

    // 2. Delegate period lock check
    this.periodLock.verifyPeriodLock(companyId, voucherDate);

    // 3. Post transaction inside concurrency-safe retry block
    let attempts = 0;
    const maxAttempts = 3;
    let result = null;

    while (attempts < maxAttempts) {
      try {
        result = this.db.transaction(() => {
          // Generate sequence number dynamically inside transaction
          const vNum = this.voucherNumber.getNextVoucherNumber(companyId, voucherType, voucherDate);

          // Create voucher entry
          const voucherInsert = this.db.prepare(`
            INSERT INTO vouchers (company_id, voucher_number, voucher_type, voucher_date, reference_table, reference_id, narration, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            companyId,
            vNum,
            voucherType,
            voucherDate,
            referenceTable || null,
            referenceId || null,
            narration || null,
            created_by || null
          );

          const voucherId = voucherInsert.lastInsertRowid;

          const insertJournal = this.db.prepare(`
            INSERT INTO journal_entries (voucher_id, ledger_id, entry_type, amount, narration)
            VALUES (?, ?, ?, ?, ?)
          `);

          // Post entries and update cache balances
          for (const entry of entries) {
            if (!entry.ledgerId || !entry.type || !entry.amount || entry.amount <= 0) {
              throw new AppError('Each journal entry must contain a ledgerId, type (DEBIT/CREDIT), and positive amount.', 400, 'INVALID_JOURNAL_ENTRY');
            }

            // Verify ledger exists
            const ledger = this.db.prepare('SELECT id, nature FROM ledgers WHERE id = ? AND company_id = ?').get(entry.ledgerId, companyId);
            if (!ledger) {
              throw new AppError(`Ledger ID ${entry.ledgerId} not found under company ${companyId}.`, 404, 'LEDGER_NOT_FOUND');
            }

            insertJournal.run(
              voucherId,
              entry.ledgerId,
              entry.type,
              entry.amount,
              entry.narration || null
            );

            this.updateRunningBalance(companyId, entry.ledgerId, ledger.nature, entry.type, entry.amount);
          }

          return { voucherId, voucherNumber: vNum };
        })();
        break; // Success!
      } catch (err) {
        attempts++;
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && err.message.includes('voucher_number') && attempts < maxAttempts) {
          // Unique sequence constraint hit (concurrent race condition); retry sequence calculation
          continue;
        }
        throw err; // Rethrow other constraints or if max attempts exceeded
      }
    }

    return result;
  }

  /**
   * Deletes/cancels a voucher and reverses its running balance cache updates.
   * 
   * @param {number} companyId - Active company ID
   * @param {number} voucherId - Voucher ID to delete
   */
  deleteVoucher(companyId, voucherId) {
    const voucher = this.db.prepare('SELECT * FROM vouchers WHERE id = ? AND company_id = ?').get(voucherId, companyId);
    if (!voucher) {
      throw new AppError('Voucher not found.', 404, 'VOUCHER_NOT_FOUND');
    }

    // Verify date is not locked
    this.periodLock.verifyPeriodLock(companyId, voucher.voucher_date);

    const entries = this.db.prepare('SELECT * FROM journal_entries WHERE voucher_id = ?').all(voucherId);

    return this.db.transaction(() => {
      // Revert balances
      for (const entry of entries) {
        const ledger = this.db.prepare('SELECT nature FROM ledgers WHERE id = ?').get(entry.ledger_id);
        const reverseType = entry.entry_type === 'DEBIT' ? 'CREDIT' : 'DEBIT';
        this.updateRunningBalance(companyId, entry.ledger_id, ledger.nature, reverseType, entry.amount);
      }

      // Mark voucher as CANCELLED instead of deleting it to preserve audit logs
      this.db.prepare("UPDATE vouchers SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?").run(voucherId, companyId);
    })();
  }

  /**
   * Asserts that SUM(debits) === SUM(credits) with cent precision.
   * 
   * @param {Array<object>} entries - Entries list
   */
  validateBalance(entries) {
    let debits = 0;
    let credits = 0;

    for (const entry of entries) {
      const amt = Number(entry.amount);
      if (Number.isNaN(amt) || amt <= 0) {
        throw new AppError('Journal entry amount must be a positive number.', 400, 'INVALID_AMOUNT');
      }

      if (entry.type === 'DEBIT') {
        debits += amt;
      } else if (entry.type === 'CREDIT') {
        credits += amt;
      } else {
        throw new AppError('Journal entry type must be DEBIT or CREDIT.', 400, 'INVALID_ENTRY_TYPE');
      }
    }

    const debitsCents = Math.round(debits * 100);
    const creditsCents = Math.round(credits * 100);

    if (debitsCents !== creditsCents) {
      throw new AppError(`Journal entries are not balanced. Debits: ${debits.toFixed(2)}, Credits: ${credits.toFixed(2)}`, 400, 'VOUCHER_UNBALANCED');
    }
  }

  /**
   * Asserts specific account group and cash/bank validations for Contra, Payment, and Receipt vouchers.
   * 
   * @param {string} voucherType - Voucher Type
   * @param {Array<object>} entries - Entries list
   */
  validateVoucherTypeRules(voucherType, entries) {
    if (!['Contra', 'Payment', 'Receipt'].includes(voucherType)) {
      return;
    }

    const ledgerDetails = entries.map(entry => {
      const ledger = this.db.prepare('SELECT name, system_key FROM ledgers WHERE id = ?').get(entry.ledgerId);
      if (!ledger) {
        throw new AppError(`Ledger ID ${entry.ledgerId} not found.`, 404, 'LEDGER_NOT_FOUND');
      }
      const isCashOrBank = ledger.system_key === 'cash_in_hand' || 
                           ledger.system_key === 'hdfc_bank' || 
                           ledger.name.toLowerCase().includes('cash') || 
                           ledger.name.toLowerCase().includes('bank');
      return { ...entry, isCashOrBank };
    });

    if (voucherType === 'Contra') {
      const nonCashBank = ledgerDetails.find(l => !l.isCashOrBank);
      if (nonCashBank) {
        throw new AppError('Contra vouchers can only involve transfers between Cash and Bank accounts.', 400, 'INVALID_CONTRA_VOUCHER');
      }
    } else if (voucherType === 'Payment') {
      const hasCashBankCredit = ledgerDetails.some(l => l.type === 'CREDIT' && l.isCashOrBank);
      if (!hasCashBankCredit) {
        throw new AppError('Payment vouchers must credit a Cash or Bank account.', 400, 'INVALID_PAYMENT_VOUCHER');
      }
    } else if (voucherType === 'Receipt') {
      const hasCashBankDebit = ledgerDetails.some(l => l.type === 'DEBIT' && l.isCashOrBank);
      if (!hasCashBankDebit) {
        throw new AppError('Receipt vouchers must debit a Cash or Bank account.', 400, 'INVALID_RECEIPT_VOUCHER');
      }
    }
  }

  /**
   * Dynamically increments/decrements balances in ledger_balances cache table.
   */
  updateRunningBalance(companyId, ledgerId, ledgerNature, entryType, amount) {
    const current = this.db.prepare('SELECT running_balance FROM ledger_balances WHERE company_id = ? AND ledger_id = ?').get(companyId, ledgerId);
    let running = current ? current.running_balance : 0;

    if (ledgerNature === 'Debit') {
      if (entryType === 'DEBIT') {
        running += amount;
      } else {
        running -= amount;
      }
    } else {
      if (entryType === 'CREDIT') {
        running += amount;
      } else {
        running -= amount;
      }
    }

    this.db.prepare(`
      INSERT INTO ledger_balances (company_id, ledger_id, running_balance)
      VALUES (?, ?, ?)
      ON CONFLICT(company_id, ledger_id)
      DO UPDATE SET running_balance = EXCLUDED.running_balance
    `).run(companyId, ledgerId, running);
  }

  /**
   * Dynamically retrieves or creates a ledger for a Customer under Sundry Debtors (Group 2).
   */
  getOrCreateCustomerLedger(companyId, customerId) {
    const customer = this.db.prepare('SELECT name, phone, ledger_id FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      throw new AppError(`Customer ID ${customerId} not found.`, 404, 'CUSTOMER_NOT_FOUND');
    }

    if (customer.ledger_id) {
      return customer.ledger_id;
    }

    const ledgerName = `Customer: ${customer.name} (${customer.phone || customerId})`;
    
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT id FROM ledgers WHERE company_id = ? AND name = ?').get(companyId, ledgerName);
      if (existing) {
        this.db.prepare('UPDATE customers SET ledger_id = ? WHERE id = ?').run(existing.id, customerId);
        return existing.id;
      }

      const insertLedger = this.db.prepare(`
        INSERT INTO ledgers (company_id, name, group_id, opening_balance, nature, is_system, linked_entity_type, linked_entity_id)
        VALUES (?, ?, ?, 0, 'Debit', 0, 'customer', ?)
      `).run(companyId, ledgerName, 2, customerId);

      const ledgerId = insertLedger.lastInsertRowid;

      this.db.prepare('UPDATE customers SET ledger_id = ? WHERE id = ?').run(ledgerId, customerId);

      this.db.prepare(`
        INSERT OR IGNORE INTO ledger_balances (company_id, ledger_id, running_balance)
        VALUES (?, ?, 0)
      `).run(companyId, ledgerId);

      return ledgerId;
    })();
  }

  /**
   * Dynamically retrieves or creates a ledger for a Supplier under Sundry Creditors (Group 5).
   */
  getOrCreateSupplierLedger(companyId, supplierId) {
    const supplier = this.db.prepare('SELECT name, ledger_id FROM suppliers WHERE id = ?').get(supplierId);
    if (!supplier) {
      throw new AppError(`Supplier ID ${supplierId} not found.`, 404, 'SUPPLIER_NOT_FOUND');
    }

    if (supplier.ledger_id) {
      return supplier.ledger_id;
    }

    const ledgerName = `Supplier: ${supplier.name}`;

    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT id FROM ledgers WHERE company_id = ? AND name = ?').get(companyId, ledgerName);
      if (existing) {
        this.db.prepare('UPDATE suppliers SET ledger_id = ? WHERE id = ?').run(existing.id, supplierId);
        return existing.id;
      }

      const insertLedger = this.db.prepare(`
        INSERT INTO ledgers (company_id, name, group_id, opening_balance, nature, is_system, linked_entity_type, linked_entity_id)
        VALUES (?, ?, ?, 0, 'Credit', 0, 'supplier', ?)
      `).run(companyId, ledgerName, 5, supplierId);

      const ledgerId = insertLedger.lastInsertRowid;

      this.db.prepare('UPDATE suppliers SET ledger_id = ? WHERE id = ?').run(ledgerId, supplierId);

      this.db.prepare(`
        INSERT OR IGNORE INTO ledger_balances (company_id, ledger_id, running_balance)
        VALUES (?, ?, 0)
      `).run(companyId, ledgerId);

      return ledgerId;
    })();
  }
}
