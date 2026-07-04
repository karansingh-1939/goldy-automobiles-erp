import { AppError } from '../../shared/errors/AppError.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PurchasingRepository } from './purchasing.repository.js';
import { AccountingPostingEngine } from '../accounting/postingEngine.service.js';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.round(number(value) * 100) / 100;
}

function required(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new AppError(`${label} is required.`, 400, 'VALIDATION_ERROR');
  }
}

function code(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function normalizeDatabaseError(error) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new AppError('A record with the same unique value already exists.', 409, 'DUPLICATE_RECORD');
  }

  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new AppError('Related record was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
  }

  if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
    return new AppError('Record violates a database constraint.', 400, 'CONSTRAINT_FAILED');
  }

  return error;
}

function parseListQuery(query) {
  const page = Math.max(Number.parseInt(query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '20', 10) || 20, 1), 100);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: typeof query.search === 'string' ? query.search.trim() : '',
  };
}

function lineAmounts(item) {
  const quantity = number(item.quantity);
  const purchaseCost = money(item.purchase_cost ?? item.unit_cost);
  const gstRate = number(item.gst_rate);
  const taxable = money(quantity * purchaseCost);
  const gstAmount = money((taxable * gstRate) / 100);

  return {
    quantity,
    purchaseCost,
    gstRate,
    gstAmount,
    lineTotal: money(taxable + gstAmount),
  };
}

export class PurchasingService {
  constructor(db) {
    this.db = db;
    this.repository = new PurchasingRepository(db);
    this.inventoryService = new InventoryService(db);
    this.auditRepository = new AuditRepository(db);
    this.postingEngine = new AccountingPostingEngine(db);
  }

  listOrders(query = {}) {
    const parsed = parseListQuery(query);
    const result = this.repository.listPurchaseOrders(parsed);
    return this.withPagination(result, parsed);
  }

  getOrder(id) {
    const order = this.repository.findPurchaseOrderById(id);
    if (!order) {
      throw new AppError('Purchase order not found.', 404, 'PURCHASE_ORDER_NOT_FOUND');
    }

    return {
      ...order,
      items: this.repository.listPurchaseItemsByOrderId(id),
    };
  }

