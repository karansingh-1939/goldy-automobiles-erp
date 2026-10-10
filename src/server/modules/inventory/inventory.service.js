import { localDate } from '../../shared/utils/local-date.js';
import { AppError } from '../../shared/errors/app-error.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { InventoryRepository } from './inventory.repository.js';
import { getStarterCatalog } from './starter-catalog.js';
import { AccountingPostingEngine } from '../accounting/posting-engine.service.js';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.round(number(value) * 100) / 100;
}

const roundMoney = money;

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
    return new AppError(
      'A record with the same unique value already exists.',
      409,
      'DUPLICATE_RECORD',
    );
  }

  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new AppError('Related record was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
  }

  if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
    return new AppError('Record violates a database constraint.', 400, 'CONSTRAINT_FAILED');
  }

  return error;
}

export class InventoryService {
  constructor(db) {
    this.db = db;
    this.repository = new InventoryRepository(db);
    this.auditRepository = new AuditRepository(db);
    this.postingEngine = new AccountingPostingEngine(db);
  }

  getPermittedWarehouseIds(userId) {
    if (!userId) return [];
    const user = this.db.prepare('SELECT role_id FROM users WHERE id = ?').get(userId);
    if (user) {
      const role = this.db.prepare('SELECT name FROM roles WHERE id = ?').get(user.role_id);
      if (role && role.name === 'Admin') {
        return this.db
          .prepare('SELECT id FROM warehouses WHERE is_active = 1')
          .all()
          .map((r) => r.id);
      }
    }
    const rows = this.db
      .prepare('SELECT warehouse_id FROM user_warehouses WHERE user_id = ?')
      .all(userId);
    if (rows.length > 0) {
      return rows.map((r) => r.warehouse_id);
    }
    return this.db
      .prepare('SELECT id FROM warehouses WHERE is_active = 1')
      .all()
      .map((r) => r.id);
  }

  assertWarehousePermission(userId, warehouseId) {
    if (!userId) return; // skip checks if no userId is present (e.g. system seed scripts)
    const permittedIds = this.getPermittedWarehouseIds(userId);
    if (!permittedIds.includes(Number(warehouseId))) {
      throw new AppError(
        'You do not have permission to access this warehouse.',
        403,
        'PERMISSION_DENIED',
      );
    }
  }

  getWarehousePermissions(warehouseId) {
    const rows = this.db
      .prepare('SELECT user_id FROM user_warehouses WHERE warehouse_id = ?')
      .all(warehouseId);
    return { userIds: rows.map((r) => r.user_id) };
  }

  saveWarehousePermissions(warehouseId, { userIds }) {
    if (!Array.isArray(userIds)) {
      throw new AppError('User IDs must be an array.', 400, 'VALIDATION_ERROR');
    }

    return this.repository.transaction(() => {
      this.db.prepare('DELETE FROM user_warehouses WHERE warehouse_id = ?').run(warehouseId);
      const insert = this.db.prepare(
        'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES (?, ?)',
      );
      for (const uid of userIds) {
        insert.run(uid, warehouseId);
      }
      return { success: true };
    });
  }

  listItems(query) {
    const page = Math.max(Number.parseInt(query.page || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '20', 10) || 20, 1), 100);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const result = this.repository.listItems({
      search,
      pageSize,
      offset: (page - 1) * pageSize,
    });

