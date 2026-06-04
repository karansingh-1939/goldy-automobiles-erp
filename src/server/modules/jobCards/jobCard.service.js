import { AppError } from '../../shared/errors/AppError.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { JobCardRepository } from './jobCard.repository.js';

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

function gstAmounts(revenue, gstRate) {
  const gstTotal = money((revenue * number(gstRate)) / 100);
  const half = money(gstTotal / 2);
  return {
    cgst: half,
    sgst: money(gstTotal - half),
    gstTotal,
  };
}

export class JobCardService {
  constructor(db) {
    this.db = db;
    this.repository = new JobCardRepository(db);
    this.inventoryService = new InventoryService(db);
    this.auditRepository = new AuditRepository(db);
  }

  list(query = {}) {
    const parsed = parseListQuery(query);
    const result = this.repository.listJobCards(parsed);

    return {
      data: result.data,
      pagination: {
        page: parsed.page,
        pageSize: parsed.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / parsed.pageSize),
      },
    };
  }

  get(id) {
    const jobCard = this.repository.findJobCardById(id);
    if (!jobCard) {
      throw new AppError('Job card not found.', 404, 'JOB_CARD_NOT_FOUND');
    }

    return {
      ...jobCard,
      parts: this.repository.listParts(id),
      labour: this.repository.listLabour(id),
      invoice: this.repository.findInvoiceByJobCardId(id) || null,
    };
  }

  create(payload, userId) {
    required(payload.customer_id, 'Customer');
    required(payload.vehicle_id, 'Vehicle');

    const customer = this.repository.findCustomerById(payload.customer_id);
    if (!customer) {
      throw new AppError('Customer was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    const vehicle = this.repository.findVehicleById(payload.vehicle_id);
    if (!vehicle || Number(vehicle.customer_id) !== Number(customer.id)) {
      throw new AppError('Vehicle was not found for this customer.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    if (payload.assigned_to && !this.repository.findUserById(payload.assigned_to)) {
      throw new AppError('Assigned mechanic was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    try {
      return this.repository.transaction(() => {
        const jobCardId = this.repository.createJobCard({
          job_card_number: payload.job_card_number || code('JC'),
          customer_id: customer.id,
          vehicle_id: vehicle.id,
          status: 'DRAFT',
          complaint: payload.complaint || null,
          odometer_reading: number(payload.odometer_reading),
          assigned_to: payload.assigned_to || null,
          created_by: userId,
        });

        const jobCard = this.get(jobCardId);
        this.auditRepository.create({
          userId,
          action: 'CREATE',
          entityType: 'job_cards',
          entityId: jobCardId,
          newValue: jobCard,
        });

        return jobCard;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  addPart(jobCardId, payload, userId) {
    const jobCard = this.getMutableJobCard(jobCardId);
    required(payload.inventory_item_id, 'Inventory item');
    required(payload.batch_id, 'Batch');
    required(payload.quantity, 'Quantity');

    const item = this.repository.findInventoryItemById(payload.inventory_item_id);
    const batch = this.repository.findBatchById(payload.batch_id);
    if (!item || !batch || Number(batch.item_id) !== Number(item.id)) {
      throw new AppError('Inventory item or batch was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    const quantity = number(payload.quantity);
    if (quantity <= 0) {
      throw new AppError('Quantity must be greater than zero.', 400, 'VALIDATION_ERROR');
    }

    if (number(batch.quantity) < quantity) {
      throw new AppError('Insufficient stock for selected batch.', 400, 'INSUFFICIENT_STOCK');
    }

    const sellingPrice = money(payload.selling_price ?? item.selling_price);
    const gstRate = number(payload.gst_rate ?? item.gst_rate);
    const revenue = money(sellingPrice * quantity);
    const gst = gstAmounts(revenue, gstRate);

    try {
      return this.repository.transaction(() => {
        const partId = this.repository.createPart({
          job_card_id: jobCard.id,
          inventory_item_id: item.id,
          batch_id: batch.id,
          description: payload.description || item.item_name,
          quantity,
          selling_price: sellingPrice,
          purchase_cost_snapshot: money(item.average_cost || item.purchase_cost),
          gst_rate: gstRate,
          gst_amount: gst.gstTotal,
          line_total: money(revenue + gst.gstTotal),
        });

        const part = this.repository.listParts(jobCard.id).find((row) => row.id === partId);
        this.auditRepository.create({
          userId,
          action: 'ADD_PART',
          entityType: 'job_cards',
          entityId: jobCard.id,
          newValue: part,
        });

        return part;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  addLabour(jobCardId, payload, userId) {
    const jobCard = this.getMutableJobCard(jobCardId);
    required(payload.description, 'Labour description');

    const labourCharge = money(payload.labour_charge ?? payload.charge);
    if (labourCharge < 0) {
      throw new AppError('Labour charge cannot be negative.', 400, 'VALIDATION_ERROR');
    }

    try {
      return this.repository.transaction(() => {
        const labourId = this.repository.createLabour({
          job_card_id: jobCard.id,
          description: String(payload.description).trim(),
          labour_charge: labourCharge,
          gst_rate: number(payload.gst_rate),
        });

        const labour = this.repository.listLabour(jobCard.id).find((row) => row.id === labourId);
        this.auditRepository.create({
          userId,
          action: 'ADD_LABOUR',
          entityType: 'job_cards',
          entityId: jobCard.id,
          newValue: labour,
        });

        return labour;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  finalize(jobCardId, userId) {
    try {
      return this.repository.transaction(() => {
        const jobCard = this.getMutableJobCard(jobCardId);
        const parts = this.repository.listParts(jobCard.id);
        const labourRows = this.repository.listLabour(jobCard.id);

        if (parts.length === 0 && labourRows.length === 0) {
          throw new AppError('At least one part or labour line is required before completion.', 400, 'VALIDATION_ERROR');
        }

        const existingInvoice = this.repository.findInvoiceByJobCardId(jobCard.id);
        if (existingInvoice && existingInvoice.status !== 'CANCELLED') {
          throw new AppError('This job card already has an active invoice.', 400, 'INVOICE_ALREADY_EXISTS');
        }

        const partLines = parts.map((part) => {
          const stockOut = this.inventoryService.stockOut({
            itemId: part.inventory_item_id,
            warehouseId: part.warehouse_id,
            batchId: part.batch_id,
            quantity: part.quantity,
            transactionType: 'Consumption',
            referenceType: 'job_cards',
            referenceId: jobCard.id,
            notes: `Job card ${jobCard.job_card_number}`,
            userId,
          });

          const revenue = money(number(part.selling_price) * number(part.quantity));
          const cost = money(stockOut.unitCost * number(part.quantity));
          const profit = money(revenue - cost);
          const gst = gstAmounts(revenue, part.gst_rate);

          return {
            item_type: 'PART',
            inventory_item_id: part.inventory_item_id,
            batch_id: part.batch_id,
            description: part.description,
            quantity: number(part.quantity),
            unit_price: money(part.selling_price),
            purchase_cost_snapshot: stockOut.unitCost,
            gst_rate: number(part.gst_rate),
            cgst_amount: gst.cgst,
            sgst_amount: gst.sgst,
            line_revenue: revenue,
            line_cost: cost,
            line_profit: profit,
            line_total: money(revenue + gst.gstTotal),
          };
        });

        const labourLines = labourRows.map((labour) => {
          const revenue = money(labour.labour_charge);
          const gst = gstAmounts(revenue, labour.gst_rate);

          return {
            item_type: 'LABOR',
            inventory_item_id: null,
            batch_id: null,
            description: labour.description,
            quantity: 1,
            unit_price: revenue,
            purchase_cost_snapshot: 0,
            gst_rate: number(labour.gst_rate),
            cgst_amount: gst.cgst,
            sgst_amount: gst.sgst,
            line_revenue: revenue,
            line_cost: 0,
            line_profit: revenue,
            line_total: money(revenue + gst.gstTotal),
          };
        });

        const invoiceLines = [...partLines, ...labourLines];
        const totals = this.calculateInvoiceTotals(invoiceLines);
        const invoiceId = this.repository.createInvoice({
          invoice_number: code('INV'),
          job_card_id: jobCard.id,
          customer_id: jobCard.customer_id,
          vehicle_id: jobCard.vehicle_id,
          invoice_date: new Date().toISOString().slice(0, 10),
          subtotal: totals.revenue,
          taxable_amount: totals.revenue,
          cgst_total: totals.cgst,
          sgst_total: totals.sgst,
          gst_total: totals.gst,
          grand_total: totals.grandTotal,
          status: 'FINALIZED',
          revenue: totals.revenue,
          cost_total: totals.cost,
          gross_profit: totals.grossProfit,
          net_profit: totals.grossProfit,
          created_by: userId,
        });

        for (const line of invoiceLines) {
          this.repository.createInvoiceItem({ ...line, invoice_id: invoiceId });
        }

        this.repository.createProfitRecord({
          invoice_id: invoiceId,
          revenue: totals.revenue,
          cost_total: totals.cost,
          gross_profit: totals.grossProfit,
          net_profit: totals.grossProfit,
        });

        this.repository.updateJobCardStatus(jobCard.id, 'COMPLETED');

        const invoice = this.getInvoice(invoiceId);
        this.auditRepository.create({
          userId,
          action: 'FINALIZE',
          entityType: 'job_cards',
          entityId: jobCard.id,
          newValue: invoice,
        });

        return {
          jobCard: this.get(jobCard.id),
          invoice,
        };
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  getInvoice(id) {
    const invoice = this.repository.findInvoiceById(id);
    if (!invoice) {
      throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    return {
      ...invoice,
      items: this.repository.listInvoiceItems(id),
    };
  }

  cancelInvoice(id, userId) {
    try {
      return this.repository.transaction(() => {
        const invoice = this.getInvoice(id);
        if (invoice.status === 'CANCELLED') {
          throw new AppError('Invoice is already cancelled.', 400, 'INVOICE_ALREADY_CANCELLED');
        }

        if (invoice.status !== 'FINALIZED') {
          throw new AppError('Only finalized invoices can be cancelled.', 400, 'INVALID_INVOICE_STATUS');
        }

        for (const item of invoice.items.filter((line) => line.item_type === 'PART')) {
          const batch = this.repository.findBatchById(item.batch_id);
          if (!batch) {
            throw new AppError('Invoice batch was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
          }

          this.inventoryService.stockIn({
            itemId: item.inventory_item_id,
            warehouseId: batch.warehouse_id,
            supplierId: batch.supplier_id,
            batchNumber: batch.batch_number,
            manufactureDate: batch.manufacture_date,
            expiryDate: batch.expiry_date,
            quantity: item.quantity,
            unitCost: item.purchase_cost_snapshot,
            transactionType: 'Return',
            referenceType: 'invoices',
            referenceId: invoice.id,
            notes: `Invoice cancellation ${invoice.invoice_number}`,
            userId,
            keepAverageCost: true,
          });
        }

        this.repository.cancelInvoice(invoice.id);
        this.repository.reverseProfitRecord(invoice.id);

        if (invoice.job_card_id) {
          this.repository.updateJobCardStatus(invoice.job_card_id, 'CANCELLED');
        }

        const cancelled = this.getInvoice(invoice.id);
        this.auditRepository.create({
          userId,
          action: 'CANCEL',
          entityType: 'invoices',
          entityId: invoice.id,
          oldValue: invoice,
          newValue: cancelled,
        });

        return cancelled;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  getMutableJobCard(jobCardId) {
    const jobCard = this.get(jobCardId);
    if (['COMPLETED', 'CANCELLED'].includes(jobCard.status)) {
      throw new AppError('Completed or cancelled job cards cannot be changed.', 400, 'JOB_CARD_LOCKED');
    }
    return jobCard;
  }

  calculateInvoiceTotals(lines) {
    const revenue = money(lines.reduce((sum, line) => sum + number(line.line_revenue), 0));
    const cost = money(lines.reduce((sum, line) => sum + number(line.line_cost), 0));
    const cgst = money(lines.reduce((sum, line) => sum + number(line.cgst_amount), 0));
    const sgst = money(lines.reduce((sum, line) => sum + number(line.sgst_amount), 0));
    const gst = money(cgst + sgst);

    return {
      revenue,
      cost,
      cgst,
      sgst,
      gst,
      grandTotal: money(revenue + gst),
      grossProfit: money(revenue - cost),
    };
  }
}

export function createJobCardService(db) {
  return new JobCardService(db);
}
