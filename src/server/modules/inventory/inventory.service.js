import { AppError } from '../../shared/errors/AppError.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { InventoryRepository } from './inventory.repository.js';

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

export class InventoryService {
  constructor(db) {
    this.db = db;
    this.repository = new InventoryRepository(db);
    this.auditRepository = new AuditRepository(db);
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

  createItem(payload, userId) {
    const data = this.validateItemPayload(payload);

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
    }

    if (!partial || payload.item_name !== undefined || payload.itemName !== undefined) {
      required(payload.item_name ?? payload.itemName, 'Item name');
    }

    const categoryId = payload.category_id === undefined ? null : Number.parseInt(payload.category_id, 10);
    const supplierId = payload.supplier_id === undefined ? null : Number.parseInt(payload.supplier_id, 10);

    if (categoryId && !this.repository.findCategoryById(categoryId)) {
      throw new AppError('Inventory category was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    if (supplierId && !this.repository.findSupplierById(supplierId)) {
      throw new AppError('Supplier was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    const data = {};

    if (payload.sku !== undefined) data.sku = String(payload.sku).trim().toUpperCase();
    if (payload.barcode !== undefined || !partial) data.barcode = payload.barcode ? String(payload.barcode).trim() : null;
    if (payload.item_name !== undefined || payload.itemName !== undefined) {
      data.item_name = String(payload.item_name ?? payload.itemName).trim();
    }
    if (payload.category !== undefined || !partial) data.category = payload.category ? String(payload.category).trim() : null;
    if (payload.category_id !== undefined || !partial) data.category_id = categoryId || null;
    if (payload.supplier_id !== undefined || !partial) data.supplier_id = supplierId || null;
    if (payload.hsn_code !== undefined || !partial) data.hsn_code = payload.hsn_code ? String(payload.hsn_code).trim() : null;
    if (payload.gst_rate !== undefined || !partial) data.gst_rate = number(payload.gst_rate);
    if (payload.purchase_cost !== undefined || !partial) data.purchase_cost = money(payload.purchase_cost);
    if (payload.selling_price !== undefined || !partial) data.selling_price = money(payload.selling_price);
    if (payload.reorder_level !== undefined || payload.minimum_stock !== undefined || !partial) {
      data.reorder_level = number(payload.reorder_level ?? payload.minimum_stock);
    }
    if (payload.unit_of_measure !== undefined || !partial) {
      data.unit_of_measure = payload.unit_of_measure ? String(payload.unit_of_measure).trim() : 'pcs';
    }
    if (payload.is_active !== undefined || !partial) {
      data.is_active = payload.is_active === false || payload.is_active === 0 ? 0 : 1;
    }

    return data;
  }

  createOpeningStock(payload, userId) {
    return this.repository.transaction(() => {
      const adjustmentId = this.repository.createStockAdjustment({
        adjustment_number: code('OPEN'),
        item_id: payload.item_id,
        batch_id: null,
        warehouse_id: payload.warehouse_id,
        adjustment_type: 'OPENING',
        quantity: number(payload.quantity),
        unit_cost: money(payload.unit_cost),
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
        quantity: payload.quantity,
        unitCost: payload.unit_cost,
        transactionType: 'Opening Stock',
        referenceType: 'stock_adjustments',
        referenceId: adjustmentId,
        notes: payload.reason || 'Opening stock',
        userId,
      });

      return { adjustmentId, ...result };
    });
  }

  createAdjustment(payload, userId) {
    required(payload.item_id, 'Item');
    required(payload.warehouse_id, 'Warehouse');
    required(payload.adjustment_type, 'Adjustment type');

    const adjustmentType = String(payload.adjustment_type).toUpperCase();
    if (!['IN', 'OUT'].includes(adjustmentType)) {
      throw new AppError('Adjustment type must be IN or OUT.', 400, 'VALIDATION_ERROR');
    }

    return this.repository.transaction(() => {
      const adjustmentId = this.repository.createStockAdjustment({
        adjustment_number: code('ADJ'),
        item_id: payload.item_id,
        batch_id: payload.batch_id || null,
        warehouse_id: payload.warehouse_id,
        adjustment_type: adjustmentType,
        quantity: number(payload.quantity),
        unit_cost: money(payload.unit_cost),
        reason: payload.reason || null,
        created_by: userId,
      });

      if (adjustmentType === 'IN') {
        return {
          adjustmentId,
          ...this.stockIn({
            itemId: payload.item_id,
            warehouseId: payload.warehouse_id,
            supplierId: payload.supplier_id || null,
            batchNumber: payload.batch_number,
            manufactureDate: payload.manufacture_date || null,
            expiryDate: payload.expiry_date || null,
            quantity: payload.quantity,
            unitCost: payload.unit_cost,
            transactionType: 'Adjustment',
            referenceType: 'stock_adjustments',
            referenceId: adjustmentId,
            notes: payload.reason || null,
            userId,
          }),
        };
      }

      return {
        adjustmentId,
        ...this.stockOut({
          itemId: payload.item_id,
          warehouseId: payload.warehouse_id,
          batchId: payload.batch_id,
          quantity: payload.quantity,
          transactionType: 'Adjustment',
          referenceType: 'stock_adjustments',
          referenceId: adjustmentId,
          notes: payload.reason || null,
          userId,
        }),
      };
    });
  }

  transferStock(payload, userId) {
    required(payload.item_id, 'Item');
    required(payload.from_warehouse_id, 'From warehouse');
    required(payload.to_warehouse_id, 'To warehouse');

    if (Number(payload.from_warehouse_id) === Number(payload.to_warehouse_id)) {
      throw new AppError('Warehouses must be different.', 400, 'VALIDATION_ERROR');
    }

    return this.repository.transaction(() => {
      const item = this.getItem(payload.item_id);
      const sourceBatch = this.repository.findBatchById(payload.batch_id);

      if (
        !sourceBatch
        || Number(sourceBatch.item_id) !== Number(payload.item_id)
        || Number(sourceBatch.warehouse_id) !== Number(payload.from_warehouse_id)
      ) {
        throw new AppError('Batch was not found in the selected warehouse.', 400, 'RELATED_RECORD_NOT_FOUND');
      }

      const transferId = this.repository.createStockTransfer({
        transfer_number: code('TRF'),
        item_id: payload.item_id,
        batch_id: sourceBatch.id,
        from_warehouse_id: payload.from_warehouse_id,
        to_warehouse_id: payload.to_warehouse_id,
        quantity: number(payload.quantity),
        unit_cost: money(item.average_cost || sourceBatch.purchase_cost),
        notes: payload.notes || null,
        created_by: userId,
      });

      const out = this.stockOut({
        itemId: payload.item_id,
        warehouseId: payload.from_warehouse_id,
        batchId: payload.batch_id,
        quantity: payload.quantity,
        transactionType: 'Transfer',
        referenceType: 'stock_transfers',
        referenceId: transferId,
        notes: payload.notes || null,
        userId,
      });

      const into = this.stockIn({
        itemId: payload.item_id,
        warehouseId: payload.to_warehouse_id,
        supplierId: sourceBatch.supplier_id,
        batchNumber: sourceBatch.batch_number,
        manufactureDate: sourceBatch.manufacture_date,
        expiryDate: sourceBatch.expiry_date,
        quantity: payload.quantity,
        unitCost: out.unitCost,
        transactionType: 'Transfer',
        referenceType: 'stock_transfers',
        referenceId: transferId,
        notes: payload.notes || null,
        userId,
        keepAverageCost: true,
      });

      return { transferId, out, in: into };
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
      : money(newQty === 0 ? 0 : ((oldQty * oldAverageCost) + (qty * cost)) / newQty);

    const updatedBatch = this.repository.updateBatchQuantity(batch.id, number(batch.quantity) + qty);
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
  }) {
    required(itemId, 'Item');
    required(warehouseId, 'Warehouse');
    required(batchId, 'Batch');

    const qty = number(quantity);
    if (qty <= 0) {
      throw new AppError('Quantity must be greater than zero.', 400, 'VALIDATION_ERROR');
    }

    const item = this.getItem(itemId);
    const batch = this.repository.findBatchById(batchId);

    if (!batch || Number(batch.item_id) !== Number(itemId) || Number(batch.warehouse_id) !== Number(warehouseId)) {
      throw new AppError('Batch was not found in the selected warehouse.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    if (number(item.current_quantity) < qty || number(batch.quantity) < qty) {
      throw new AppError('Insufficient stock.', 400, 'INSUFFICIENT_STOCK');
    }

    const averageCost = money(item.average_cost);
    const newQty = number(item.current_quantity) - qty;
    const updatedBatch = this.repository.updateBatchQuantity(batch.id, number(batch.quantity) - qty);
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
      unit_cost: averageCost,
      average_cost_after: updatedItem.average_cost,
      quantity_after: updatedItem.current_quantity,
      notes,
      created_by: userId,
    });

    return {
      item: updatedItem,
      batch: updatedBatch,
      quantity: qty,
      unitCost: averageCost,
      averageCostAfter: updatedItem.average_cost,
    };
  }

  stockSummary() {
    return { data: this.repository.stockSummary() };
  }

  stockValuation() {
    const rows = this.repository.stockValuation();
    return {
      data: rows,
      totals: {
        quantity: rows.reduce((sum, row) => sum + number(row.current_quantity), 0),
        value: money(rows.reduce((sum, row) => sum + number(row.stock_value), 0)),
      },
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
        asOf: query.asOf || new Date().toISOString().slice(0, 10),
        days: Number.parseInt(query.days || '30', 10) || 30,
      }),
    };
  }
}

export function createInventoryService(db) {
  return new InventoryService(db);
}
