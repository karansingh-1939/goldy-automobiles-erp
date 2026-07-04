import { AppError } from '../../shared/errors/AppError.js';
import { AccountingPostingEngine } from './postingEngine.service.js';
import { AllocationService } from './allocation.service.js';

function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Service to handle customer payments, deposits, advances, and cancellations.
 */
export class CustomerReceiptService {
  constructor(db) {
    this.db = db;
    this.postingEngine = new AccountingPostingEngine(db);
    this.allocationService = new AllocationService(db);
  }

  /**
   * Records a customer receipt and posts the corresponding double-entry accounting voucher.
   */
  createReceipt(payload) {
    const {
      companyId = 1,
      customerId,
      receiptDate,
      amount,
      paymentMode,
      bankLedgerId = null,
      narration = '',
      createdBy = null,
      autoAllocate = false
    } = payload;

    // 1. Validations
    if (!customerId || !receiptDate || !amount || !paymentMode) {
      throw new AppError('Customer, date, amount, and payment mode are required.', 400, 'RECEIPT_INVALID_PAYLOAD');
    }

    const receiptAmount = roundMoney(Number(amount));
    if (Number.isNaN(receiptAmount) || receiptAmount <= 0) {
      throw new AppError('Receipt amount must be a positive number.', 400, 'RECEIPT_INVALID_AMOUNT');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) {
      throw new AppError('Receipt date must be YYYY-MM-DD.', 400, 'RECEIPT_INVALID_DATE');
    }

    if (!['CASH', 'BANK'].includes(paymentMode)) {
      throw new AppError('Payment mode must be CASH or BANK.', 400, 'RECEIPT_INVALID_MODE');
    }

    // Verify customer exists
    const customer = this.db.prepare('SELECT name, ledger_id FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      throw new AppError('Customer not found.', 404, 'CUSTOMER_NOT_FOUND');
    }

    let customerLedgerId = customer.ledger_id;
    if (!customerLedgerId) {
      // Lazy resolve/create customer ledger if missing
      customerLedgerId = this.postingEngine.getOrCreateCustomerLedger(companyId, customerId);
    }

    // Resolve cash or selected bank ledger
    let receivingLedgerId;
    if (paymentMode === 'CASH') {
      receivingLedgerId = this.postingEngine.ledgerResolver.getLedgerId(companyId, 'cash_in_hand');
    } else {
      if (!bankLedgerId) {
        throw new AppError('Bank ledger ID is required when payment mode is BANK.', 400, 'BANK_LEDGER_REQUIRED');
      }
      const bank = this.db.prepare('SELECT id FROM ledgers WHERE id = ? AND company_id = ?').get(bankLedgerId, companyId);
      if (!bank) {
        throw new AppError('Selected Bank ledger not found.', 404, 'BANK_LEDGER_NOT_FOUND');
      }
      receivingLedgerId = bankLedgerId;
    }

    return this.db.transaction(() => {
      // 2. Generate sequential receipt document number
      const year = new Date(receiptDate).getFullYear();
      const prefix = `REC-${year}-`;
      const last = this.db.prepare("SELECT receipt_number FROM customer_receipts WHERE receipt_number LIKE ? ORDER BY receipt_number DESC LIMIT 1").get(`${prefix}%`);
      let seq = 1;
      if (last) {
        const match = last.receipt_number.match(/(\d+)$/);
        if (match) {
          seq = parseInt(match[1], 10) + 1;
        }
      }
      const receiptNumber = `${prefix}${String(seq).padStart(6, '0')}`;

      // 3. Post Receipt Voucher
      const voucherResult = this.postingEngine.post({
        companyId,
        voucherType: 'Receipt',
        voucherDate: receiptDate,
        narration: narration || `Receipt ${receiptNumber} from ${customer.name}`,
        created_by: createdBy,
        entries: [
          { ledgerId: receivingLedgerId, type: 'DEBIT', amount: receiptAmount },
          { ledgerId: customerLedgerId, type: 'CREDIT', amount: receiptAmount }
        ]
      });

      // 4. Insert Receipt Record
      const insert = this.db.prepare(`
        INSERT INTO customer_receipts (
          receipt_number, company_id, customer_id, receipt_date, amount, payment_mode, 
          bank_ledger_id, unallocated_amount, voucher_id, status, narration, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `);
      const info = insert.run(
        receiptNumber,
        companyId,
        customerId,
        receiptDate,
        receiptAmount,
        paymentMode,
        bankLedgerId,
        receiptAmount, // Unallocated initially
        voucherResult.voucherId,
        narration,
        createdBy
      );

      const receiptId = info.lastInsertRowid;

      // 5. Trigger FIFO matching if requested
      if (autoAllocate) {
        this.allocationService.allocateReceiptFIFO(receiptId, companyId, customerId, receiptAmount);
      }

      return {
        receiptId,
        receiptNumber,
        amount: receiptAmount,
        voucherId: voucherResult.voucherId,
        voucherNumber: voucherResult.voucherNumber
      };
    })();
  }

  /**
   * Cancels a receipt document, reverses all linked allocations, and deletes the accounting voucher.
   */
  cancelReceipt(receiptId, companyId = 1) {
    return this.db.transaction(() => {
      const receipt = this.db.prepare('SELECT * FROM customer_receipts WHERE id = ? AND company_id = ?').get(receiptId, companyId);
      if (!receipt) {
        throw new AppError('Receipt document not found.', 404, 'RECEIPT_NOT_FOUND');
      }

      if (receipt.status === 'CANCELLED') {
        throw new AppError('Receipt is already cancelled.', 400, 'RECEIPT_ALREADY_CANCELLED');
      }

      // 1. Reverse allocations
      this.allocationService.cancelReceiptAllocations(receiptId);

      // 2. Reverse accounting entries by cancelling/deleting voucher
      if (receipt.voucher_id) {
        this.postingEngine.deleteVoucher(companyId, receipt.voucher_id);
      }

      // 3. Update status to CANCELLED and zero out unallocated balance
      this.db.prepare("UPDATE customer_receipts SET status = 'CANCELLED', unallocated_amount = 0 WHERE id = ?").run(receiptId);

      return true;
    })();
  }

  /**
   * Manually allocates a receipt balance to outstanding invoices.
   */
  allocateReceiptManual(receiptId, allocations) {
    return this.db.transaction(() => {
      this.allocationService.allocateReceiptManual(receiptId, allocations);
      return true;
    })();
  }
}
