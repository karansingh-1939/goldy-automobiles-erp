import { AppError } from '../../shared/errors/AppError.js';

function roundMoney(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Service to manage Supplier Purchase Bills, FIFO Batches, and Purchase Vouchers.
 */
export class PurchaseBillService {
  /**
   * @param {object} db - Database connection instance
   * @param {object} postingEngine - Injected PostingEngine instance
   * @param {object} inventoryService - Injected InventoryService instance
   */
  constructor(db, postingEngine, inventoryService) {
    this.db = db;
    this.postingEngine = postingEngine;
    this.inventoryService = inventoryService;
  }

  /**
   * Posts a new purchase bill.
   */
  createPurchaseBill(companyId, payload) {
    const {
      supplierId,
      billNumber,
      billDate,
      dueDate,
      items = [],
      narration,
      createdBy
    } = payload;

    if (!supplierId || !billNumber || !billDate || items.length === 0) {
      throw new AppError('Missing required purchase fields (supplierId, billNumber, billDate, and items).', 400, 'MISSING_PURCHASE_FIELDS');
    }

    return this.db.transaction(() => {
      // 1. Verify Supplier exists and AP Ledger is active
      const supplier = this.db.prepare('SELECT id, name, ledger_id, is_active, state FROM suppliers WHERE id = ?').get(supplierId);
      if (!supplier) {
        throw new AppError('Selected Supplier not found.', 404, 'SUPPLIER_NOT_FOUND');
      }
      if (!supplier.is_active) {
        throw new AppError('Selected Supplier is inactive.', 400, 'SUPPLIER_INACTIVE');
      }

      const company = this.db.prepare('SELECT state FROM companies WHERE id = ?').get(companyId);
      const companyState = company ? (company.state || 'Haryana') : 'Haryana';
      const supplierState = supplier.state || companyState;
      const isInterstate = supplierState.trim().toLowerCase() !== companyState.trim().toLowerCase();

      // 2. Prevent duplicate invoice entries from the same supplier
      const duplicate = this.db.prepare('SELECT id FROM purchase_bills WHERE supplier_id = ? AND bill_number = ?').get(supplierId, billNumber);
      if (duplicate) {
        throw new AppError(`Invoice '${billNumber}' has already been recorded for this supplier.`, 400, 'DUPLICATE_SUPPLIER_BILL');
      }

      // 3. Compute totals and line Net costs
      let subtotal = 0;
      let gstTotal = 0;
      const processedItems = [];

      for (const item of items) {
        const qty = Number(item.quantity);
        const cost = Number(item.purchaseCost);
        const rate = Number(item.gstRate || 0);

        if (qty <= 0 || cost < 0) {
          throw new AppError('Item quantity must be positive and cost must be non-negative.', 400, 'INVALID_ITEM_AMOUNTS');
        }

        const lineSubtotal = roundMoney(qty * cost);
        const lineGst = roundMoney(lineSubtotal * (rate / 100));
        const lineTotal = roundMoney(lineSubtotal + lineGst);

        subtotal = roundMoney(subtotal + lineSubtotal);
        gstTotal = roundMoney(gstTotal + lineGst);

        processedItems.push({
          ...item,
          quantity: qty,
          purchaseCost: cost,
          gstRate: rate,
          gstAmount: lineGst,
          lineTotal
        });
      }

      const grandTotal = roundMoney(subtotal + gstTotal);

      let cgstTotal = 0;
      let sgstTotal = 0;
      let igstTotal = 0;

      if (isInterstate) {
        igstTotal = roundMoney(gstTotal);
      } else {
        cgstTotal = roundMoney(gstTotal / 2);
        sgstTotal = roundMoney(gstTotal - cgstTotal);
      }

      // 4. Insert Purchase Bill Header record
      const result = this.db.prepare(`
        INSERT INTO purchase_bills (bill_number, company_id, supplier_id, bill_date, due_date, subtotal, gst_total, grand_total, amount_paid, status, narration, created_by, cgst_total, sgst_total, igst_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'UNPAID', ?, ?, ?, ?, ?)
      `).run(billNumber, companyId, supplierId, billDate, dueDate || null, subtotal, gstTotal, grandTotal, narration || null, createdBy, cgstTotal, sgstTotal, igstTotal);

      const billId = result.lastInsertRowid;

      // 5. Ingest Items to Inventory stock batches and insert items rows
      const insertItemStmt = this.db.prepare(`
        INSERT INTO purchase_bill_items (purchase_bill_id, item_id, description, quantity, purchase_cost, gst_rate, gst_amount, line_total, warehouse_id, batch_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of processedItems) {
        const batchNum = item.batchNumber || `BATCH-${billDate.replace(/-/g, '')}`;
        
        // Execute standard stock in logic (updates cache averages and creates transaction log)
        const stockResult = this.inventoryService.stockIn({
          itemId: item.itemId,
          warehouseId: item.warehouseId,
          supplierId,
          batchNumber: batchNum,
          quantity: item.quantity,
          unitCost: item.purchaseCost,
          transactionType: 'Purchase',
          referenceType: 'purchase_bills',
          referenceId: billId,
          notes: `Purchase Bill: ${billNumber}`,
          userId: createdBy
        });

        // Insert item detail row linked to resolved batch ID
        insertItemStmt.run(billId, item.itemId, item.description, item.quantity, item.purchaseCost, item.gstRate, item.gstAmount, item.lineTotal, item.warehouseId, stockResult.batch.id);
      }

      // 6. Post double-entry Purchase General Ledger Voucher
      const ledgerEntries = [
        {
          ledgerId: supplier.ledger_id,
          type: 'CREDIT',
          amount: grandTotal,
          narration: `Accounts Payable: Invoice ${billNumber} from ${supplier.name}`
        },
        {
          ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'inventory_stock'),
          type: 'DEBIT',
          amount: subtotal,
          narration: `Inventory Stock additions`
        }
      ];

      if (igstTotal > 0) {
        ledgerEntries.push({
          ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'igst_input'),
          type: 'DEBIT',
          amount: igstTotal,
          narration: 'Input IGST'
        });
      } else {
        if (cgstTotal > 0) {
          ledgerEntries.push({
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'cgst_input'),
            type: 'DEBIT',
            amount: cgstTotal,
            narration: 'Input CGST'
          });
        }

        if (sgstTotal > 0) {
          ledgerEntries.push({
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'sgst_input'),
            type: 'DEBIT',
            amount: sgstTotal,
            narration: 'Input SGST'
          });
        }
      }

      const voucher = this.postingEngine.post({
        companyId,
        voucherType: 'Purchase',
        voucherDate: billDate,
        narration: narration || `Purchase Bill: ${billNumber}`,
        referenceTable: 'purchase_bills',
        referenceId: billId,
        entries: ledgerEntries
      });

      // 7. Update header with voucher link
      this.db.prepare('UPDATE purchase_bills SET voucher_id = ? WHERE id = ?').run(voucher.id, billId);

      return this.getPurchaseBill(billId);
    })();
  }

  /**
   * Retrieves a single purchase bill details.
   */
  getPurchaseBill(id) {
    const bill = this.db.prepare(`
      SELECT pb.*, s.name AS supplier_name, s.ledger_id AS supplier_ledger_id
      FROM purchase_bills pb
      JOIN suppliers s ON pb.supplier_id = s.id
      WHERE pb.id = ?
    `).get(id);

    if (!bill) {
      throw new AppError('Purchase Bill not found.', 404, 'BILL_NOT_FOUND');
    }

    const items = this.db.prepare('SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ?').all(id);
    return {
      ...bill,
      items
    };
  }

  /**
   * Lists purchase bills with filters.
   */
  listPurchaseBills(filters = {}) {
    const { supplierId, status, startDate, endDate } = filters;
    let sql = `
      SELECT pb.*, s.name AS supplier_name
      FROM purchase_bills pb
      JOIN suppliers s ON pb.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (supplierId) {
      sql += ' AND pb.supplier_id = ?';
      params.push(supplierId);
    }

    if (status) {
      sql += ' AND pb.status = ?';
      params.push(status);
    }

    if (startDate) {
      sql += ' AND pb.bill_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND pb.bill_date <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY pb.bill_date DESC, pb.id DESC';
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Cancels a purchase bill and rolls back inventory and general ledger transactions.
   */
  cancelPurchaseBill(companyId, id, userId) {
    return this.db.transaction(() => {
      const bill = this.getPurchaseBill(id);
      if (bill.status === 'CANCELLED') {
        throw new AppError('Purchase Bill is already cancelled.', 400, 'BILL_ALREADY_CANCELLED');
      }

      // Check for active payment allocations
      const allocationCount = this.db.prepare(`
        SELECT COUNT(*) AS count 
        FROM supplier_allocations 
        WHERE document_type = 'purchase_bill' AND document_id = ?
      `).get(id).count;

      if (allocationCount > 0) {
        throw new AppError('Cannot cancel purchase bill. Active payment allocations exist.', 400, 'BILL_HAS_ALLOCATIONS');
      }

      // 1. Delete associated ledger voucher
      if (bill.voucher_id) {
        this.postingEngine.deleteVoucher(companyId, bill.voucher_id);
      }

      // 2. Rollback/reverse inventory additions
      for (const item of bill.items) {
        // Stock out the purchased parts from the specific batch created
        this.inventoryService.stockOut({
          itemId: item.item_id,
          warehouseId: item.warehouse_id,
          batchId: item.batch_id,
          quantity: item.quantity,
          transactionType: 'Return',
          referenceType: 'purchase_bills',
          referenceId: bill.id,
          notes: `Cancellation of bill ${bill.bill_number}`,
          userId
        });
      }

      // 3. Mark bill header status as CANCELLED
      this.db.prepare("UPDATE purchase_bills SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

      return { success: true };
    })();
  }
}
