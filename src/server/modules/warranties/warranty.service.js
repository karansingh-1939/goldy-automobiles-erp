import { AppError } from '../../shared/errors/AppError.js';
import { WarrantyRepository } from './warranty.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { AccountingPostingEngine } from '../accounting/postingEngine.service.js';

function code(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export class WarrantyService {
  constructor(db) {
    this.db = db;
    this.repository = new WarrantyRepository(db);
    this.inventoryService = new InventoryService(db);
    this.postingEngine = new AccountingPostingEngine(db);
  }

  registerWarranty(data) {
    const { companyId, customerId, vehicleId, invoiceId, invoiceItemId, itemId, batchNumber, serialNumber, startDate, warrantyPeriodMonths } = data;
    if (!companyId || !customerId || !itemId || !startDate || warrantyPeriodMonths === undefined) {
      throw new AppError('Company, customer, item, start date, and warranty period are required.', 400, 'VALIDATION_ERROR');
    }

    const start = new Date(startDate);
    const end = new Date(start);
    end.setMonth(start.getMonth() + Number(warrantyPeriodMonths));
    const endDateStr = end.toISOString().slice(0, 10);

    return this.repository.createWarrantyRegistration({
      company_id: companyId,
      customer_id: customerId,
      vehicle_id: vehicleId || null,
      invoice_id: invoiceId || null,
      invoice_item_id: invoiceItemId || null,
      item_id: itemId,
      batch_number: batchNumber || null,
      serial_number: serialNumber || null,
      start_date: startDate,
      end_date: endDateStr,
      status: 'ACTIVE'
    });
  }

  fileClaim(payload, userId) {
    const { registrationId, claimDate, notes } = payload;
    if (!registrationId) {
      throw new AppError('Warranty registration ID is required.', 400, 'VALIDATION_ERROR');
    }

    const date = claimDate || new Date().toISOString().slice(0, 10);

    return this.repository.transaction(() => {
      const reg = this.repository.findWarrantyRegistrationById(registrationId);
      if (!reg) {
        throw new AppError('Warranty registration not found.', 404, 'ITEM_NOT_FOUND');
      }

      if (reg.status !== 'ACTIVE') {
        throw new AppError(`Cannot file a claim. Warranty registration is ${reg.status}.`, 400, 'VALIDATION_ERROR');
      }

      // Verify not expired
      const expiry = new Date(reg.end_date);
      const claim = new Date(date);
      if (claim > expiry) {
        this.repository.updateWarrantyRegistration(reg.id, { status: 'EXPIRED' });
        throw new AppError('Warranty registration has expired.', 400, 'WARRANTY_EXPIRED');
      }

      return this.repository.createWarrantyClaim({
        claim_number: code('WC'),
        company_id: reg.company_id || 1,
        warranty_registration_id: registrationId,
        claim_date: date,
        status: 'PENDING',
        notes: notes || null,
        settlement_type: null,
        settlement_date: null,
        replacement_item_id: null,
        replacement_batch_id: null,
        replacement_qty: null,
        created_by: userId
      });
    });
  }

  settleClaim(claimId, payload, userId) {
    const { settlementType, notes, replacementWarehouseId, replacementBatchId } = payload;
    if (!settlementType) {
      throw new AppError('Settlement type is required.', 400, 'VALIDATION_ERROR');
    }

    return this.repository.transaction(() => {
      const claim = this.repository.findWarrantyClaimById(claimId);
      if (!claim) {
        throw new AppError('Warranty claim not found.', 404, 'ITEM_NOT_FOUND');
      }
      if (claim.status !== 'PENDING') {
        throw new AppError(`Cannot settle a claim with status ${claim.status}.`, 400, 'VALIDATION_ERROR');
      }

      const reg = this.repository.findWarrantyRegistrationById(claim.warranty_registration_id);
      const companyId = claim.company_id || 1;
      const dateStr = new Date().toISOString().slice(0, 10);

      if (settlementType === 'REPLACEMENT') {
        if (!replacementWarehouseId || !replacementBatchId) {
          throw new AppError('Replacement warehouse and batch selection are required.', 400, 'VALIDATION_ERROR');
        }

        // 1. Process Stock Out of Replacement Part
        const batch = this.db.prepare('SELECT quantity, purchase_cost FROM inventory_batches WHERE id = ?').get(replacementBatchId);
        if (!batch) {
          throw new AppError('Selected inventory batch not found.', 404, 'RELATED_RECORD_NOT_FOUND');
        }
        if (Number(batch.quantity) < 1) {
          throw new AppError('Selected batch has insufficient quantity.', 400, 'INSUFFICIENT_STOCK');
        }

        this.inventoryService.stockOut({
          itemId: claim.item_id,
          warehouseId: replacementWarehouseId,
          batchId: replacementBatchId,
          quantity: 1,
          transactionType: 'Consumption',
          referenceType: 'warranty_claims',
          referenceId: claim.id,
          userId
        });

        // 2. Post Warranty Expense Voucher
        const warrantyExpenseLedgerId = this.postingEngine.ledgerResolver.getLedgerId(companyId, 'warranty_expense');
        const inventoryLedgerId = this.postingEngine.ledgerResolver.getLedgerId(companyId, 'inventory_stock');
        const itemCost = Math.round(Number(batch.purchase_cost) * 100) / 100;

        this.postingEngine.post({
          companyId,
          voucherType: 'Journal',
          voucherDate: dateStr,
          referenceTable: 'warranty_claims',
          referenceId: claim.id,
          narration: `Warranty replacement write-off for claim ${claim.claim_number}`,
          created_by: userId,
          entries: [
            { ledgerId: warrantyExpenseLedgerId, type: 'DEBIT', amount: itemCost },
            { ledgerId: inventoryLedgerId, type: 'CREDIT', amount: itemCost }
          ]
        });

        // 3. Mark old registration as claimed & create new warranty registration for the replaced part
        this.repository.updateWarrantyRegistration(reg.id, { status: 'CLAIMED' });

        const itemObj = this.db.prepare('SELECT warranty_period_months FROM inventory_items WHERE id = ?').get(claim.item_id);
        const wMonths = itemObj ? Number(itemObj.warranty_period_months) : 0;

        if (wMonths > 0) {
          this.registerWarranty({
            companyId,
            customerId: reg.customer_id,
            vehicleId: reg.vehicle_id,
            invoiceId: null,
            invoiceItemId: null,
            itemId: claim.item_id,
            batchNumber: `REP-${claim.claim_number}`,
            serialNumber: reg.serial_number,
            startDate: dateStr,
            warrantyPeriodMonths: wMonths
          });
        }

        return this.repository.updateWarrantyClaim(claim.id, {
          status: 'SETTLED',
          settlement_type: 'REPLACEMENT',
          settlement_date: dateStr,
          replacement_item_id: claim.item_id,
          replacement_batch_id: replacementBatchId,
          replacement_qty: 1,
          notes: notes || claim.notes
        });
      } else if (settlementType === 'REFUND') {
        // Issuing refund (Credit Note)
        // Mark old registration as claimed
        this.repository.updateWarrantyRegistration(reg.id, { status: 'CLAIMED' });

        return this.repository.updateWarrantyClaim(claim.id, {
          status: 'SETTLED',
          settlement_type: 'REFUND',
          settlement_date: dateStr,
          notes: notes || claim.notes
        });
      } else {
        // Repair
        return this.repository.updateWarrantyClaim(claim.id, {
          status: 'SETTLED',
          settlement_type: 'REPAIR',
          settlement_date: dateStr,
          notes: notes || claim.notes
        });
      }
    });
  }

  rejectClaim(claimId, payload, userId) {
    const claim = this.repository.findWarrantyClaimById(claimId);
    if (!claim) {
      throw new AppError('Warranty claim not found.', 404, 'ITEM_NOT_FOUND');
    }
    if (claim.status !== 'PENDING') {
      throw new AppError(`Cannot reject a claim with status ${claim.status}.`, 400, 'VALIDATION_ERROR');
    }

    return this.repository.updateWarrantyClaim(claim.id, {
      status: 'REJECTED',
      notes: payload.notes || 'Claim rejected.'
    });
  }

  lookupWarranty(query) {
    const { customerPhone, vehicleRegistration, itemSku } = query;
    let customerId = null;
    let vehicleId = null;
    let itemId = null;

    if (customerPhone) {
      const cust = this.db.prepare('SELECT id FROM customers WHERE phone = ?').get(customerPhone);
      if (cust) customerId = cust.id;
    }
    if (vehicleRegistration) {
      const veh = this.db.prepare('SELECT id FROM vehicles WHERE registration_number = ? COLLATE NOCASE').get(vehicleRegistration);
      if (veh) vehicleId = veh.id;
    }
    if (itemSku) {
      const item = this.db.prepare('SELECT id FROM inventory_items WHERE sku = ? COLLATE NOCASE').get(itemSku);
      if (item) itemId = item.id;
    }

    const clauses = [];
    const params = [];

    if (customerId) {
      clauses.push('w.customer_id = ?');
      params.push(customerId);
    }
    if (vehicleId) {
      clauses.push('w.vehicle_id = ?');
      params.push(vehicleId);
    }
    if (itemId) {
      clauses.push('w.item_id = ?');
      params.push(itemId);
    }

    if (clauses.length === 0) {
      return [];
    }

    const where = `WHERE ${clauses.join(' AND ')}`;
    return this.db.prepare(`
      SELECT w.*, c.name AS customer_name, v.registration_number, item.item_name, item.sku
      FROM warranty_registrations w
      JOIN customers c ON w.customer_id = c.id
      LEFT JOIN vehicles v ON w.vehicle_id = v.id
      JOIN inventory_items item ON w.item_id = item.id
      ${where}
      ORDER BY w.end_date DESC
    `).all(params);
  }
}