    return {
      data: result.data,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  getItem(id) {
    const item = this.repository.findItemById(id);
    if (!item) {
      throw new AppError('Inventory item not found.', 404, 'ITEM_NOT_FOUND');
    }
    return item;
  }

  getItemBatches(itemId) {
    return this.repository.db
      .prepare(
        `
      SELECT b.*, w.name AS warehouse_name
      FROM inventory_batches b
      JOIN warehouses w ON b.warehouse_id = w.id
      WHERE b.item_id = ?
    `,
      )
      .all(itemId);
  }

  createItem(payload, userId) {
    let skuVal = payload.sku;
    if (skuVal === undefined || skuVal === null || String(skuVal).trim() === '') {
      skuVal = this.generateSequentialSku();
    }

    const payloadWithSku = {
      ...payload,
      sku: skuVal,
    };

    const data = this.validateItemPayload(payloadWithSku);

    try {
      return this.repository.transaction(() => {
        const item = this.repository.createItem(data);
        this.auditRepository.create({
          userId,
          action: 'CREATE',
          entityType: 'inventory_items',
          entityId: item.id,
          newValue: item,
        });
        return item;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  updateItem(id, payload, userId) {
    const existing = this.getItem(id);
    const data = this.validateItemPayload(payload, { partial: true });

    if (Object.keys(data).length === 0) {
      throw new AppError('At least one field is required.', 400, 'VALIDATION_ERROR');
    }

    try {
      return this.repository.transaction(() => {
        const item = this.repository.updateItem(id, data);
        this.auditRepository.create({
          userId,
          action: 'UPDATE',
          entityType: 'inventory_items',
          entityId: item.id,
          oldValue: existing,
          newValue: item,
        });
        return item;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  validateItemPayload(payload, { partial = false } = {}) {
    if (!partial || payload.sku !== undefined) {
      required(payload.sku, 'SKU');
      const skuVal = String(payload.sku).trim().toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(skuVal)) {
        throw new AppError('SKU must be alphanumeric.', 400, 'VALIDATION_ERROR');
      }
    }

    if (!partial || payload.item_name !== undefined || payload.itemName !== undefined) {
      required(payload.item_name ?? payload.itemName, 'Item name');
    }

    if (payload.gst_rate !== undefined) {
      const gst = number(payload.gst_rate);
      if (gst < 0 || gst > 100) {
        throw new AppError('GST rate must be between 0 and 100.', 400, 'VALIDATION_ERROR');
      }
    }

    if (payload.purchase_cost !== undefined) {
      if (number(payload.purchase_cost) < 0) {
        throw new AppError('Purchase cost cannot be negative.', 400, 'VALIDATION_ERROR');
      }
    }

    if (payload.selling_price !== undefined) {
      if (number(payload.selling_price) < 0) {
        throw new AppError('Selling price cannot be negative.', 400, 'VALIDATION_ERROR');
      }
    }

    if (payload.reorder_level !== undefined || payload.minimum_stock !== undefined) {
      const minStock = number(payload.reorder_level ?? payload.minimum_stock);
      if (minStock < 0) {
        throw new AppError('Minimum stock level cannot be negative.', 400, 'VALIDATION_ERROR');
      }
    }

    if (payload.warranty_period_months !== undefined) {
      const warranty = Number(payload.warranty_period_months);
      if (!Number.isInteger(warranty) || warranty < 0) {
        throw new AppError(
          'Warranty period must be a non-negative integer.',
          400,
          'VALIDATION_ERROR',
        );
      }
    }

    const categoryId =
      payload.category_id === undefined ? null : Number.parseInt(payload.category_id, 10);
    const supplierId =
      payload.supplier_id === undefined ? null : Number.parseInt(payload.supplier_id, 10);

    if (categoryId && !this.repository.findCategoryById(categoryId)) {
      throw new AppError('Inventory category was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    if (supplierId && !this.repository.findSupplierById(supplierId)) {
      throw new AppError('Supplier was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    const data = {};

    if (payload.sku !== undefined) data.sku = String(payload.sku).trim().toUpperCase();
    if (payload.barcode !== undefined || !partial)
      data.barcode = payload.barcode ? String(payload.barcode).trim() : null;
    if (payload.item_name !== undefined || payload.itemName !== undefined) {
      data.item_name = String(payload.item_name ?? payload.itemName).trim();
    }
    if (payload.category !== undefined || !partial)
      data.category = payload.category ? String(payload.category).trim() : null;
    if (payload.category_id !== undefined || !partial) data.category_id = categoryId || null;
    if (payload.supplier_id !== undefined || !partial) data.supplier_id = supplierId || null;
    if (payload.hsn_code !== undefined || !partial)
      data.hsn_code = payload.hsn_code ? String(payload.hsn_code).trim() : null;
    if (payload.gst_rate !== undefined || !partial)
      data.gst_rate = number(payload.gst_rate !== undefined ? payload.gst_rate : 18);
    if (payload.purchase_cost !== undefined || !partial)
      data.purchase_cost = money(payload.purchase_cost);
    if (payload.selling_price !== undefined || !partial)
      data.selling_price = money(payload.selling_price);
    if (payload.reorder_level !== undefined || payload.minimum_stock !== undefined || !partial) {
      data.reorder_level = number(
        payload.reorder_level !== undefined
          ? payload.reorder_level
          : payload.minimum_stock !== undefined
            ? payload.minimum_stock
            : 5,
      );
    }
    if (payload.unit_of_measure !== undefined || !partial) {
      data.unit_of_measure = payload.unit_of_measure
        ? String(payload.unit_of_measure).trim()
        : 'pcs';
    }
    if (payload.is_active !== undefined || !partial) {
      data.is_active = payload.is_active === false || payload.is_active === 0 ? 0 : 1;
    }
    if (payload.warranty_period_months !== undefined || !partial) {
      data.warranty_period_months =
        payload.warranty_period_months === undefined
          ? 0
          : Number.parseInt(payload.warranty_period_months, 10);
    }

    return data;
  }

  createOpeningStock(payload, userId) {
    required(payload.item_id, 'Item');
    required(payload.warehouse_id, 'Warehouse');

    const qty = number(payload.quantity);
    if (qty <= 0) {
      throw new AppError('Quantity must be greater than zero.', 400, 'VALIDATION_ERROR');
    }

    const unitCost = money(payload.unit_cost);
    if (unitCost < 0) {
      throw new AppError('Unit cost cannot be negative.', 400, 'VALIDATION_ERROR');
    }

    return this.repository.transaction(() => {
      const adjustmentId = this.repository.createStockAdjustment({
        adjustment_number: code('OPEN'),
        item_id: payload.item_id,
        batch_id: null,
        warehouse_id: payload.warehouse_id,
        adjustment_type: 'OPENING',
        quantity: qty,
        unit_cost: unitCost,
        reason: payload.reason || 'Opening stock',
        created_by: userId,
      });

      const result = this.stockIn({
        itemId: payload.item_id,
        warehouseId: payload.warehouse_id,
        supplierId: payload.supplier_id || null,
        batchNumber: payload.batch_number,
        manufactureDate: payload.manufacture_date || null,
        expiryDate: payload.expiry_date || null,
        quantity: qty,
        unitCost: unitCost,
        transactionType: 'Opening Stock',
        referenceType: 'stock_adjustments',
        referenceId: adjustmentId,
        notes: payload.reason || 'Opening stock',
        userId,
      });

      const value = money(qty * unitCost);
      if (value > 0) {
        const voucher = this.postingEngine.post({
          companyId: 1,
          voucherType: 'Journal',
          voucherDate: payload.opening_date || localDate(),
          referenceTable: 'stock_adjustments',
          referenceId: adjustmentId,
          narration: 'Opening inventory',
          created_by: userId,
          entries: [
            {
              ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'inventory_stock'),
              type: 'DEBIT',
              amount: value,
            },
            {
              ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'capital_account'),
              type: 'CREDIT',
              amount: value,
            },
          ],
        });
        this.db
          .prepare('UPDATE stock_adjustments SET voucher_id=? WHERE id=?')
          .run(voucher.voucherId, adjustmentId);
      }

      return { adjustmentId, ...result };
    });
  }

  createAdjustment(payload, userId) {
    const itemId = Number(payload.item_id || payload.itemId);
    required(itemId, 'Item');

    const warehouseId = Number(payload.warehouse_id || payload.warehouseId || 1);
    this.assertWarehousePermission(userId, warehouseId);

    let adjustmentType = payload.adjustment_type || payload.adjustmentType;
    if (!adjustmentType && payload.action) {
      adjustmentType = String(payload.action).toUpperCase() === 'ADD' ? 'IN' : 'OUT';
    }
    required(adjustmentType, 'Adjustment type');
    adjustmentType = String(adjustmentType).toUpperCase();
    if (!['IN', 'OUT'].includes(adjustmentType)) {
      throw new AppError('Adjustment type must be IN or OUT.', 400, 'VALIDATION_ERROR');
    }

    const qty = number(payload.quantity);
    if (qty <= 0) {
      throw new AppError('Quantity must be greater than zero.', 400, 'VALIDATION_ERROR');
    }

    const category = payload.category || 'NORMAL';
    if (!['DAMAGED', 'LOST', 'EXPIRED', 'OPENING_CORRECTION', 'NORMAL'].includes(category)) {
      throw new AppError('Invalid stock adjustment category.', 400, 'VALIDATION_ERROR');
    }

    const item = this.getItem(itemId);
    const unitCost =
      payload.unit_cost !== undefined
        ? money(payload.unit_cost)
        : money(item.average_cost || item.purchase_cost || 0);

    return this.repository.transaction(() => {
      let batchId = payload.batch_id || payload.batchId;
      let batchNumber = payload.batch_number || payload.batchNumber;
      let stockResult = null;
      let adjustmentId = null;

      if (adjustmentType === 'IN') {
        if (!batchNumber) {
          const existingBatch = this.db
            .prepare(
              `
            SELECT id, batch_number 
            FROM inventory_batches 
            WHERE item_id = ? AND warehouse_id = ?
            ORDER BY id DESC LIMIT 1
          `,
            )
            .get(itemId, warehouseId);

          if (existingBatch) {
            batchNumber = existingBatch.batch_number;
            batchId = existingBatch.id;
          } else {
            batchNumber = `BAT-${item.sku}-OPEN`;
          }
        }

        adjustmentId = this.repository.createStockAdjustment({
          adjustment_number: code('ADJ'),
          item_id: itemId,
          batch_id: batchId || null,
          warehouse_id: warehouseId,
          adjustment_type: adjustmentType,
          quantity: qty,
          unit_cost: unitCost,
          reason: payload.reason || null,
          created_by: userId,
        });

        stockResult = this.stockIn({
          itemId,
          warehouseId,
          supplierId: payload.supplier_id || item.supplier_id || 1,
          batchNumber,
          manufactureDate: payload.manufacture_date || null,
          expiryDate: payload.expiry_date || null,
          quantity: qty,
          unitCost: unitCost,
          transactionType: 'Adjustment',
          referenceType: 'stock_adjustments',
          referenceId: adjustmentId,
          notes: payload.reason || null,
          userId,
        });

        if (stockResult.batch?.id) {
          this.db
            .prepare('UPDATE stock_adjustments SET batch_id = ? WHERE id = ?')
            .run(stockResult.batch.id, adjustmentId);
        }
      } else {
        if (!batchId) {
          let selectedBatch = this.db
            .prepare(
              `
            SELECT id, batch_number 
            FROM inventory_batches 
            WHERE item_id = ? AND warehouse_id = ? AND quantity > 0
            ORDER BY id ASC LIMIT 1
          `,
            )
            .get(itemId, warehouseId);

          if (!selectedBatch) {
            selectedBatch = this.db
              .prepare(
                `
              SELECT id, batch_number 
              FROM inventory_batches 
              WHERE item_id = ? AND warehouse_id = ?
              ORDER BY id DESC LIMIT 1
            `,
              )
              .get(itemId, warehouseId);
          }

          if (selectedBatch) {
            batchId = selectedBatch.id;
            batchNumber = selectedBatch.batch_number;
          } else {
            const defaultBatchNum = `BAT-${item.sku}-OPEN`;
            const newBatch = this.repository.createBatch({
              item_id: itemId,
              warehouse_id: warehouseId,
              supplier_id: item.supplier_id || 1,
              batch_number: defaultBatchNum,
              purchase_cost: item.purchase_cost || 0,
              selling_price: item.selling_price || 0,
              quantity: 0,
            });
            batchId = newBatch.id;
            batchNumber = defaultBatchNum;
          }
        }

        adjustmentId = this.repository.createStockAdjustment({
          adjustment_number: code('ADJ'),
          item_id: itemId,
          batch_id: batchId,
          warehouse_id: warehouseId,
          adjustment_type: adjustmentType,
          quantity: qty,
          unit_cost: unitCost,
          reason: payload.reason || null,
          created_by: userId,
        });

        stockResult = this.stockOut({
          itemId,
          warehouseId,
          batchId,
          quantity: qty,
          transactionType: 'Adjustment',
          referenceType: 'stock_adjustments',
          referenceId: adjustmentId,
          notes: payload.reason || null,
          userId,
        });
      }

      // Update category
      this.db
        .prepare('UPDATE stock_adjustments SET category = ? WHERE id = ?')
        .run(category, adjustmentId);

      // Post double-entry Journal voucher for inventory valuation changes
      const companyId = 1;
      const totalVal = roundMoney(qty * unitCost);

      const ledgerEntries = [
        {
          ledgerId: this.postingEngine.ledgerResolver.getLedgerId(
            companyId,
            adjustmentType === 'IN' ? 'inventory_stock' : 'stock_adjustments',
          ),
          type: 'DEBIT',
          amount: totalVal,
          narration: `Stock Adjustment ${category}: ${item.item_name}`,
        },
        {
          ledgerId: this.postingEngine.ledgerResolver.getLedgerId(
            companyId,
            adjustmentType === 'IN' ? 'stock_adjustments' : 'inventory_stock',
          ),
          type: 'CREDIT',
          amount: totalVal,
          narration: `Stock Adjustment ${category}: ${item.item_name}`,
        },
      ];

      const voucher = this.postingEngine.post({
        companyId,
        voucherType: 'Journal',
        voucherDate: localDate(),
        narration: payload.reason || `Stock Adjustment ${category} for ${item.item_name}`,
        referenceTable: 'stock_adjustments',
        referenceId: adjustmentId,
        entries: ledgerEntries,
      });

      this.db
        .prepare('UPDATE stock_adjustments SET voucher_id = ? WHERE id = ?')
        .run(voucher.voucherId, adjustmentId);

      return {
        adjustmentId,
        category,
        voucherId: voucher.voucherId,
        ...stockResult,
      };
    });
  }

  transferStock(payload, userId) {
    required(payload.item_id, 'Item');
    required(payload.from_warehouse_id, 'From warehouse');
    required(payload.to_warehouse_id, 'To warehouse');
    required(payload.quantity, 'Quantity');

    const qty = number(payload.quantity);
    if (qty <= 0) {
      throw new AppError('Quantity must be greater than zero.', 400, 'VALIDATION_ERROR');
    }

    if (Number(payload.from_warehouse_id) === Number(payload.to_warehouse_id)) {
      throw new AppError('Warehouses must be different.', 400, 'VALIDATION_ERROR');
    }

    this.assertWarehousePermission(userId, payload.from_warehouse_id);
    this.assertWarehousePermission(userId, payload.to_warehouse_id);

    return this.repository.transaction(() => {
      const item = this.getItem(payload.item_id);
      let sourceBatch = null;

      if (payload.batch_id) {
        sourceBatch = this.repository.findBatchById(payload.batch_id);
      } else {
        // Resolve batch via FIFO
        sourceBatch = this.db
          .prepare(
            `
          SELECT * FROM inventory_batches 
          WHERE item_id = ? AND warehouse_id = ? AND quantity >= ?
          ORDER BY id ASC LIMIT 1
        `,
          )
          .get(payload.item_id, payload.from_warehouse_id, qty);
      }

      if (
        !sourceBatch ||
        Number(sourceBatch.item_id) !== Number(payload.item_id) ||
        Number(sourceBatch.warehouse_id) !== Number(payload.from_warehouse_id)
      ) {
        throw new AppError(
          'No suitable batch found in the source warehouse with enough stock.',
          400,
          'RELATED_RECORD_NOT_FOUND',
        );
      }

      const transferId = this.repository.createStockTransfer({
        transfer_number: code('TRF'),
        item_id: payload.item_id,
        batch_id: sourceBatch.id,
        from_warehouse_id: payload.from_warehouse_id,
        to_warehouse_id: payload.to_warehouse_id,
        quantity: qty,
        shipped_quantity: qty,
        received_quantity: null,
        unit_cost: money(item.average_cost || sourceBatch.purchase_cost),
        status: 'PENDING',
        notes: payload.notes || null,
        created_by: userId,
      });

      const out = this.stockOut({
        itemId: payload.item_id,
        warehouseId: payload.from_warehouse_id,
        batchId: sourceBatch.id,
        quantity: qty,
        transactionType: 'Transfer',
        referenceType: 'stock_transfers',
        referenceId: transferId,
        notes: payload.notes || null,
        userId,
      });

      return {
        transferId,
        transferNumber: this.db
          .prepare('SELECT transfer_number FROM stock_transfers WHERE id = ?')
          .get(transferId).transfer_number,
        status: 'PENDING',
        out,
      };
    });
  }

  receiveTransfer(transferId, payload, userId) {
    return this.repository.transaction(() => {
      const transfer = this.db
        .prepare('SELECT * FROM stock_transfers WHERE id = ?')
        .get(transferId);
      if (!transfer) {
        throw new AppError('Stock transfer record not found.', 404, 'TRANSFER_NOT_FOUND');
      }
      if (transfer.status !== 'PENDING') {
        throw new AppError(
          `Cannot receive transfer in status ${transfer.status}.`,
          400,
          'VALIDATION_ERROR',
        );
      }

      this.assertWarehousePermission(userId, transfer.to_warehouse_id);

      const receivedQty =
        payload.receivedQuantity !== undefined
          ? number(payload.receivedQuantity)
          : transfer.quantity;
      if (receivedQty < 0 || receivedQty > transfer.quantity) {
        throw new AppError(
          'Received quantity must be non-negative and less than or equal to shipped quantity.',
          400,
          'VALIDATION_ERROR',
        );
      }

      const sourceBatch = this.repository.findBatchById(transfer.batch_id);
      if (!sourceBatch) {
        throw new AppError('Original batch not found.', 404, 'BATCH_NOT_FOUND');
      }

      let into = null;
      if (receivedQty > 0) {
        into = this.stockIn({
          itemId: transfer.item_id,
          warehouseId: transfer.to_warehouse_id,
          supplierId: sourceBatch.supplier_id,
          batchNumber: sourceBatch.batch_number,
          manufactureDate: sourceBatch.manufacture_date,
          expiryDate: sourceBatch.expiry_date,
          quantity: receivedQty,
          unitCost: transfer.unit_cost,
          transactionType: 'Transfer',
          referenceType: 'stock_transfers',
          referenceId: transferId,
          notes: transfer.notes || null,
          userId,
          keepAverageCost: true,
        });
      }

      // Handle variance/loss: if receivedQty < shipped qty, adjust out the loss as DAMAGED/LOST
      const variance = transfer.quantity - receivedQty;
      let varianceAdjustmentId = null;
      if (variance > 0) {
        varianceAdjustmentId = this.repository.createStockAdjustment({
          adjustment_number: code('ADJ'),
          item_id: transfer.item_id,
          batch_id: transfer.batch_id,
          warehouse_id: transfer.from_warehouse_id,
          adjustment_type: 'OUT',
          quantity: variance,
          unit_cost: transfer.unit_cost,
          reason: `Transfer Variance Loss (Transfer ${transfer.transfer_number})`,
          created_by: userId,
        });

        // Add category as LOST/DAMAGED
        this.db
          .prepare("UPDATE stock_adjustments SET category = 'LOST' WHERE id = ?")
          .run(varianceAdjustmentId);

        // We post the double entry Journal voucher for this loss value!
        this.getItem(transfer.item_id);
        const companyId = 1;
        const lossVal = roundMoney(variance * transfer.unit_cost);

        const ledgerEntries = [
          {
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'stock_adjustments'),
            type: 'DEBIT',
            amount: lossVal,
            narration: `Loss write-off: Transfer Variance ${transfer.transfer_number}`,
          },
          {
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(companyId, 'inventory_stock'),
            type: 'CREDIT',
            amount: lossVal,
            narration: `Loss write-off: Transfer Variance ${transfer.transfer_number}`,
          },
        ];

        const voucher = this.postingEngine.post({
          companyId,
          voucherType: 'Journal',
          voucherDate: localDate(),
          narration: `Transfer Variance Write-Off: Transfer ${transfer.transfer_number}`,
          referenceTable: 'stock_adjustments',
          referenceId: varianceAdjustmentId,
          entries: ledgerEntries,
        });

        this.db
          .prepare('UPDATE stock_adjustments SET voucher_id = ? WHERE id = ?')
          .run(voucher.voucherId, varianceAdjustmentId);
      }

      this.db
        .prepare(
          `
        UPDATE stock_transfers 
        SET status = 'COMPLETED', received_quantity = ?, received_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `,
        )
        .run(receivedQty, transferId);

      return {
        transferId,
        status: 'COMPLETED',
        receivedQuantity: receivedQty,
        variance,
        in: into,
        varianceAdjustmentId,
      };
    });
  }

  cancelTransfer(transferId, userId) {
    return this.repository.transaction(() => {
      const transfer = this.db
        .prepare('SELECT * FROM stock_transfers WHERE id = ?')
        .get(transferId);
      if (!transfer) {
        throw new AppError('Stock transfer record not found.', 404, 'TRANSFER_NOT_FOUND');
      }
      if (transfer.status === 'CANCELLED') {
        throw new AppError('Transfer is already cancelled.', 400, 'VALIDATION_ERROR');
      }

      this.assertWarehousePermission(userId, transfer.from_warehouse_id);
      this.assertWarehousePermission(userId, transfer.to_warehouse_id);

      const sourceBatch = this.repository.findBatchById(transfer.batch_id);

      if (transfer.status === 'PENDING') {
        // Return shipped qty to source
        this.stockIn({
          itemId: transfer.item_id,
          warehouseId: transfer.from_warehouse_id,
          supplierId: sourceBatch.supplier_id,
          batchNumber: sourceBatch.batch_number,
          manufactureDate: sourceBatch.manufacture_date,
          expiryDate: sourceBatch.expiry_date,
          quantity: transfer.quantity,
          unitCost: transfer.unit_cost,
          transactionType: 'Transfer',
          referenceType: 'stock_transfers',
          referenceId: transferId,
          notes: 'Transfer Cancelled: Returned to Source',
          userId,
          keepAverageCost: true,
        });
      } else if (transfer.status === 'COMPLETED') {
        // COMPLETED transfer reversal
        // 1. Stock out the received quantity from destination
        if (transfer.received_quantity > 0) {
          // Resolve batch at destination matching the transfer batch number
          const destBatch = this.db
            .prepare(
              `
            SELECT id FROM inventory_batches 
            WHERE item_id = ? AND warehouse_id = ? AND batch_number = ?
          `,
            )
            .get(transfer.item_id, transfer.to_warehouse_id, sourceBatch.batch_number);

          if (!destBatch) {
            throw new AppError(
              'Destination batch not found during reversal.',
              400,
              'VALIDATION_ERROR',
            );
          }

          this.stockOut({
            itemId: transfer.item_id,
            warehouseId: transfer.to_warehouse_id,
            batchId: destBatch.id,
            quantity: transfer.received_quantity,
            transactionType: 'Transfer',
            referenceType: 'stock_transfers',
            referenceId: transferId,
            notes: 'Transfer Reversed: Shipped back',
            userId,
          });
        }

        // 2. Return total shipped quantity back to source
        this.stockIn({
          itemId: transfer.item_id,
          warehouseId: transfer.from_warehouse_id,
          supplierId: sourceBatch.supplier_id,
          batchNumber: sourceBatch.batch_number,
          manufactureDate: sourceBatch.manufacture_date,
          expiryDate: sourceBatch.expiry_date,
          quantity: transfer.quantity,
          unitCost: transfer.unit_cost,
          transactionType: 'Transfer',
          referenceType: 'stock_transfers',
          referenceId: transferId,
          notes: 'Transfer Reversed: Returned to Source',
          userId,
          keepAverageCost: true,
        });

        // 3. Reverse any variance adjustments and their vouchers
        const adjustments = this.db
          .prepare('SELECT id, voucher_id FROM stock_adjustments WHERE reason LIKE ?')
          .all(`%Transfer ${transfer.transfer_number}%`);
        for (const adj of adjustments) {
          if (adj.voucher_id) {
            // Cancel the voucher in PostingEngine
            this.postingEngine.deleteVoucher(1, adj.voucher_id);
          }
          this.db.prepare('DELETE FROM stock_adjustments WHERE id = ?').run(adj.id);
        }
      }

      this.db
        .prepare("UPDATE stock_transfers SET status = 'CANCELLED' WHERE id = ?")
        .run(transferId);
      return { id: transferId, status: 'CANCELLED' };
    });
  }

  getAvailableQuantity(
    itemId,
    warehouseId = null,
    batchId = null,
    excludeRefTable = null,
    excludeRefId = null,
  ) {
    let physicalQty = 0;
    if (batchId) {
      const batch = this.repository.findBatchById(batchId);
      physicalQty = batch ? number(batch.quantity) : 0;
    } else if (warehouseId) {
      const row = this.db
        .prepare(
          'SELECT SUM(quantity) AS total FROM inventory_batches WHERE item_id = ? AND warehouse_id = ?',
        )
        .get(itemId, warehouseId);
      physicalQty = number(row?.total);
    } else {
      const item = this.repository.findItemById(itemId);
      physicalQty = item ? number(item.current_quantity) : 0;
    }

    let reserveQuery = `
      SELECT SUM(quantity) AS total 
      FROM inventory_reservations 
      WHERE item_id = ? AND status = 'ACTIVE'
    `;
    const params = [itemId];

    if (warehouseId) {
      reserveQuery += ' AND warehouse_id = ?';
      params.push(warehouseId);
    }
    if (batchId) {
      reserveQuery += ' AND batch_id = ?';
      params.push(batchId);
    }
    if (excludeRefTable && excludeRefId) {
      reserveQuery += ' AND NOT (reference_table = ? AND reference_id = ?)';
      params.push(excludeRefTable, excludeRefId);
    }

    const resRow = this.db.prepare(reserveQuery).get(...params);
    const reservedQty = number(resRow?.total);

    return Math.max(0, physicalQty - reservedQty);
  }

  reserveStock(payload, userId) {
    const {
      itemId,
      warehouseId,
      batchId = null,
      quantity,
      referenceTable,
      referenceId,
      companyId = 1,
    } = payload;
    required(itemId, 'Item');
    required(warehouseId, 'Warehouse');
    required(quantity, 'Quantity');
    required(referenceTable, 'Reference table');
    required(referenceId, 'Reference ID');

    const qty = number(quantity);
    if (qty <= 0) {
      throw new AppError('Quantity must be positive.', 400, 'VALIDATION_ERROR');
    }

    this.assertWarehousePermission(userId, warehouseId);

    return this.repository.transaction(() => {
      const available = this.getAvailableQuantity(itemId, warehouseId, batchId);
      if (qty > available) {
        throw new AppError(
          `Insufficient available stock. Requested: ${qty}, Available: ${available}`,
          400,
          'INSUFFICIENT_STOCK',
        );
      }

      const result = this.db
        .prepare(
          `
        INSERT INTO inventory_reservations (company_id, item_id, warehouse_id, batch_id, quantity, reference_table, reference_id, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `,
        )
        .run(
          companyId,
          itemId,
          warehouseId,
          batchId || null,
          qty,
          referenceTable,
          referenceId,
          userId,
        );

      const reservationId = result.lastInsertRowid;
      return this.db
        .prepare('SELECT * FROM inventory_reservations WHERE id = ?')
        .get(reservationId);
    });
  }

  cancelReservation(reservationId, userId) {
    return this.repository.transaction(() => {
      const res = this.db
        .prepare('SELECT * FROM inventory_reservations WHERE id = ?')
        .get(reservationId);
      if (!res) {
        throw new AppError('Reservation not found.', 404, 'RESERVATION_NOT_FOUND');
      }
      if (res.status !== 'ACTIVE') {
        throw new AppError(
          `Cannot cancel a reservation with status ${res.status}.`,
          400,
          'VALIDATION_ERROR',
        );
      }

      this.db
        .prepare(
          "UPDATE inventory_reservations SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .run(reservationId);
      return { id: reservationId, status: 'CANCELLED' };
    });
  }

  stockIn({
    itemId,
    warehouseId,
    supplierId = null,
    batchNumber,
    manufactureDate = null,
    expiryDate = null,
    quantity,
    unitCost,
    transactionType,
    referenceType,
    referenceId,
    notes = null,
    userId,
    keepAverageCost = false,
  }) {
    required(itemId, 'Item');
    required(warehouseId, 'Warehouse');
    required(batchNumber, 'Batch number');

    const qty = number(quantity);
    const cost = money(unitCost);

    if (qty <= 0) {
      throw new AppError('Quantity must be greater than zero.', 400, 'VALIDATION_ERROR');
    }

    this.assertWarehousePermission(userId, warehouseId);

    const item = this.getItem(itemId);
    if (!this.repository.findWarehouseById(warehouseId)) {
      throw new AppError('Warehouse was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    let batch = this.repository.findBatchByNumber({ itemId, warehouseId, batchNumber });
    if (!batch) {
      batch = this.repository.createBatch({
        item_id: itemId,
        warehouse_id: warehouseId,
        supplier_id: supplierId || item.supplier_id,
        batch_number: String(batchNumber).trim(),
        purchase_cost: cost,
        selling_price: item.selling_price,
        quantity: 0,
        manufacture_date: manufactureDate,
        expiry_date: expiryDate,
      });
    }

    const oldQty = number(item.current_quantity);
    const oldAverageCost = money(item.average_cost);
    const newQty = oldQty + qty;
    const newAverageCost = keepAverageCost
      ? oldAverageCost
      : money(newQty === 0 ? 0 : (oldQty * oldAverageCost + qty * cost) / newQty);

    const updatedBatch = this.repository.updateBatchQuantity(
      batch.id,
      number(batch.quantity) + qty,
    );
    const updatedItem = this.repository.updateItemStock({
      itemId,
      quantity: newQty,
      averageCost: newAverageCost,
    });

    this.repository.createInventoryTransaction({
      item_id: itemId,
      batch_id: updatedBatch.id,
      warehouse_id: warehouseId,
      transaction_type: transactionType,
      direction: 'IN',
      reference_type: referenceType,
      reference_id: referenceId,
      quantity: qty,
      unit_cost: cost,
      average_cost_after: updatedItem.average_cost,
      quantity_after: updatedItem.current_quantity,
      notes,
      created_by: userId,
    });

    return {
      item: updatedItem,
      batch: updatedBatch,
      quantity: qty,
      unitCost: cost,
      averageCostAfter: updatedItem.average_cost,
    };
  }

  stockOut({
    itemId,
    warehouseId,
    batchId,
    quantity,
    transactionType,
    referenceType,
    referenceId,
    notes = null,
    userId,
    unitCost,
    deferPurchaseValuation = false,
  }) {
    required(itemId, 'Item');
    required(warehouseId, 'Warehouse');
    required(batchId, 'Batch');

    const qty = number(quantity);
    if (qty <= 0) {
      throw new AppError('Quantity must be greater than zero.', 400, 'VALIDATION_ERROR');
    }

    this.assertWarehousePermission(userId, warehouseId);

    const item = this.getItem(itemId);
    const batch = this.repository.findBatchById(batchId);

    if (
      !batch ||
      Number(batch.item_id) !== Number(itemId) ||
      Number(batch.warehouse_id) !== Number(warehouseId)
    ) {
      throw new AppError(
        'Batch was not found in the selected warehouse.',
        400,
        'RELATED_RECORD_NOT_FOUND',
      );
    }

    const available = this.getAvailableQuantity(
      itemId,
      warehouseId,
      batchId,
      referenceType,
      referenceId,
    );
    if (available < qty) {
      throw new AppError('Insufficient available stock.', 400, 'INSUFFICIENT_STOCK');
    }

    const cost = unitCost === undefined ? money(item.average_cost) : money(unitCost);
    const newQty = number(item.current_quantity) - qty;
    const remainingValue = money(
      number(item.current_quantity) * money(item.average_cost) - qty * cost,
    );
    if (
      unitCost !== undefined &&
      !deferPurchaseValuation &&
      (remainingValue < -0.01 || (newQty === 0 && Math.abs(remainingValue) > 0.01))
    ) {
      throw new AppError(
        'Purchase cannot be reversed after its stock valuation has been consumed. Use a supplier return.',
        409,
        'PURCHASE_VALUATION_CONFLICT',
      );
    }
    const averageCost =
      unitCost === undefined || deferPurchaseValuation
        ? money(item.average_cost)
        : money(newQty > 0 ? Math.max(0, remainingValue) / newQty : 0);
    const updatedBatch = this.repository.updateBatchQuantity(
      batch.id,
      number(batch.quantity) - qty,
    );
    const updatedItem = this.repository.updateItemStock({
      itemId,
      quantity: newQty,
      averageCost,
    });

    this.repository.createInventoryTransaction({
      item_id: itemId,
      batch_id: batchId,
      warehouse_id: warehouseId,
      transaction_type: transactionType,
      direction: 'OUT',
      reference_type: referenceType,
      reference_id: referenceId,
      quantity: qty,
      unit_cost: cost,
      average_cost_after: updatedItem.average_cost,
      quantity_after: updatedItem.current_quantity,
      notes,
      created_by: userId,
    });

    // Automatically consume any active reservation matching this reference (fully or partially)
    if (referenceType && referenceId) {
      const activeRes = this.db
        .prepare(
          `
        SELECT id, quantity FROM inventory_reservations
        WHERE item_id = ? AND warehouse_id = ? AND reference_table = ? AND reference_id = ? AND status = 'ACTIVE'
        ORDER BY id ASC
      `,
        )
        .all(itemId, warehouseId, referenceType, referenceId);

      let toConsume = qty;
      for (const res of activeRes) {
        if (toConsume <= 0) break;
        if (number(res.quantity) <= toConsume) {
          this.db
            .prepare(
              `
            UPDATE inventory_reservations 
            SET status = 'CONSUMED', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `,
            )
            .run(res.id);
          toConsume -= number(res.quantity);
        } else {
          this.db
            .prepare(
              `
            UPDATE inventory_reservations 
            SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `,
            )
            .run(toConsume, res.id);

          this.db
            .prepare(
              `
            INSERT INTO inventory_reservations (company_id, item_id, warehouse_id, batch_id, quantity, reference_table, reference_id, status, created_by)
            SELECT company_id, item_id, warehouse_id, batch_id, ?, reference_table, reference_id, 'CONSUMED', created_by
            FROM inventory_reservations WHERE id = ?
          `,
            )
            .run(toConsume, res.id);

          toConsume = 0;
        }
      }
    }

    return {
      item: updatedItem,
      batch: updatedBatch,
      quantity: qty,
      unitCost: cost,
      averageCostAfter: updatedItem.average_cost,
    };
  }

  stockSummary() {
    return { data: this.repository.stockSummary() };
  }

  stockValuation(query = {}) {
    const method = String(query.method || 'AVCO').toUpperCase();
    const dateStr = query.date ? String(query.date).trim() : null;
    const dateLimit = dateStr ? `${dateStr} 23:59:59` : null;

    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new AppError('Invalid date format. Expected YYYY-MM-DD.', 400, 'VALIDATION_ERROR');
    }

    const items = this.db
      .prepare(
        'SELECT id, sku, item_name, purchase_cost, average_cost FROM inventory_items WHERE is_active = 1',
      )
      .all();
    const results = [];

    for (const item of items) {
      let finalQty = 0;
      let finalValue = 0;
      let costPerUnit = 0;

      // 1. Get transactions for this item
      let txsQuery =
        'SELECT direction, quantity, unit_cost, batch_id, created_at FROM inventory_transactions WHERE item_id = ?';
      const params = [item.id];
      if (dateLimit) {
        txsQuery += ' AND created_at <= ?';
        params.push(dateLimit);
      }
      txsQuery += ' ORDER BY id ASC';
      const txs = this.db.prepare(txsQuery).all(...params);

      // Reconstruct historical physical quantity as of date
      let runningQty = 0;
      for (const tx of txs) {
        if (tx.direction === 'IN') {
          runningQty += number(tx.quantity);
        } else {
          runningQty = Math.max(0, runningQty - number(tx.quantity));
        }
      }
      if (txs.length === 0 && !dateLimit) {
        const sumRow = this.db
          .prepare('SELECT SUM(quantity) AS total FROM inventory_batches WHERE item_id = ?')
          .get(item.id);
        runningQty = sumRow?.total ? number(sumRow.total) : 0;
      }
      finalQty = runningQty;

      if (method === 'AVCO') {
        let runningAvgCost = number(item.purchase_cost || item.average_cost || 0);
        let runningQtyAvg = 0;

        for (const tx of txs) {
          const qty = number(tx.quantity);
          const cost = number(tx.unit_cost);
          if (tx.direction === 'IN') {
            const newQty = runningQtyAvg + qty;
            if (newQty > 0) {
              runningAvgCost = (runningQtyAvg * runningAvgCost + qty * cost) / newQty;
            }
            runningQtyAvg = newQty;
          } else {
            runningQtyAvg = Math.max(0, runningQtyAvg - qty);
          }
        }
        costPerUnit = money(runningAvgCost);
        finalValue = money(finalQty * costPerUnit);
      } else if (method === 'BATCH') {
        // Query all batches for this item
        const batches = this.db
          .prepare('SELECT id, quantity, purchase_cost FROM inventory_batches WHERE item_id = ?')
          .all(item.id);
        let itemBatchValue = 0;

        for (const batch of batches) {
          // Reconstruct historical batch quantity
          let batchTxsQuery =
            'SELECT direction, quantity FROM inventory_transactions WHERE batch_id = ?';
          const batchParams = [batch.id];
          if (dateLimit) {
            batchTxsQuery += ' AND created_at <= ?';
            batchParams.push(dateLimit);
          }
          const batchTxs = this.db.prepare(batchTxsQuery).all(...batchParams);

          let bQty = 0;
          for (const tx of batchTxs) {
            if (tx.direction === 'IN') {
              bQty += number(tx.quantity);
            } else {
              bQty = Math.max(0, bQty - number(tx.quantity));
            }
          }
          if (batchTxs.length === 0 && !dateLimit) {
            bQty = number(batch.quantity);
          }
          itemBatchValue += bQty * number(batch.purchase_cost);
        }
        finalValue = money(itemBatchValue);
        costPerUnit = finalQty > 0 ? money(finalValue / finalQty) : 0;
      } else if (method === 'FIFO') {
        // Query all IN transactions on or before T, ordered by ID DESC (most recent first)
        let inTxsQuery =
          "SELECT quantity, unit_cost FROM inventory_transactions WHERE item_id = ? AND direction = 'IN'";
        const inParams = [item.id];
        if (dateLimit) {
          inTxsQuery += ' AND created_at <= ?';
          inParams.push(dateLimit);
        }
        inTxsQuery += ' ORDER BY id DESC';
        const inTxs = this.db.prepare(inTxsQuery).all(...inParams);

        let remaining = finalQty;
        let fifoVal = 0;

        for (const tx of inTxs) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, number(tx.quantity));
          fifoVal += take * number(tx.unit_cost);
          remaining -= take;
        }

        if (remaining > 0) {
          fifoVal += remaining * number(item.purchase_cost || item.average_cost || 0);
        }

        finalValue = money(fifoVal);
        costPerUnit = finalQty > 0 ? money(finalValue / finalQty) : 0;
      } else {
        throw new AppError(`Unsupported valuation method: ${method}`, 400, 'VALIDATION_ERROR');
      }

      results.push({
        id: item.id,
        sku: item.sku,
        item_name: item.item_name,
        current_quantity: finalQty,
        average_cost: costPerUnit,
        stock_value: finalValue,
      });
    }

    return {
      data: results,
      totals: {
        quantity: results.reduce((sum, row) => sum + number(row.current_quantity), 0),
        value: money(results.reduce((sum, row) => sum + number(row.stock_value), 0)),
      },
    };
  }

  reconcileInventory(companyId) {
    // 1. Get ledger inventory balance
    const ledgerRow = this.db
      .prepare(
        `
      SELECT SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END) AS balance
      FROM journal_entries
      JOIN vouchers ON vouchers.id = journal_entries.voucher_id
      WHERE vouchers.company_id = ? AND vouchers.status <> 'CANCELLED'
        AND journal_entries.ledger_id = (
          SELECT id FROM ledgers WHERE company_id = ? AND system_key = 'inventory_stock'
        )
    `,
      )
      .get(companyId, companyId);
    const ledgerBalance = money(ledgerRow?.balance || 0);

    // 2. Get current stock valuation (AVCO)
    const valuationResult = this.stockValuation({ method: 'AVCO' });
    const totalValuation = valuationResult.totals.value;

    // 3. Get item quantities and batch quantities mismatches
    const items = this.db
      .prepare(
        'SELECT id, sku, item_name, current_quantity, average_cost FROM inventory_items WHERE is_active = 1',
      )
      .all();
    const itemMismatches = [];
    let totalItemsQty = 0;
    let totalBatchesQty = 0;

    for (const item of items) {
      const batchRow = this.db
        .prepare('SELECT SUM(quantity) AS total FROM inventory_batches WHERE item_id = ?')
        .get(item.id);
      const batchQty = number(batchRow?.total);
      const itemQty = number(item.current_quantity);

      totalItemsQty += itemQty;
      totalBatchesQty += batchQty;

      if (Math.abs(itemQty - batchQty) > 0.0001) {
        itemMismatches.push({
          itemId: item.id,
          sku: item.sku,
          itemName: item.item_name,
          itemQuantity: itemQty,
          batchQuantity: batchQty,
          difference: money(itemQty - batchQty),
        });
      }
    }

    // 4. Warehouse quantities
    const warehouseQuantities = this.db
      .prepare(
        `
      SELECT w.id, w.name, w.code, COALESCE(SUM(b.quantity), 0) AS total_quantity
      FROM warehouses w
      LEFT JOIN inventory_batches b ON b.warehouse_id = w.id
      WHERE w.is_active = 1
      GROUP BY w.id
    `,
      )
      .all();

    // 5. Reservation balances
    const reservations = this.db
      .prepare(
        `
      SELECT item_id, SUM(quantity) AS total_reserved
      FROM inventory_reservations
      WHERE status = 'ACTIVE'
      GROUP BY item_id
    `,
      )
      .all();
    const reservationTotal = reservations.reduce((sum, r) => sum + number(r.total_reserved), 0);

    return {
      ledgerBalance,
      totalValuation,
      valuationVsLedgerDifference: money(totalValuation - ledgerBalance),
      totalItemsQty: money(totalItemsQty),
      totalBatchesQty: money(totalBatchesQty),
      quantityMismatchCount: itemMismatches.length,
      quantityMismatches: itemMismatches,
      warehouseQuantities,
      reservationTotal,
    };
  }

  movementReport(query = {}) {
    return { data: this.repository.inventoryMovements({ itemId: query.itemId }) };
  }

  lowStockReport() {
    return { data: this.repository.lowStock() };
  }

  expiringStockReport(query = {}) {
    return {
      data: this.repository.expiringStock({
        asOf: query.asOf || localDate(),
        days: Number.parseInt(query.days || '30', 10) || 30,
      }),
    };
  }

  getSeedStatus() {
    const starterLoaded = this.db
      .prepare("SELECT value FROM system_settings WHERE key = 'inventory.starter_loaded'")
      .get();
    if (starterLoaded && starterLoaded.value === 'true') {
      return { loaded: true };
    }
    const itemCount = this.db.prepare('SELECT COUNT(*) AS count FROM inventory_items').get().count;
    if (itemCount > 0) {
      return { loaded: true };
    }
    return { loaded: false };
  }

  seedStarter(userId) {
    // 1. Check if seed flag is already present in system_settings
    const starterLoaded = this.db
      .prepare("SELECT value FROM system_settings WHERE key = 'inventory.starter_loaded'")
      .get();
    if (starterLoaded && starterLoaded.value === 'true') {
      return {
        loaded: true,
        itemsSeeded: 0,
        message: 'Starter inventory already loaded.',
      };
    }

    // 2. Check if we already have items in inventory_items
    const itemCount = this.db.prepare('SELECT COUNT(*) AS count FROM inventory_items').get().count;
    if (itemCount > 0) {
      // Record setting to prevent future triggers
      this.db
        .prepare(
          "INSERT OR IGNORE INTO system_settings (key, value) VALUES ('inventory.starter_loaded', 'true')",
        )
        .run();
      return {
        loaded: true,
        itemsSeeded: 0,
        message: 'Starter inventory already loaded.',
      };
    }

    const catalog = getStarterCatalog();

    // Run everything in a transaction!
    return this.repository.transaction(() => {
      // 4. Ensure we have an active warehouse
      let warehouse = this.db
        .prepare('SELECT id FROM warehouses WHERE is_active = 1 LIMIT 1')
        .get();
      if (!warehouse) {
        const whId = this.db
          .prepare(
            "INSERT INTO warehouses (name, code, address, is_active) VALUES ('Main Godown', 'GMAIN', 'Primary Workshop Warehouse', 1)",
          )
          .run().lastInsertRowid;
        warehouse = { id: whId };
      }

      // 5. Ensure we have suppliers: Garg Traders and Hari Om Traders
      const insertSupplier = this.db.prepare(`
        INSERT OR IGNORE INTO suppliers (name, phone, email, address, gstin, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `);
      insertSupplier.run(
        'Garg Traders',
        '9810012345',
        'sales@gargtraders.com',
        '102 Automotive Market, Kashmere Gate, Delhi',
        '07AAAAA1111A1Z1',
      );
      insertSupplier.run(
        'Hari Om Traders',
        '9812054321',
        'hariomtraders@gmail.com',
        'Sector 16, Automobile Zone, Noida, UP',
        '09BBBBB2222B2Z2',
      );

      const supplierGarg = this.db
        .prepare("SELECT id FROM suppliers WHERE name = 'Garg Traders'")
        .get();
      const supplierHariOm = this.db
        .prepare("SELECT id FROM suppliers WHERE name = 'Hari Om Traders'")
        .get();
      const defaultSupplier = supplierGarg || supplierHariOm || { id: 1 };

      // Ensure categories exist in inventory_categories
      const categoriesMap = {};
      const insertCategoryStmt = this.db.prepare(
        'INSERT OR IGNORE INTO inventory_categories (name, description, is_active) VALUES (?, ?, 1)',
      );
      const getCategoryStmt = this.db.prepare('SELECT id FROM inventory_categories WHERE name = ?');

      const uniqueCategories = [...new Set(catalog.map((item) => item.category))];
      for (const catName of uniqueCategories) {
        insertCategoryStmt.run(catName, `${catName} starter category`);
        const row = getCategoryStmt.get(catName);
        if (row) {
          categoriesMap[catName] = row.id;
        }
      }

      let seededCount = 0;
      const seenSkus = new Set();
      for (const item of catalog) {
        if (seenSkus.has(item.sku)) {
          continue;
        }

        const existingItem = this.db
          .prepare('SELECT id FROM inventory_items WHERE sku = ?')
          .get(item.sku);
        if (existingItem) {
          seenSkus.add(item.sku);
          continue;
        }

        const supplierId =
          seededCount % 2 === 0 && supplierHariOm ? supplierHariOm.id : defaultSupplier.id;
        const itemPayload = {
          sku: item.sku,
          barcode: null,
          item_name: item.itemName,
          category: item.category,
          category_id: categoriesMap[item.category] || null,
          supplier_id: supplierId,
          hsn_code: item.hsn || '8708',
          hsn_sac_code: item.hsn || '8708',
          gst_rate: item.gstRate,
          purchase_cost: item.purchaseCost,
          average_cost: 0,
          selling_price: item.sellingPrice,
          minimum_stock: item.minimumStock,
          reorder_level: item.reorderLevel,
          unit_of_measure: item.unit,
          is_active: 1,
        };

        this.repository.createItem(itemPayload);
        seenSkus.add(item.sku);

        // 6. Automatically create batches (opening stock) - Skipped to ensure seeded items start at 0 quantity & 0 value
        seededCount++;
      }

      // Record setting in system_settings
      this.db
        .prepare(
          "INSERT OR IGNORE INTO system_settings (key, value) VALUES ('inventory.starter_loaded', 'true')",
        )
        .run();

      return {
        loaded: true,
        message: 'Starter inventory catalog loaded successfully.',
        itemsSeeded: seededCount,
      };
    });
  }

  listFixedAssets(query) {
    const page = Math.max(Number.parseInt(query.page || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '20', 10) || 20, 1), 100);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const result = this.repository.listFixedAssets({
      search,
      pageSize,
      offset: (page - 1) * pageSize,
    });

    return {
      data: result.data,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  createFixedAsset(payload, userId) {
    required(payload.asset_name, 'Asset Name');
    required(payload.sku, 'SKU');
    required(payload.supplier_id, 'Supplier');
    required(payload.invoice_number, 'Invoice Number');
    required(payload.purchase_date, 'Purchase Date');
    required(payload.purchase_cost, 'Purchase Cost');

    const skuVal = String(payload.sku).trim().toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(skuVal)) {
      throw new AppError('SKU must be alphanumeric.', 400, 'VALIDATION_ERROR');
    }

    const supplierId = Number.parseInt(payload.supplier_id, 10);
    if (!this.repository.findSupplierById(supplierId)) {
      throw new AppError('Supplier was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    const cost = money(payload.purchase_cost);
    if (cost < 0) {
      throw new AppError('Purchase cost cannot be negative.', 400, 'VALIDATION_ERROR');
    }

    const gstAmount = money(payload.gst_amount || 0);
    if (gstAmount < 0) {
      throw new AppError('GST amount cannot be negative.', 400, 'VALIDATION_ERROR');
    }

    const data = {
      asset_name: String(payload.asset_name).trim(),
      sku: skuVal,
      category: payload.category ? String(payload.category).trim() : 'Equipment',
      supplier_id: supplierId,
      invoice_number: String(payload.invoice_number).trim(),
      purchase_date: String(payload.purchase_date).trim(),
      purchase_cost: cost,
      gst_amount: gstAmount,
      serial_number: payload.serial_number ? String(payload.serial_number).trim() : null,
      warranty_info: payload.warranty_info ? String(payload.warranty_info).trim() : null,
      notes: payload.notes ? String(payload.notes).trim() : null,
      created_by: userId,
    };

    try {
      return this.repository.transaction(() => {
        const asset = this.repository.createFixedAsset(data);
        this.auditRepository.create({
          userId,
          action: 'CREATE',
          entityType: 'fixed_assets',
          entityId: asset.id,
          newValue: asset,
        });
        return asset;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  listStockVerifications(query) {
    const page = Math.max(Number.parseInt(query.page || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '20', 10) || 20, 1), 100);
    const result = this.repository.listStockVerifications({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      warehouseId: query.warehouseId ? Number(query.warehouseId) : null,
      itemId: query.itemId ? Number(query.itemId) : null,
      batchId: query.batchId ? Number(query.batchId) : null,
    });

    return {
      data: result.data,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  verifyStock(payload, userId) {
    const verifications = Array.isArray(payload.verifications) ? payload.verifications : [payload];
    const verificationType = payload.verification_type || 'Single Item';
    const auditSessionId = payload.audit_session_id || code('SES');

    if (verifications.length === 0) {
      throw new AppError('At least one verification item is required.', 400, 'VALIDATION_ERROR');
    }

    return this.repository.transaction(() => {
      const results = [];

      for (const ver of verifications) {
        const warehouseId = Number(ver.warehouse_id || 1);
        required(ver.item_id, 'Item');
        required(ver.counted_quantity, 'Counted quantity');

        const itemId = Number(ver.item_id);
        const countedQty = number(ver.counted_quantity);

        if (countedQty < 0) {
          throw new AppError('Counted quantity cannot be negative.', 400, 'VALIDATION_ERROR');
        }

        const item = this.repository.findItemById(itemId);
        if (!item) {
          throw new AppError(`Item ID ${itemId} not found.`, 404, 'ITEM_NOT_FOUND');
        }

        const warehouse = this.repository.findWarehouseById(warehouseId);
        if (!warehouse) {
          throw new AppError(`Warehouse ID ${warehouseId} not found.`, 404, 'WAREHOUSE_NOT_FOUND');
        }

        this.assertWarehousePermission(userId, warehouseId);

        let previousQty = 0;
        let batchId = ver.batch_id ? Number(ver.batch_id) : null;

        if (batchId) {
          const batch = this.repository.findBatchById(batchId);
          if (
            !batch ||
            Number(batch.item_id) !== itemId ||
            Number(batch.warehouse_id) !== warehouseId
          ) {
            throw new AppError(
              'Batch was not found in the selected warehouse.',
              400,
              'RELATED_RECORD_NOT_FOUND',
            );
          }
          previousQty = number(batch.quantity);
        } else {
          const sumRow = this.db
            .prepare(
              `
            SELECT SUM(quantity) AS total 
            FROM inventory_batches 
            WHERE item_id = ? AND warehouse_id = ?
          `,
            )
            .get(itemId, warehouseId);
          previousQty = number(sumRow?.total);
        }

        const difference = countedQty - previousQty;
        const verificationNumber = code('VER');

        this.db
          .prepare(
            `
          INSERT INTO stock_verifications (
            verification_number, verification_type, audit_session_id, warehouse_id, 
            item_id, batch_id, previous_quantity, counted_quantity, difference, 
            status, verified_by, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `,
          )
          .run(
            verificationNumber,
            verificationType,
            auditSessionId,
            warehouseId,
            itemId,
            batchId,
            previousQty,
            countedQty,
            difference,
            userId,
            ver.notes || null,
          );

        results.push({
          verification_number: verificationNumber,
          item_name: item.item_name,
          sku: item.sku,
          previous_quantity: previousQty,
          counted_quantity: countedQty,
          difference: difference,
          status: 'PENDING',
        });
      }

      return {
        audit_session_id: auditSessionId,
        verification_type: verificationType,
        items: results,
      };
    });
  }

  approveVerification(verificationId, userId) {
    return this.repository.transaction(() => {
      const ver = this.db
        .prepare('SELECT * FROM stock_verifications WHERE id = ?')
        .get(verificationId);
      if (!ver) {
        throw new AppError('Verification record not found.', 404, 'VERIFICATION_NOT_FOUND');
      }
      if (ver.status !== 'PENDING') {
        throw new AppError(
          `Verification has already been processed (status: ${ver.status}).`,
          400,
          'VALIDATION_ERROR',
        );
      }

      this.assertWarehousePermission(userId, ver.warehouse_id);

      let adjustmentId = null;
      if (ver.difference !== 0) {
        this.repository.findItemById(ver.item_id);
        const adjResult = this.createAdjustment(
          {
            itemId: ver.item_id,
            warehouseId: ver.warehouse_id,
            batchId: ver.batch_id,
            quantity: Math.abs(ver.difference),
            adjustmentType: ver.difference > 0 ? 'IN' : 'OUT',
            category: 'NORMAL',
            reason: `Physical count verification ${ver.verification_number} variance`,
          },
          userId,
        );
        adjustmentId = adjResult.adjustmentId;
      }

      this.db
        .prepare(
          `
        UPDATE stock_verifications 
        SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP, adjustment_id = ?
        WHERE id = ?
      `,
        )
        .run(userId, adjustmentId, verificationId);

      return {
        id: verificationId,
        status: 'APPROVED',
        adjustmentId,
      };
    });
  }

  rejectVerification(verificationId, userId) {
    return this.repository.transaction(() => {
      const ver = this.db
        .prepare('SELECT * FROM stock_verifications WHERE id = ?')
        .get(verificationId);
      if (!ver) {
        throw new AppError('Verification record not found.', 404, 'VERIFICATION_NOT_FOUND');
      }
      if (ver.status !== 'PENDING') {
        throw new AppError(
          `Verification has already been processed (status: ${ver.status}).`,
          400,
          'VALIDATION_ERROR',
        );
      }

      this.assertWarehousePermission(userId, ver.warehouse_id);

      this.db
        .prepare(
          `
        UPDATE stock_verifications 
        SET status = 'REJECTED', approved_by = ?, approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        )
        .run(userId, verificationId);

      return {
        id: verificationId,
        status: 'REJECTED',
      };
    });
  }

  dashboardStats() {
    const stats = this.db
      .prepare(
        `
      SELECT 
        COUNT(*) AS totalItems,
        SUM(current_quantity * average_cost) AS totalValue,
        SUM(CASE WHEN current_quantity <= reorder_level THEN 1 ELSE 0 END) AS lowStockCount,
        SUM(CASE WHEN current_quantity = 0 THEN 1 ELSE 0 END) AS outOfStockCount
      FROM inventory_items
      WHERE is_active = 1
    `,
      )
      .get();

    return {
      totalItems: stats.totalItems || 0,
      totalValue: money(stats.totalValue || 0),
      lowStockCount: stats.lowStockCount || 0,
      outOfStockCount: stats.outOfStockCount || 0,
    };
  }

  bulkSave(payload, userId) {
    const items = Array.isArray(payload) ? payload : payload.items || [];
    if (items.length === 0) {
      throw new AppError('At least one item is required.', 400, 'VALIDATION_ERROR');
    }

    return this.repository.transaction(() => {
      for (const entry of items) {
        const itemId = Number(entry.itemId ?? entry.item_id);
        const quantity = number(entry.quantity);
        const unitCost = entry.unitCost ?? entry.unit_cost;

        if (!itemId) {
          throw new AppError('Item ID is required for all entries.', 400, 'VALIDATION_ERROR');
        }
        if (quantity < 0) {
          throw new AppError('Quantity cannot be negative.', 400, 'VALIDATION_ERROR');
        }

        const item = this.repository.findItemById(itemId);
        if (!item) {
          throw new AppError(`Item ID ${itemId} not found.`, 404, 'ITEM_NOT_FOUND');
        }

        const currentQty = number(item.current_quantity);
        const diff = quantity - currentQty;

        if (diff === 0) continue;

        if (diff > 0) {
          const batchNumber = `BAT-${item.sku}-OPEN`;
          this.stockIn({
            itemId,
            warehouseId: 1,
            supplierId: item.supplier_id || 1,
            batchNumber,
            quantity: diff,
            unitCost:
              unitCost !== undefined
                ? money(unitCost)
                : item.average_cost || item.purchase_cost || 0,
            transactionType: 'Opening Stock',
            referenceType: 'bulk_initial',
            referenceId: 1,
            userId,
          });
        } else {
          let remainingToDeduct = Math.abs(diff);
          const batches = this.db
            .prepare(
              'SELECT id, quantity FROM inventory_batches WHERE item_id = ? AND warehouse_id = 1 AND quantity > 0 ORDER BY id ASC',
            )
            .all(itemId);
          for (const batch of batches) {
            if (remainingToDeduct <= 0) break;
            const deductQty = Math.min(batch.quantity, remainingToDeduct);
            if (deductQty > 0) {
              this.stockOut({
                itemId,
                warehouseId: 1,
                batchId: batch.id,
                quantity: deductQty,
                transactionType: 'Adjustment',
                referenceType: 'bulk_initial',
                referenceId: 1,
                userId,
              });
              remainingToDeduct -= deductQty;
            }
          }
          if (remainingToDeduct > 0) {
            throw new AppError(
              `Cannot reduce stock for ${item.item_name} by ${Math.abs(diff)} as there is insufficient stock in batches.`,
              400,
              'INSUFFICIENT_STOCK',
            );
          }
        }
      }
      return { success: true };
    });
  }

  generateSequentialSku() {
    const rows = this.db.prepare("SELECT sku FROM inventory_items WHERE sku LIKE 'ITM-%'").all();
    let maxNum = 0;
    const regex = /^ITM-(\d+)$/;
    for (const row of rows) {
      const match = row.sku.match(regex);
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    let nextNum = maxNum + 1;
    while (true) {
      const sku = `ITM-${String(nextNum).padStart(5, '0')}`;
      const existing = this.db.prepare('SELECT id FROM inventory_items WHERE sku = ?').get(sku);
      if (!existing) {
        return sku;
      }
      nextNum++;
    }
  }
}

export function createInventoryService(db) {
  return new InventoryService(db);
}