  createOrder(payload, userId) {
    required(payload.supplier_id, 'Supplier');
    const supplier = this.repository.findSupplierById(payload.supplier_id);
    if (!supplier) {
      throw new AppError('Supplier was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    if (!supplier.is_active) {
      throw new AppError('Supplier is inactive.', 400, 'VALIDATION_ERROR');
    }

    const items = this.validateItems(payload.items, { requireBatch: false });

    try {
      return this.repository.transaction(() => {
        const orderId = this.repository.createPurchaseOrder({
          order_number: payload.order_number || code('PO'),
          supplier_id: supplier.id,
          order_date: payload.order_date || new Date().toISOString().slice(0, 10),
          expected_date: payload.expected_date || null,
          status: 'OPEN',
          notes: payload.notes || null,
          created_by: userId,
        });

        const totals = this.createPurchaseItems({
          source: 'order',
          sourceId: orderId,
          items,
        });
        this.repository.updatePurchaseOrderTotals(orderId, totals);

        const order = this.getOrder(orderId);
        this.auditRepository.create({
          userId,
          action: 'CREATE',
          entityType: 'purchase_orders',
          entityId: orderId,
          newValue: order,
        });

        return order;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  listReceipts(query = {}) {
    const parsed = parseListQuery(query);
    const result = this.repository.listPurchaseReceipts(parsed);
    return this.withPagination(result, parsed);
  }

  getReceipt(id) {
    const receipt = this.repository.findPurchaseReceiptById(id);
    if (!receipt) {
      throw new AppError('Purchase receipt not found.', 404, 'PURCHASE_RECEIPT_NOT_FOUND');
    }

    return {
      ...receipt,
      items: this.repository.listPurchaseItemsByReceiptId(id),
    };
  }

  createReceipt(payload, userId) {
    required(payload.supplier_id, 'Supplier');
    const supplier = this.repository.findSupplierById(payload.supplier_id);
    if (!supplier) {
      throw new AppError('Supplier was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    if (!supplier.is_active) {
      throw new AppError('Supplier is inactive.', 400, 'VALIDATION_ERROR');
    }

    const purchaseOrder = payload.purchase_order_id
      ? this.repository.findPurchaseOrderById(payload.purchase_order_id)
      : null;

    if (payload.purchase_order_id && !purchaseOrder) {
      throw new AppError('Purchase order was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    if (purchaseOrder && Number(purchaseOrder.supplier_id) !== Number(supplier.id)) {
      throw new AppError('Purchase order supplier does not match receipt supplier.', 400, 'VALIDATION_ERROR');
    }

    const items = this.validateItems(payload.items, { requireBatch: true });

    try {
      return this.repository.transaction(() => {
        const receiptId = this.repository.createPurchaseReceipt({
          receipt_number: payload.receipt_number || code('GRN'),
          purchase_order_id: purchaseOrder?.id || null,
          supplier_id: supplier.id,
          receipt_date: payload.receipt_date || new Date().toISOString().slice(0, 10),
          status: 'POSTED',
          notes: payload.notes || null,
          created_by: userId,
        });

        const totals = this.createPurchaseItems({
          source: 'receipt',
          sourceId: receiptId,
          supplierId: supplier.id,
          items,
          userId,
        });
        this.repository.updatePurchaseReceiptTotals(receiptId, totals);

        // Post Purchase Voucher automatically
        const supplierLedgerId = this.postingEngine.getOrCreateSupplierLedger(1, supplier.id);
        const cgstAmount = money(totals.gst_total / 2);
        const sgstAmount = money(totals.gst_total - cgstAmount);

        const accountingEntries = [];
        accountingEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'inventory_stock'), type: 'DEBIT', amount: totals.subtotal });
        
        if (cgstAmount > 0) {
          accountingEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'cgst_input'), type: 'DEBIT', amount: cgstAmount });
        }
        if (sgstAmount > 0) {
          accountingEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'sgst_input'), type: 'DEBIT', amount: sgstAmount });
        }

        accountingEntries.push({ ledgerId: supplierLedgerId, type: 'CREDIT', amount: totals.grand_total });

        // Handle Round Off
        const sumDebits = totals.subtotal + cgstAmount + sgstAmount;
        const roundoff = money(totals.grand_total - sumDebits);
        if (Math.abs(roundoff) >= 0.01) {
          if (roundoff > 0) {
            accountingEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'round_off'), type: 'DEBIT', amount: roundoff });
          } else {
            accountingEntries.push({ ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'round_off'), type: 'CREDIT', amount: Math.abs(roundoff) });
          }
        }

        this.postingEngine.post({
          companyId: 1,
          voucherType: 'Purchase',
          voucherDate: payload.receipt_date || new Date().toISOString().slice(0, 10),
          referenceTable: 'purchase_receipts',
          referenceId: receiptId,
          narration: `Purchase receipt from supplier: ${supplier.name}. GRN: ${payload.receipt_number || receiptId}`,
          created_by: userId,
          entries: accountingEntries
        });

        if (purchaseOrder) {
          this.repository.updatePurchaseOrderStatus(purchaseOrder.id, 'RECEIVED');
        }

        this.recordSupplierLedger({
          supplierId: supplier.id,
          entryDate: payload.receipt_date || new Date().toISOString().slice(0, 10),
          entryType: 'Purchase',
          referenceType: 'purchase_receipts',
          referenceId: receiptId,
          debit: 0,
          credit: totals.grand_total,
          notes: payload.notes || null,
          userId,
        });

        const receipt = this.getReceipt(receiptId);
        this.auditRepository.create({
          userId,
          action: 'CREATE',
          entityType: 'purchase_receipts',
          entityId: receiptId,
          newValue: receipt,
        });

        return receipt;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  getReturn(id) {
    const purchaseReturn = this.repository.findPurchaseReturnById(id);
    if (!purchaseReturn) {
      throw new AppError('Purchase return not found.', 404, 'PURCHASE_RETURN_NOT_FOUND');
    }

    return {
      ...purchaseReturn,
      items: this.repository.listPurchaseReturnItems(id),
    };
  }

  createReturn(payload, userId) {
    required(payload.supplier_id, 'Supplier');
    const supplier = this.repository.findSupplierById(payload.supplier_id);
    if (!supplier) {
      throw new AppError('Supplier was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    const items = this.validateItems(payload.items, { requireBatch: true });

    try {
      return this.repository.transaction(() => {
        const returnId = this.repository.createPurchaseReturn({
          return_number: payload.return_number || code('PR'),
          purchase_id: payload.purchase_id || null,
          supplier_id: supplier.id,
          return_date: payload.return_date || new Date().toISOString().slice(0, 10),
          notes: payload.notes || null,
          created_by: userId,
        });

        const totals = items.reduce((sum, item) => {
          const amounts = lineAmounts(item);
          const stockOut = this.inventoryService.stockOut({
            itemId: item.item_id,
            warehouseId: item.warehouse_id,
            batchId: item.batch_id,
            quantity: item.quantity,
            transactionType: 'Return',
            referenceType: 'purchase_returns',
            referenceId: returnId,
            notes: payload.notes || null,
            userId,
          });

          this.repository.createPurchaseReturnItem({
            purchase_return_id: returnId,
            item_id: item.item_id,
            batch_id: item.batch_id,
            warehouse_id: item.warehouse_id,
            quantity: amounts.quantity,
            unit_cost: amounts.purchaseCost || stockOut.unitCost,
            gst_rate: amounts.gstRate,
            gst_amount: amounts.gstAmount,
            line_total: amounts.lineTotal,
          });

          return {
            subtotal: money(sum.subtotal + (amounts.quantity * amounts.purchaseCost)),
            gst_total: money(sum.gst_total + amounts.gstAmount),
            grand_total: money(sum.grand_total + amounts.lineTotal),
          };
        }, { subtotal: 0, gst_total: 0, grand_total: 0 });

        this.repository.updatePurchaseReturnTotals(returnId, totals);
        this.recordSupplierLedger({
          supplierId: supplier.id,
          entryDate: payload.return_date || new Date().toISOString().slice(0, 10),
          entryType: 'Return',
          referenceType: 'purchase_returns',
          referenceId: returnId,
          debit: totals.grand_total,
          credit: 0,
          notes: payload.notes || null,
          userId,
        });

        const purchaseReturn = this.getReturn(returnId);
        this.auditRepository.create({
          userId,
          action: 'CREATE',
          entityType: 'purchase_returns',
          entityId: returnId,
          newValue: purchaseReturn,
        });

        return purchaseReturn;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  validateItems(items, { requireBatch }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('At least one purchase item is required.', 400, 'VALIDATION_ERROR');
    }

    return items.map((item) => {
      required(item.item_id, 'Item');
      required(item.warehouse_id, 'Warehouse');
      required(item.quantity, 'Quantity');

      if (requireBatch) {
        required(item.batch_number ?? item.batch_id, 'Batch');
      }

      const inventoryItem = this.repository.findItemById(item.item_id);
      if (!inventoryItem) {
        throw new AppError('Inventory item was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
      }

      if (!this.repository.findWarehouseById(item.warehouse_id)) {
        throw new AppError('Warehouse was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
      }

      const quantity = number(item.quantity);
      if (quantity <= 0) {
        throw new AppError('Quantity must be greater than zero.', 400, 'VALIDATION_ERROR');
      }

      const purchaseCost = money(item.purchase_cost ?? item.unit_cost ?? inventoryItem.purchase_cost);
      if (purchaseCost < 0) {
        throw new AppError('Purchase cost cannot be negative.', 400, 'VALIDATION_ERROR');
      }

      const sellingPrice = money(item.selling_price ?? inventoryItem.selling_price);
      if (sellingPrice < 0) {
        throw new AppError('Selling price cannot be negative.', 400, 'VALIDATION_ERROR');
      }

      const gstRate = number(item.gst_rate ?? inventoryItem.gst_rate);
      if (gstRate < 0 || gstRate > 100) {
        throw new AppError('GST rate must be between 0 and 100.', 400, 'VALIDATION_ERROR');
      }

      return {
        item_id: Number(item.item_id),
        warehouse_id: Number(item.warehouse_id),
        batch_id: item.batch_id ? Number(item.batch_id) : null,
        batch_number: item.batch_number ? String(item.batch_number).trim() : null,
        manufacture_date: item.manufacture_date || null,
        expiry_date: item.expiry_date || null,
        quantity,
        purchase_cost: purchaseCost,
        selling_price: sellingPrice,
        gst_rate: gstRate,
      };
    });
  }

  createPurchaseItems({ source, sourceId, supplierId = null, items, userId = null }) {
    return items.reduce((sum, item) => {
      const amounts = lineAmounts(item);
      const stockIn = source === 'receipt'
        ? this.inventoryService.stockIn({
          itemId: item.item_id,
          warehouseId: item.warehouse_id,
          supplierId,
          batchNumber: item.batch_number,
          manufactureDate: item.manufacture_date,
          expiryDate: item.expiry_date,
          quantity: item.quantity,
          unitCost: item.purchase_cost,
          transactionType: 'Purchase',
          referenceType: 'purchase_receipts',
          referenceId: sourceId,
          notes: 'Purchase receipt',
          userId,
        })
        : null;

      this.repository.createPurchaseItem({
        purchase_id: null,
        purchase_order_id: source === 'order' ? sourceId : null,
        purchase_receipt_id: source === 'receipt' ? sourceId : null,
        item_id: item.item_id,
        warehouse_id: item.warehouse_id,
        batch_id: stockIn?.batch.id || item.batch_id,
        batch_number: item.batch_number,
        manufacture_date: item.manufacture_date,
        expiry_date: item.expiry_date,
        quantity: amounts.quantity,
        purchase_cost: amounts.purchaseCost,
        selling_price: item.selling_price,
        gst_rate: amounts.gstRate,
        gst_amount: amounts.gstAmount,
        line_total: amounts.lineTotal,
      });

      return {
        subtotal: money(sum.subtotal + (amounts.quantity * amounts.purchaseCost)),
        gst_total: money(sum.gst_total + amounts.gstAmount),
        grand_total: money(sum.grand_total + amounts.lineTotal),
      };
    }, { subtotal: 0, gst_total: 0, grand_total: 0 });
  }

  recordSupplierLedger({
    supplierId,
    entryDate,
    entryType,
    referenceType,
    referenceId,
    debit,
    credit,
    notes,
    userId,
  }) {
    const balance = money(this.repository.latestSupplierBalance(supplierId) + credit - debit);
    this.repository.createSupplierLedger({
      supplier_id: supplierId,
      entry_date: entryDate,
      entry_type: entryType,
      reference_type: referenceType,
      reference_id: referenceId,
      debit: money(debit),
      credit: money(credit),
      balance_after: balance,
      notes,
      created_by: userId,
    });
  }

  withPagination(result, query) {
    return {
      data: result.data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
  }
  getSupplierLedger(supplierId, query = {}) {
    const supplier = this.repository.findSupplierById(supplierId);
    if (!supplier) {
      throw new AppError('Supplier was not found.', 404, 'SUPPLIER_NOT_FOUND');
    }

    const parsed = parseListQuery(query);
    const result = this.repository.listSupplierLedger(supplierId, {
      limit: parsed.pageSize,
      offset: parsed.offset
    });

    return this.withPagination(result, parsed);
  }
}

export function createPurchasingService(db) {
  return new PurchasingService(db);
}
