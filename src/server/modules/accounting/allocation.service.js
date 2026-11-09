import { AppError } from '../../shared/errors/app-error.js';

function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

const invoiceCredits = `(SELECT COALESCE(SUM(total_refund_amount), 0) FROM customer_returns
  WHERE invoice_id = invoices.id AND status = 'COMPLETED')`;

/**
 * Service to manage invoice/bill matching and payment allocations polymorphically.
 * Supports both CUSTOMER and SUPPLIER modes.
 */
export class AllocationService {
  constructor(db) {
    this.db = db;
  }

  // ==========================================
  // BACKWARD COMPATIBLE CUSTOMER METHODS
  // ==========================================

  getOutstandingReceivables(companyId, customerId) {
    return this.getOutstanding('CUSTOMER', companyId, customerId);
  }

  allocateReceiptFIFO(receiptId, companyId, customerId, amount) {
    return this.allocateFIFO('CUSTOMER', receiptId, companyId, customerId, amount);
  }

  allocateReceiptManual(receiptId, allocations) {
    return this.allocateManual('CUSTOMER', receiptId, allocations);
  }

  cancelReceiptAllocations(receiptId) {
    return this.cancelAllocations('CUSTOMER', receiptId);
  }

  // ==========================================
  // POLYMORPHIC CORE METHODS
  // ==========================================

  /**
   * Retrieves outstanding documents (unpaid / partially paid).
   */
  getOutstanding(type, companyId, partyId) {
    if (type === 'CUSTOMER') {
      const sql = `
        SELECT 
          id AS documentId,
          'job_card_invoice' AS documentType,
          invoice_number AS documentNumber,
          invoice_date AS date,
          grand_total AS grandTotal,
          amount_paid AS amountPaid,
          ROUND(MAX(0, grand_total - ${invoiceCredits}) - amount_paid, 2) AS outstandingAmount
        FROM invoices
        WHERE customer_id = ? AND status = 'FINALIZED'
          AND ROUND(grand_total - ${invoiceCredits} - amount_paid, 2) > 0

        UNION ALL

        SELECT 
          id AS documentId,
          'direct_invoice' AS documentType,
          invoice_number AS documentNumber,
          invoice_date AS date,
          grand_total AS grandTotal,
          amount_paid AS amountPaid,
          ROUND(grand_total - amount_paid, 2) AS outstandingAmount
        FROM direct_invoices
        WHERE company_id = ? AND customer_id = ? AND status IN ('UNPAID', 'PARTIALLY_PAID')

        ORDER BY date ASC, documentId ASC
      `;
      return this.db.prepare(sql).all(partyId, companyId, partyId);
    } else if (type === 'SUPPLIER') {
      const sql = `
        SELECT 
          id AS documentId,
          'purchase_bill' AS documentType,
          bill_number AS documentNumber,
          bill_date AS date,
          grand_total AS grandTotal,
          amount_paid AS amountPaid,
          ROUND(grand_total - amount_paid, 2) AS outstandingAmount
        FROM purchase_bills
        WHERE company_id = ? AND supplier_id = ? AND status IN ('UNPAID', 'PARTIALLY_PAID')
        ORDER BY date ASC, id ASC
      `;
      return this.db.prepare(sql).all(companyId, partyId);
    } else {
      throw new AppError(`Invalid allocation type: ${type}`, 400, 'INVALID_ALLOCATION_TYPE');
    }
  }

  /**
   * Auto-allocates payment to outstanding documents oldest-first (FIFO).
   */
  allocateFIFO(type, paymentId, companyId, partyId, amount) {
    const outstanding = this.getOutstanding(type, companyId, partyId);
    let remaining = amount;
    const allocations = [];

    for (const doc of outstanding) {
      if (remaining <= 0) break;
      const toAllocate = roundMoney(Math.min(doc.outstandingAmount, remaining));
      if (toAllocate > 0) {
        allocations.push({
          documentType: doc.documentType,
          documentId: doc.documentId,
          allocatedAmount: toAllocate,
        });
        remaining = roundMoney(remaining - toAllocate);
      }
    }

    if (allocations.length > 0) {
      this.allocateManual(type, paymentId, allocations);
    }
  }

  /**
   * Manually matches a payment to specified allocations.
   */
  allocateManual(type, paymentId, allocations) {
    return this.db.transaction(() =>
      this.allocateManualTransaction(type, paymentId, allocations),
    )();
  }

