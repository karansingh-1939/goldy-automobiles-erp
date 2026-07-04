import { AppError } from '../../shared/errors/AppError.js';

function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Service to manage Supplier Payments, payment vouchers, and allocations.
 */
export class SupplierPaymentService {
  /**
   * @param {object} db - Database connection instance
   * @param {object} postingEngine - Injected PostingEngine instance
   * @param {object} allocationService - Injected AllocationService instance
   */
  constructor(db, postingEngine, allocationService) {
    this.db = db;
    this.postingEngine = postingEngine;
    this.allocationService = allocationService;
  }

  /**
   * Records a supplier payment.
   */
  createPayment(companyId, payload) {
    const {
      supplierId,
      paymentDate,
      amount,
      paymentMode,
      bankLedgerId,
      narration,
      createdBy,
      autoAllocate = true
    } = payload;

    if (!supplierId || !paymentDate || !amount || !paymentMode) {
      throw new AppError('Missing required payment fields (supplierId, paymentDate, amount, and paymentMode).', 400, 'MISSING_PAYMENT_FIELDS');
    }

    const payAmount = roundMoney(Number(amount));
    if (payAmount <= 0) {
      throw new AppError('Payment amount must be greater than zero.', 400, 'INVALID_PAYMENT_AMOUNT');
    }

    return this.db.transaction(() => {
      // 1. Verify Supplier
      const supplier = this.db.prepare('SELECT name, ledger_id, is_active FROM suppliers WHERE id = ?').get(supplierId);
      if (!supplier) {
        throw new AppError('Supplier not found.', 404, 'SUPPLIER_NOT_FOUND');
      }
      if (!supplier.is_active) {
        throw new AppError('Supplier is inactive.', 400, 'SUPPLIER_INACTIVE');
      }

      // Resolve Cash or Bank ledger
      let creditLedgerId;
      if (paymentMode === 'CASH') {
        creditLedgerId = this.postingEngine.ledgerResolver.getLedgerId(companyId, 'cash_in_hand');
      } else {
        if (!bankLedgerId) {
          throw new AppError('Bank ledger ID is required when payment mode is BANK.', 400, 'BANK_LEDGER_REQUIRED');
        }
        const bank = this.db.prepare('SELECT id FROM ledgers WHERE id = ? AND company_id = ?').get(bankLedgerId, companyId);
        if (!bank) {
          throw new AppError('Selected Bank ledger not found.', 404, 'BANK_LEDGER_NOT_FOUND');
        }
        creditLedgerId = bankLedgerId;
      }

      // 2. Generate sequential payment voucher document number
      const year = new Date(paymentDate).getFullYear();
      const prefix = `PMT-${year}-`;
      const last = this.db.prepare("SELECT payment_number FROM supplier_payments WHERE payment_number LIKE ? ORDER BY payment_number DESC LIMIT 1").get(`${prefix}%`);
      let seq = 1;
      if (last) {
        const match = last.payment_number.match(/(\d+)$/);
        if (match) {
          seq = parseInt(match[1], 10) + 1;
        }
      }
      const paymentNumber = `${prefix}${String(seq).padStart(6, '0')}`;

      // 3. Post double-entry Payment Voucher (Debit AP, Credit Cash/Bank)
      const voucher = this.postingEngine.post({
        companyId,
        voucherType: 'Payment',
        voucherDate: paymentDate,
        narration: narration || `Payment ${paymentNumber} to ${supplier.name}`,
        referenceTable: 'supplier_payments',
        referenceId: null, // Set after insert
        entries: [
          {
            ledgerId: supplier.ledger_id,
            type: 'DEBIT',
            amount: payAmount,
            narration: `Payment to supplier: ${supplier.name}`
          },
          {
            ledgerId: creditLedgerId,
            type: 'CREDIT',
            amount: payAmount,
            narration: `Cash/Bank disbursement`
          }
        ]
      });

      // 4. Insert Supplier Payment Header record
      const result = this.db.prepare(`
        INSERT INTO supplier_payments (payment_number, company_id, supplier_id, payment_date, amount, unallocated_amount, payment_mode, bank_ledger_id, voucher_id, status, narration, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `).run(
        paymentNumber,
        companyId,
        supplierId,
        paymentDate,
        payAmount,
        payAmount, // unallocated matches amount initially before allocation runs
        paymentMode,
        bankLedgerId || null,
        voucher.id,
        narration || null,
        createdBy
      );

      const paymentId = result.lastInsertRowid;

      // Update voucher with reference ID links
      this.db.prepare("UPDATE vouchers SET reference_id = ?, reference_table = 'supplier_payments' WHERE id = ?").run(paymentId, voucher.id);

      // 5. Trigger FIFO Allocation matching if selected
      if (autoAllocate) {
        this.allocationService.allocateFIFO('SUPPLIER', paymentId, companyId, supplierId, payAmount);
      }

      return this.getPayment(paymentId);
    })();
  }

  /**
   * Retrieves a single supplier payment details.
   */
  getPayment(id) {
    const payment = this.db.prepare(`
      SELECT p.*, s.name AS supplier_name
      FROM supplier_payments p
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ?
    `).get(id);

    if (!payment) {
      throw new AppError('Supplier Payment record not found.', 404, 'PAYMENT_NOT_FOUND');
    }

    const allocations = this.db.prepare(`
      SELECT sa.*, pb.bill_number
      FROM supplier_allocations sa
      JOIN purchase_bills pb ON sa.document_id = pb.id
      WHERE sa.supplier_payment_id = ?
    `).all(id);

    return {
      ...payment,
      allocations
    };
  }

  /**
   * Lists supplier payments with filters.
   */
  listPayments(filters = {}) {
    const { supplierId, startDate, endDate } = filters;
    let sql = `
      SELECT p.*, s.name AS supplier_name
      FROM supplier_payments p
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (supplierId) {
      sql += ' AND p.supplier_id = ?';
      params.push(supplierId);
    }

    if (startDate) {
      sql += ' AND p.payment_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND p.payment_date <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY p.payment_date DESC, p.id DESC';
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Cancels a supplier payment, rolls back allocations, and deletes ledger postings.
   */
  cancelPayment(companyId, id) {
    return this.db.transaction(() => {
      const payment = this.getPayment(id);
      if (payment.status === 'CANCELLED') {
        throw new AppError('Supplier Payment is already cancelled.', 400, 'PAYMENT_ALREADY_CANCELLED');
      }

      // 1. Delete associated Payment Voucher
      if (payment.voucher_id) {
        this.postingEngine.deleteVoucher(companyId, payment.voucher_id);
      }

      // 2. Rollback invoice allocations (sets bills back to UNPAID/PARTIAL)
      this.allocationService.cancelAllocations('SUPPLIER', id);

      // 3. Mark payment header as CANCELLED and unallocated = 0
      this.db.prepare("UPDATE supplier_payments SET status = 'CANCELLED', unallocated_amount = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

      return { success: true };
    })();
  }
}
