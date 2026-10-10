import { localDate } from '../../shared/utils/local-date.js';
import { AppError } from '../../shared/errors/app-error.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { JobCardRepository } from './job-card.repository.js';
import { AccountingPostingEngine } from '../accounting/posting-engine.service.js';

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

function parseListQuery(query) {
  const page = Math.max(Number.parseInt(query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '20', 10) || 20, 1), 100);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: typeof query.search === 'string' ? query.search.trim() : '',
    status: typeof query.status === 'string' ? query.status.trim() : '',
    fromDate: typeof query.fromDate === 'string' ? query.fromDate.trim() : '',
    toDate: typeof query.toDate === 'string' ? query.toDate.trim() : '',
    exactMatchOnly: query.exactMatchOnly === 'true',
  };
}

function gstAmounts(revenue, gstRate, interstate = false) {
  const gstTotal = money((revenue * number(gstRate)) / 100);
  const half = money(gstTotal / 2);
  return {
    cgst: interstate ? 0 : half,
    sgst: interstate ? 0 : money(gstTotal - half),
    igst: interstate ? gstTotal : 0,
    gstTotal,
  };
}

export class JobCardService {
  constructor(db) {
    this.db = db;
    this.repository = new JobCardRepository(db);
    this.inventoryService = new InventoryService(db);
    this.auditRepository = new AuditRepository(db);
    this.postingEngine = new AccountingPostingEngine(db);
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
        unfilteredTotal: result.unfilteredTotal,
        matchType: result.matchType || '',
        matchValue: result.matchValue || '',
      },
    };
  }

  get(id) {
    const jobCard = this.repository.findJobCardById(id);
    if (!jobCard) {
      throw new AppError('Job card not found.', 404, 'JOB_CARD_NOT_FOUND');
    }

    const previousVisitsCount = this.db
      .prepare('SELECT COUNT(*) AS count FROM job_cards WHERE customer_id = ? AND id != ?')
      .get(jobCard.customer_id, id).count;

    return {
      ...jobCard,
      previous_visits_count: previousVisitsCount,
      parts: this.repository.listParts(id),
      labour: this.repository.listLabour(id),
      invoice: this.repository.findInvoiceByJobCardId(id) || null,
    };
  }

  create(payload, userId) {
    try {
      return this.repository.transaction(() => this.createIntake(payload, userId));
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  createIntake(payload, userId) {
    let customerId = payload.customer_id;
    let vehicleId = payload.vehicle_id;

    if (!customerId || !vehicleId) {
      required(payload.registration_number, 'Registration Number');
      required(payload.customer_name, 'Customer Name');

      const rawReg = String(payload.registration_number).trim();
      const regNormalized = rawReg.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      if (regNormalized.length < 4) {
        throw new AppError(
          'Registration number must be at least 4 alphanumeric characters.',
          400,
          'VALIDATION_ERROR',
        );
      }

      // Check if vehicle exists using normalized matching
      let vehicle = this.db
        .prepare(
          `
        SELECT * FROM vehicles 
        WHERE registration_number_normalized = ?
           OR replace(replace(replace(replace(registration_number, ' ', ''), '-', ''), '_', ''), '/', '') = ?
      `,
        )
        .get(regNormalized, regNormalized);

      let customer = null;
      let phone = null;
      if (payload.phone) {
        let clean = String(payload.phone)
          .trim()
          .replace(/[^0-9]/g, '');
        if (clean.length === 12 && clean.startsWith('91')) {
          clean = clean.slice(2);
        } else if (clean.length === 11 && clean.startsWith('0')) {
          clean = clean.slice(1);
        }
        if (clean.length !== 10) {
          throw new AppError('Phone number must be exactly 10 digits.', 400, 'VALIDATION_ERROR');
        }
        phone = clean;
      }

      if (vehicle) {
        vehicleId = vehicle.id;

        // Resolve Target Customer
        let targetCustomerId = payload.customer_id;
        if (!targetCustomerId && phone) {
          // Check by phone
          const matchingCustomer = this.db
            .prepare(
              `
            SELECT * FROM customers 
            WHERE phone = ? 
               OR phone = ? 
               OR phone = ? 
               OR phone = ? 
               OR replace(replace(replace(replace(phone, ' ', ''), '-', ''), '+', ''), '(', '') = ?
               OR substr(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '+', ''), '(', ''), -10) = ?
          `,
            )
            .get(phone, '0' + phone, '91' + phone, '+91' + phone, phone, phone);
          if (matchingCustomer) {
            targetCustomerId = matchingCustomer.id;
          }
        }

        if (targetCustomerId) {
          customerId = targetCustomerId;
          customer = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
          if (!customer)
            throw new AppError('Customer was not found.', 400, 'RELATED_RECORD_NOT_FOUND');

          // Update customer details if provided
          const customerUpdates = {};
          if (payload.customer_name && payload.customer_name !== customer.name)
            customerUpdates.name = payload.customer_name;
          if (payload.address && payload.address !== customer.address)
            customerUpdates.address = payload.address;
          if (payload.city && payload.city !== customer.city) customerUpdates.city = payload.city;
          if (payload.notes && payload.notes !== customer.notes)
            customerUpdates.notes = payload.notes;

          if (Object.keys(customerUpdates).length > 0) {
            const setClause = Object.keys(customerUpdates)
              .map((col) => `${col} = ?`)
              .join(', ');
            this.db
              .prepare(
                `UPDATE customers SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              )
              .run(...Object.values(customerUpdates), customerId);
          }
        } else if (payload.customer_name) {
          // Create new customer
          const result = this.db
            .prepare(
              `
            INSERT INTO customers (name, phone, address, city, notes, state)
            VALUES (?, ?, ?, ?, ?, 'Haryana')
          `,
            )
            .run(
              payload.customer_name,
              phone || null,
              payload.address || null,
              payload.city || null,
              payload.notes || null,
            );
          customerId = result.lastInsertRowid;
          customer = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
        } else {
          customerId = vehicle.customer_id;
          customer = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
        }

        // Handle explicit ownership transfer if requested
        if (payload.transfer_ownership && Number(customerId) !== Number(vehicle.customer_id)) {
          this.db
            .prepare(
              'UPDATE vehicles SET customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            )
            .run(customerId, vehicle.id);
          this.auditRepository.create({
            userId,
            action: 'UPDATE',
            entityType: 'vehicles',
            entityId: vehicle.id,
            oldValue: { customer_id: vehicle.customer_id },
            newValue: { customer_id: customerId },
          });
        }

        // Update vehicle details if provided
        const vehicleUpdates = {};
        if (payload.make && payload.make !== vehicle.make) vehicleUpdates.make = payload.make;
        if (payload.model && payload.model !== vehicle.model) vehicleUpdates.model = payload.model;
        if (payload.fuel_type && payload.fuel_type !== vehicle.fuel_type)
          vehicleUpdates.fuel_type = payload.fuel_type;
        if (payload.chassis_number && payload.chassis_number !== vehicle.chassis_number)
          vehicleUpdates.chassis_number = payload.chassis_number;
        if (payload.engine_number && payload.engine_number !== vehicle.engine_number)
          vehicleUpdates.engine_number = payload.engine_number;

        if (Object.keys(vehicleUpdates).length > 0) {
          const setClause = Object.keys(vehicleUpdates)
            .map((col) => `${col} = ?`)
            .join(', ');
          this.db
            .prepare(
              `UPDATE vehicles SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            )
            .run(...Object.values(vehicleUpdates), vehicleId);
        }
      } else {
        // Vehicle does not exist. Resolve Customer first.
        if (payload.customer_id) {
          customer = this.db
            .prepare('SELECT * FROM customers WHERE id = ?')
            .get(payload.customer_id);
        }

        if (!customer && phone) {
          customer = this.db
            .prepare(
              `
            SELECT * FROM customers 
            WHERE phone = ? 
               OR phone = ? 
               OR phone = ? 
               OR phone = ? 
               OR replace(replace(replace(replace(phone, ' ', ''), '-', ''), '+', ''), '(', '') = ?
               OR substr(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '+', ''), '(', ''), -10) = ?
          `,
            )
            .get(phone, '0' + phone, '91' + phone, '+91' + phone, phone, phone);
        }

        if (customer) {
          customerId = customer.id;
          // Update customer details if provided
          const customerUpdates = {};
          if (payload.customer_name && payload.customer_name !== customer.name)
            customerUpdates.name = payload.customer_name;
          if (payload.address && payload.address !== customer.address)
            customerUpdates.address = payload.address;
          if (payload.city && payload.city !== customer.city) customerUpdates.city = payload.city;
          if (payload.notes && payload.notes !== customer.notes)
            customerUpdates.notes = payload.notes;

          if (Object.keys(customerUpdates).length > 0) {
            const setClause = Object.keys(customerUpdates)
              .map((col) => `${col} = ?`)
              .join(', ');
            this.db
              .prepare(
                `UPDATE customers SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              )
              .run(...Object.values(customerUpdates), customerId);
          }
        } else {
          // Create new customer
          const result = this.db
            .prepare(
              `
            INSERT INTO customers (name, phone, address, city, notes, state)
            VALUES (?, ?, ?, ?, ?, 'Haryana')
          `,
            )
            .run(
              payload.customer_name,
              phone || null,
              payload.address || null,
              payload.city || null,
              payload.notes || null,
            );
          customerId = result.lastInsertRowid;
        }

        // Create new vehicle
        const result = this.db
          .prepare(
            `
          INSERT INTO vehicles (customer_id, registration_number, registration_number_normalized, make, model, fuel_type, chassis_number, engine_number, odometer_reading)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            customerId,
            rawReg.toUpperCase(),
            regNormalized,
            payload.make || null,
            payload.model || null,
            payload.fuel_type || null,
            payload.chassis_number || null,
            payload.engine_number || null,
            Number(payload.odometer_reading),
          );
        vehicleId = result.lastInsertRowid;
      }
    }

    const customer = this.repository.findCustomerById(customerId);
    if (!customer) {
      throw new AppError('Customer was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    const vehicle = this.repository.findVehicleById(vehicleId);
    if (!vehicle) {
      throw new AppError('Vehicle was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    // Handle explicit ownership transfer if vehicle already existed and is different from the job card customer
    if (payload.transfer_ownership && Number(vehicle.customer_id) !== Number(customer.id)) {
      this.db
        .prepare('UPDATE vehicles SET customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(customer.id, vehicle.id);
      this.auditRepository.create({
        userId,
        action: 'UPDATE',
        entityType: 'vehicles',
        entityId: vehicle.id,
        oldValue: { customer_id: vehicle.customer_id },
        newValue: { customer_id: customer.id },
      });
    }

    if (payload.assigned_to && !this.repository.findUserById(payload.assigned_to)) {
      throw new AppError('Assigned mechanic was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    if (payload.technician_id && !this.repository.findTechnicianById(payload.technician_id)) {
      throw new AppError('Assigned technician was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
    }

    const odo = number(payload.odometer_reading);
    if (odo < 0) {
      throw new AppError('Odometer reading cannot be negative.', 400, 'VALIDATION_ERROR');
    }

    if (odo < vehicle.odometer_reading) {
      throw new AppError(
        `Odometer reading cannot be less than the vehicle's last recorded reading (${vehicle.odometer_reading}).`,
        400,
        'VALIDATION_ERROR',
      );
    }

    try {
      return this.repository.transaction(() => {
        const jobCardId = this.repository.createJobCard({
          job_card_number: payload.job_card_number || code('JC'),
          customer_id: customerId,
          vehicle_id: vehicleId,
          status: 'DRAFT',
          complaint: payload.complaint || null,
          odometer_reading: odo,
          assigned_to: payload.assigned_to || null,
          technician_id: payload.technician_id || null,
          created_by: userId,
          fuel_level: payload.fuel_level || null,
          promised_delivery_at: payload.promised_delivery_at || null,
          toolkit_present: payload.toolkit_present ? 1 : 0,
          spare_wheel_present: payload.spare_wheel_present ? 1 : 0,
          jack_present: payload.jack_present ? 1 : 0,
          stereo_present: payload.stereo_present ? 1 : 0,
          battery_brand: payload.battery_brand || null,
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
    if (sellingPrice < 0) {
      throw new AppError('Selling price cannot be negative.', 400, 'VALIDATION_ERROR');
    }

    const gstRate = number(payload.gst_rate ?? item.gst_rate);
    if (gstRate < 0 || gstRate > 100) {
      throw new AppError('GST rate must be between 0 and 100.', 400, 'VALIDATION_ERROR');
    }
    const revenue = money(sellingPrice * quantity);
    const gst = gstAmounts(revenue, gstRate);
    const categoryName = item.category_name || item.category || '';
    const itemType = /lubricant|lube|oil|fluid/i.test(categoryName) ? 'LUBRICANT' : 'PART';

    try {
      return this.repository.transaction(() => {
        const partId = this.repository.createPart({
          job_card_id: jobCard.id,
          item_type: itemType,
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
        const gstRate = number(payload.gst_rate);
        if (gstRate < 0 || gstRate > 100) {
          throw new AppError('GST rate must be between 0 and 100.', 400, 'VALIDATION_ERROR');
        }

        const labourId = this.repository.createLabour({
          job_card_id: jobCard.id,
          description: String(payload.description).trim(),
          labour_charge: labourCharge,
          gst_rate: gstRate,
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
        if (
          this.db
            .prepare(
              'SELECT id FROM mechanic_time_entries WHERE job_card_id = ? AND stopped_at IS NULL LIMIT 1',
            )
            .get(jobCard.id)
        ) {
          throw new AppError(
            'Stop all mechanic timers before billing this job.',
            409,
            'JOB_TIMER_RUNNING',
          );
        }
        const approval = this.db
          .prepare(
            'SELECT * FROM estimate_approvals WHERE job_card_id = ? ORDER BY id DESC LIMIT 1',
          )
          .get(jobCard.id);
        if (approval && approval.status !== 'APPROVED') {
          throw new AppError(
            'Customer estimate approval is required before billing.',
            409,
            'ESTIMATE_APPROVAL_REQUIRED',
          );
        }

        if (parts.length === 0 && labourRows.length === 0) {
          throw new AppError(
            'At least one part or labour line is required before completion.',
            400,
            'VALIDATION_ERROR',
          );
        }

        const existingInvoice = this.repository.findInvoiceByJobCardId(jobCard.id);
        if (existingInvoice && existingInvoice.status !== 'CANCELLED') {
          throw new AppError(
            'This job card already has an active invoice.',
            400,
            'INVOICE_ALREADY_EXISTS',
          );
        }

        const companyState =
          this.db.prepare('SELECT state FROM companies WHERE id = 1').get()?.state || 'Haryana';
        const customerState =
          this.repository.findCustomerById(jobCard.customer_id)?.state || companyState;
        const interstate = customerState.trim().toLowerCase() !== companyState.trim().toLowerCase();

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
          const gst = gstAmounts(revenue, part.gst_rate, interstate);

          return {
            item_type: part.item_type || 'PART',
            inventory_item_id: part.inventory_item_id,
            batch_id: part.batch_id,
            description: part.description,
            quantity: number(part.quantity),
            unit_price: money(part.selling_price),
            purchase_cost_snapshot: stockOut.unitCost,
            gst_rate: number(part.gst_rate),
            cgst_amount: gst.cgst,
            sgst_amount: gst.sgst,
            igst_amount: gst.igst,
            line_revenue: revenue,
            line_cost: cost,
            line_profit: profit,
            line_total: money(revenue + gst.gstTotal),
          };
        });

        const labourLines = labourRows.map((labour) => {
          const revenue = money(labour.labour_charge);
          const gst = gstAmounts(revenue, labour.gst_rate, interstate);
          const isOutside = String(labour.description).startsWith('[Outside Job]');

          return {
            item_type: isOutside ? 'OUTSIDE_JOB' : 'LABOR',
            inventory_item_id: null,
            batch_id: null,
            description: labour.description,
            quantity: 1,
            unit_price: revenue,
            purchase_cost_snapshot: 0,
            gst_rate: number(labour.gst_rate),
            cgst_amount: gst.cgst,
            sgst_amount: gst.sgst,
            igst_amount: gst.igst,
            line_revenue: revenue,
            line_cost: 0,
            line_profit: revenue,
            line_total: money(revenue + gst.gstTotal),
          };
        });

        const invoiceLines = [...partLines, ...labourLines];
        const totals = this.calculateInvoiceTotals(invoiceLines);
        if (approval && totals.grandTotal > approval.amount + 0.005) {
          throw new AppError(
            'Invoice exceeds the approved estimate. Request approval for the revised amount.',
            409,
            'ESTIMATE_AMOUNT_EXCEEDED',
          );
        }

        // Assert Customer Credit Limit (Company ID = 1 by default in job card flow)
        this.assertCreditLimit(1, jobCard.customer_id, totals.grandTotal);

        const invoiceId = this.repository.createInvoice({
          invoice_number: code('INV'),
          job_card_id: jobCard.id,
          customer_id: jobCard.customer_id,
          vehicle_id: jobCard.vehicle_id,
          invoice_date: localDate(),
          subtotal: totals.revenue,
          taxable_amount: totals.revenue,
          cgst_total: totals.cgst,
          sgst_total: totals.sgst,
          igst_total: totals.igst,
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
          const invoiceItemId = this.repository.createInvoiceItem({
            ...line,
            invoice_id: invoiceId,
          });

          if (line.item_type === 'PART' && line.inventory_item_id) {
            const item = this.repository.db
              .prepare('SELECT warranty_period_months FROM inventory_items WHERE id = ?')
              .get(line.inventory_item_id);
            if (item && item.warranty_period_months > 0) {
              const start = new Date();
              const end = new Date(start);
              end.setMonth(start.getMonth() + Number(item.warranty_period_months));

              let batchNum = null;
              if (line.batch_id) {
                const batch = this.repository.db
                  .prepare('SELECT batch_number FROM inventory_batches WHERE id = ?')
                  .get(line.batch_id);
                if (batch) batchNum = batch.batch_number;
              }

              this.repository.db
                .prepare(
                  `
                INSERT INTO warranty_registrations (
                  company_id, customer_id, vehicle_id, invoice_id, invoice_item_id, item_id, batch_number, start_date, end_date, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
              `,
                )
                .run(
                  1,
                  jobCard.customer_id,
                  jobCard.vehicle_id,
                  invoiceId,
                  invoiceItemId,
                  line.inventory_item_id,
                  batchNum,
                  localDate(start),
                  localDate(end),
                );
            }
          }
        }

        this.repository.createProfitRecord({
          invoice_id: invoiceId,
          revenue: totals.revenue,
          cost_total: totals.cost,
          gross_profit: totals.grossProfit,
          net_profit: totals.grossProfit,
        });

        // 8. Post Sales Voucher & COGS Journal automatically
        const customerLedgerId = this.postingEngine.getOrCreateCustomerLedger(
          1,
          jobCard.customer_id,
        );
        const partsSubtotal = partLines.reduce((sum, line) => sum + line.line_revenue, 0);
        const labourSubtotal = labourLines.reduce((sum, line) => sum + line.line_revenue, 0);

        const accountingEntries = [];
        accountingEntries.push({
          ledgerId: customerLedgerId,
          type: 'DEBIT',
          amount: totals.grandTotal,
        });

        if (partsSubtotal > 0) {
          accountingEntries.push({
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'parts_sales'),
            type: 'CREDIT',
            amount: partsSubtotal,
          });
        }
        if (labourSubtotal > 0) {
          accountingEntries.push({
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'labour_sales'),
            type: 'CREDIT',
            amount: labourSubtotal,
          });
        }

        if (totals.cgst > 0) {
          accountingEntries.push({
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'cgst_output'),
            type: 'CREDIT',
            amount: totals.cgst,
          });
        }
        if (totals.sgst > 0) {
          accountingEntries.push({
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'sgst_output'),
            type: 'CREDIT',
            amount: totals.sgst,
          });
        }

        if (totals.igst > 0) {
          accountingEntries.push({
            ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'igst_output'),
            type: 'CREDIT',
            amount: totals.igst,
          });
        }
        const sumCredits = partsSubtotal + labourSubtotal + totals.gst;
        const roundoff = money(totals.grandTotal - sumCredits);
        if (Math.abs(roundoff) >= 0.01) {
          if (roundoff > 0) {
            accountingEntries.push({
              ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'round_off'),
              type: 'CREDIT',
              amount: roundoff,
            });
          } else {
            accountingEntries.push({
              ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'round_off'),
              type: 'DEBIT',
              amount: Math.abs(roundoff),
            });
          }
        }

        this.postingEngine.post({
          companyId: 1,
          voucherType: 'Sales',
          voucherDate: localDate(),
          referenceTable: 'invoices',
          referenceId: invoiceId,
          narration: `Sales invoice for Job Card ${jobCard.job_card_number}`,
          created_by: userId,
          entries: accountingEntries,
        });

        if (totals.cost > 0) {
          const cogsEntries = [
            {
              ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'cogs'),
              type: 'DEBIT',
              amount: totals.cost,
            },
            {
              ledgerId: this.postingEngine.ledgerResolver.getLedgerId(1, 'inventory_stock'),
              type: 'CREDIT',
              amount: totals.cost,
            },
          ];
          this.postingEngine.post({
            companyId: 1,
            voucherType: 'Journal',
            voucherDate: localDate(),
            referenceTable: 'invoices',
            referenceId: invoiceId,
            narration: `Cost of goods sold for Job Card ${jobCard.job_card_number}`,
            created_by: userId,
            entries: cogsEntries,
          });
        }

        this.repository.updateJobCardStatus(jobCard.id, 'COMPLETED');
        this.repository.updateVehicleOdometer(jobCard.vehicle_id, jobCard.odometer_reading);

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

  assertCreditLimit(companyId, customerId, grandTotal) {
    const customer = this.repository.db
      .prepare('SELECT name, ledger_id, credit_limit FROM customers WHERE id = ?')
      .get(customerId);
    if (!customer || customer.credit_limit === null || customer.credit_limit === undefined) {
      return;
    }

    let outstanding = 0;
    if (customer.ledger_id) {
      const balanceRow = this.repository.db
        .prepare(
          `
        SELECT 
          l.opening_balance,
          COALESCE(SUM(CASE WHEN je.entry_type = 'DEBIT' THEN je.amount ELSE 0 END), 0) AS total_debit,
          COALESCE(SUM(CASE WHEN je.entry_type = 'CREDIT' THEN je.amount ELSE 0 END), 0) AS total_credit
        FROM ledgers l
        LEFT JOIN journal_entries je ON je.ledger_id = l.id
        LEFT JOIN vouchers v ON je.voucher_id = v.id AND v.company_id = ? AND v.status <> 'CANCELLED'
        WHERE l.id = ?
        GROUP BY l.id
      `,
        )
        .get(companyId, customer.ledger_id);

      if (balanceRow) {
        outstanding =
          Number(balanceRow.opening_balance) +
          Number(balanceRow.total_debit) -
          Number(balanceRow.total_credit);
      }
    }

    if (outstanding + grandTotal > customer.credit_limit) {
      throw new AppError(
        `Action would exceed customer credit limit of ${customer.credit_limit}. Current outstanding: ${Math.round(outstanding * 100) / 100}`,
        400,
        'CREDIT_LIMIT_EXCEEDED',
      );
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
          throw new AppError(
            'Only finalized invoices can be cancelled.',
            400,
            'INVALID_INVOICE_STATUS',
          );
        }

        const allocations = this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM receipt_allocations WHERE document_type = 'job_card_invoice' AND document_id = ?",
          )
          .get(invoice.id).n;
        if (allocations || invoice.amount_paid > 0) {
          throw new AppError(
            'Cancel payment allocations before cancelling this invoice.',
            400,
            'ACTIVE_ALLOCATIONS_EXIST',
          );
        }
        const returns = this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM customer_returns WHERE invoice_id = ? AND status <> 'CANCELLED'",
          )
          .get(invoice.id).n;
        if (returns) {
          throw new AppError(
            'Invoice has active returns and cannot be cancelled.',
            400,
            'ACTIVE_RETURNS_EXIST',
          );
        }

        for (const item of invoice.items.filter(
          (line) => line.item_type === 'PART' || line.item_type === 'LUBRICANT',
        )) {
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
          });
        }
        // Delete/Reverse linked Vouchers from accounting engine
        const linkedVouchers = this.db
          .prepare(
            "SELECT id FROM vouchers WHERE reference_table = 'invoices' AND reference_id = ?",
          )
          .all(invoice.id);
        for (const v of linkedVouchers) {
          this.postingEngine.deleteVoucher(1, v.id);
        }

        this.db
          .prepare("UPDATE warranty_registrations SET status = 'EXPIRED' WHERE invoice_id = ?")
          .run(invoice.id);
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
      throw new AppError(
        'Completed or cancelled job cards cannot be changed.',
        400,
        'JOB_CARD_LOCKED',
      );
    }
    return jobCard;
  }

  calculateInvoiceTotals(lines) {
    const revenue = money(lines.reduce((sum, line) => sum + number(line.line_revenue), 0));
    const cost = money(lines.reduce((sum, line) => sum + number(line.line_cost), 0));
    const cgst = money(lines.reduce((sum, line) => sum + number(line.cgst_amount), 0));
    const sgst = money(lines.reduce((sum, line) => sum + number(line.sgst_amount), 0));
    const igst = money(lines.reduce((sum, line) => sum + number(line.igst_amount), 0));
    const gst = money(cgst + sgst + igst);

    return {
      revenue,
      cost,
      cgst,
      sgst,
      igst,
      gst,
      grandTotal: money(revenue + gst),
      grossProfit: money(revenue - cost),
    };
  }
}

export function createJobCardService(db) {
  return new JobCardService(db);
}