  allocateManualTransaction(type, paymentId, allocations) {
    let parentQuery, parentUpdate, allocationInsert;

    if (type === 'CUSTOMER') {
      parentQuery =
        "SELECT amount, unallocated_amount, customer_id AS partyId FROM customer_receipts WHERE id = ? AND status = 'ACTIVE'";
      parentUpdate = 'UPDATE customer_receipts SET unallocated_amount = ? WHERE id = ?';
      allocationInsert = `
        INSERT INTO receipt_allocations (customer_receipt_id, document_type, document_id, allocated_amount)
        VALUES (?, ?, ?, ?)
      `;
    } else if (type === 'SUPPLIER') {
      parentQuery =
        "SELECT amount, unallocated_amount, supplier_id AS partyId FROM supplier_payments WHERE id = ? AND status = 'ACTIVE'";
      parentUpdate = 'UPDATE supplier_payments SET unallocated_amount = ? WHERE id = ?';
      allocationInsert = `
        INSERT INTO supplier_allocations (supplier_payment_id, document_type, document_id, allocated_amount)
        VALUES (?, ?, ?, ?)
      `;
    } else {
      throw new AppError(`Invalid allocation type: ${type}`, 400, 'INVALID_ALLOCATION_TYPE');
    }

    const parentDoc = this.db.prepare(parentQuery).get(paymentId);
    if (!parentDoc) {
      throw new AppError(
        `${type === 'CUSTOMER' ? 'Receipt' : 'Payment'} document not found.`,
        404,
        'PAYMENT_DOCUMENT_NOT_FOUND',
      );
    }

    let totalAllocated = 0;
    for (const alloc of allocations) {
      const amt = roundMoney(Number(alloc.allocatedAmount));
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new AppError('Allocation amount must be positive.', 400, 'INVALID_ALLOCATION_AMOUNT');
      }
      totalAllocated = roundMoney(totalAllocated + amt);
    }

    if (totalAllocated > parentDoc.unallocated_amount) {
      throw new AppError(
        `Allocation amount (${totalAllocated}) exceeds unallocated balance (${parentDoc.unallocated_amount}).`,
        400,
        'EXCEEDS_UNALLOCATED_BALANCE',
      );
    }

    const insertAlloc = this.db.prepare(allocationInsert);

    for (const alloc of allocations) {
      const amt = roundMoney(Number(alloc.allocatedAmount));

      // Fetch target document
      let doc;
      if (alloc.documentType === 'job_card_invoice') {
        doc = this.db
          .prepare(
            'SELECT grand_total, amount_paid, customer_id, status FROM invoices WHERE id = ?',
          )
          .get(alloc.documentId);
      } else if (alloc.documentType === 'direct_invoice') {
        doc = this.db
          .prepare(
            'SELECT grand_total, amount_paid, customer_id, status FROM direct_invoices WHERE id = ?',
          )
          .get(alloc.documentId);
      } else if (alloc.documentType === 'purchase_bill') {
        doc = this.db
          .prepare(
            'SELECT grand_total, amount_paid, supplier_id, status FROM purchase_bills WHERE id = ?',
          )
          .get(alloc.documentId);
      } else {
        throw new AppError(
          `Invalid document type: ${alloc.documentType}`,
          400,
          'INVALID_DOCUMENT_TYPE',
        );
      }

      if (!doc) {
        throw new AppError(
          `Document of type ${alloc.documentType} with ID ${alloc.documentId} not found.`,
          404,
          'DOCUMENT_NOT_FOUND',
        );
      }

      if (alloc.documentType === 'job_card_invoice') {
        doc.grand_total = this.invoiceNetTotal(alloc.documentId);
      }

      if (
        doc.status === 'CANCELLED' ||
        (alloc.documentType === 'job_card_invoice' && doc.status !== 'FINALIZED')
      ) {
        throw new AppError(
          'Cannot allocate to a cancelled or inactive document.',
          400,
          'DOCUMENT_NOT_ACTIVE',
        );
      }
      if ((type === 'CUSTOMER') !== (alloc.documentType !== 'purchase_bill')) {
        throw new AppError(
          'Document type does not match payment type.',
          400,
          'INVALID_DOCUMENT_TYPE',
        );
      }

      const partyIdFromDoc = doc.customer_id || doc.supplier_id;
      if (partyIdFromDoc !== parentDoc.partyId) {
        throw new AppError(
          `Cannot allocate to a different party's document.`,
          400,
          'PARTY_MISMATCH',
        );
      }

      const outstanding = roundMoney(doc.grand_total - doc.amount_paid);
      if (amt > outstanding) {
        throw new AppError(
          `Allocation of ${amt} exceeds target document outstanding balance of ${outstanding}.`,
          400,
          'ALLOCATION_EXCEEDS_OUTSTANDING',
        );
      }

      const newPaid = roundMoney(doc.amount_paid + amt);
      const newStatus = newPaid >= doc.grand_total ? 'PAID' : 'PARTIALLY_PAID';

      // Update target document
      if (alloc.documentType === 'job_card_invoice') {
        const newPaymentStatus = newPaid >= doc.grand_total ? 'PAID' : 'PARTIAL';
        this.db
          .prepare(
            'UPDATE invoices SET amount_paid = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          )
          .run(newPaid, newPaymentStatus, alloc.documentId);
      } else if (alloc.documentType === 'direct_invoice') {
        this.db
          .prepare(
            'UPDATE direct_invoices SET amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          )
          .run(newPaid, newStatus, alloc.documentId);
      } else if (alloc.documentType === 'purchase_bill') {
        this.db
          .prepare(
            'UPDATE purchase_bills SET amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          )
          .run(newPaid, newStatus, alloc.documentId);
      }

      // Insert allocation details
      insertAlloc.run(paymentId, alloc.documentType, alloc.documentId, amt);
    }

    // Decrement unallocated amount on parent document
    const newUnallocated = roundMoney(parentDoc.unallocated_amount - totalAllocated);
    this.db.prepare(parentUpdate).run(newUnallocated, paymentId);
  }

  /**
   * Reverses all allocations associated with a payment.
   */
  cancelAllocations(type, paymentId) {
    let allocationsQuery, allocationDelete;
    if (type === 'CUSTOMER') {
      allocationsQuery = 'SELECT * FROM receipt_allocations WHERE customer_receipt_id = ?';
      allocationDelete = 'DELETE FROM receipt_allocations WHERE customer_receipt_id = ?';
    } else if (type === 'SUPPLIER') {
      allocationsQuery = 'SELECT * FROM supplier_allocations WHERE supplier_payment_id = ?';
      allocationDelete = 'DELETE FROM supplier_allocations WHERE supplier_payment_id = ?';
    } else {
      throw new AppError(`Invalid allocation type: ${type}`, 400, 'INVALID_ALLOCATION_TYPE');
    }

    const allocations = this.db.prepare(allocationsQuery).all(paymentId);

    for (const alloc of allocations) {
      let doc;
      if (alloc.document_type === 'job_card_invoice') {
        doc = this.db
          .prepare('SELECT grand_total, amount_paid FROM invoices WHERE id = ?')
          .get(alloc.document_id);
      } else if (alloc.document_type === 'direct_invoice') {
        doc = this.db
          .prepare('SELECT grand_total, amount_paid FROM direct_invoices WHERE id = ?')
          .get(alloc.document_id);
      } else if (alloc.document_type === 'purchase_bill') {
        doc = this.db
          .prepare('SELECT grand_total, amount_paid FROM purchase_bills WHERE id = ?')
          .get(alloc.document_id);
      }

      if (doc) {
        if (alloc.document_type === 'job_card_invoice')
          doc.grand_total = this.invoiceNetTotal(alloc.document_id);
        const newPaid = roundMoney(Math.max(0, doc.amount_paid - alloc.allocated_amount));
        const newStatus = newPaid === 0 ? 'UNPAID' : 'PARTIALLY_PAID';

        if (alloc.document_type === 'job_card_invoice') {
          const newPaymentStatus =
            newPaid >= doc.grand_total ? 'PAID' : newPaid === 0 ? 'UNPAID' : 'PARTIAL';
          this.db
            .prepare(
              'UPDATE invoices SET amount_paid = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            )
            .run(newPaid, newPaymentStatus, alloc.document_id);
        } else if (alloc.document_type === 'direct_invoice') {
          this.db
            .prepare(
              'UPDATE direct_invoices SET amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            )
            .run(newPaid, newStatus, alloc.document_id);
        } else if (alloc.document_type === 'purchase_bill') {
          this.db
            .prepare(
              'UPDATE purchase_bills SET amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            )
            .run(newPaid, newStatus, alloc.document_id);
        }
      }
    }

    // Delete allocation details
    this.db.prepare(allocationDelete).run(paymentId);
  }

  invoiceNetTotal(invoiceId) {
    const row = this.db
      .prepare(`SELECT MAX(0, grand_total - ${invoiceCredits}) AS total FROM invoices WHERE id = ?`)
      .get(invoiceId);
    if (!row) throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    return roundMoney(row.total);
  }

  reconcileInvoiceCredits(invoiceId) {
    const invoice = this.db.prepare('SELECT amount_paid FROM invoices WHERE id = ?').get(invoiceId);
    const netTotal = this.invoiceNetTotal(invoiceId);
    let excess = roundMoney(Math.max(0, invoice.amount_paid - netTotal));
    const allocations = this.db
      .prepare(
        "SELECT * FROM receipt_allocations WHERE document_type='job_card_invoice' AND document_id=? ORDER BY id DESC",
      )
      .all(invoiceId);
    for (const allocation of allocations) {
      if (excess <= 0) break;
      const released = roundMoney(Math.min(excess, allocation.allocated_amount));
      const retained = roundMoney(allocation.allocated_amount - released);
      if (retained > 0)
        this.db
          .prepare('UPDATE receipt_allocations SET allocated_amount=? WHERE id=?')
          .run(retained, allocation.id);
      else this.db.prepare('DELETE FROM receipt_allocations WHERE id=?').run(allocation.id);
      this.db
        .prepare(
          'UPDATE customer_receipts SET unallocated_amount=ROUND(unallocated_amount+?,2) WHERE id=?',
        )
        .run(released, allocation.customer_receipt_id);
      excess = roundMoney(excess - released);
    }
    const paid = roundMoney(Math.min(invoice.amount_paid, netTotal) + excess);
    const status = paid >= netTotal ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    this.db
      .prepare(
        'UPDATE invoices SET amount_paid=?, payment_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      )
      .run(paid, status, invoiceId);
  }
}
