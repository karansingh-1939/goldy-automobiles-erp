export class JobCardRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  findCustomerById(id) {
    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  }

  findVehicleById(id) {
    return this.db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  }

  findUserById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  findInventoryItemById(id) {
    return this.db.prepare(`
      SELECT inventory_items.*, inventory_categories.name AS category_name
      FROM inventory_items
      LEFT JOIN inventory_categories ON inventory_categories.id = inventory_items.category_id
      WHERE inventory_items.id = ?
    `).get(id);
  }

  findBatchById(id) {
    return this.db.prepare('SELECT * FROM inventory_batches WHERE id = ?').get(id);
  }

  listJobCards({ search, status, fromDate, toDate, exactMatchOnly, pageSize, offset }) {
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('job_cards.status = ?');
      params.push(status);
    }

    if (fromDate) {
      conditions.push('DATE(job_cards.opened_at) >= DATE(?)');
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push('DATE(job_cards.opened_at) <= DATE(?)');
      params.push(toDate);
    }

    let searchMode = 'none';
    let matchType = '';
    let matchValue = '';
    let searchCondition = '';
    const searchParams = [];
    const orderByParams = [];
    let orderBy = 'job_cards.opened_at DESC, job_cards.id DESC';

    if (search) {
      const query = search.trim();

      // Smart format detection
      let detectedType = 'name';
      if (/^\d+$/.test(query)) {
        detectedType = 'phone';
      } else if (/^JC-\d+/i.test(query)) {
        detectedType = 'job_card_number';
      } else if (/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/i.test(query) || (/^[A-Z0-9\s-]+$/i.test(query) && /[A-Z]/i.test(query) && /\d/.test(query))) {
        detectedType = 'registration_number';
      }

      // Check order based on detectedType
      const checks = [];
      if (detectedType === 'job_card_number') {
        checks.push('job_card_number', 'registration_number', 'phone', 'name');
      } else if (detectedType === 'registration_number') {
        checks.push('registration_number', 'job_card_number', 'phone', 'name');
      } else if (detectedType === 'phone') {
        checks.push('phone', 'job_card_number', 'registration_number', 'name');
      } else {
        checks.push('name', 'job_card_number', 'registration_number', 'phone');
      }

      for (const type of checks) {
        if (type === 'job_card_number') {
          const count = this.db.prepare(`
            SELECT COUNT(*) AS count FROM job_cards
            JOIN customers ON customers.id = job_cards.customer_id
            JOIN vehicles ON vehicles.id = job_cards.vehicle_id
            WHERE job_cards.job_card_number = ? COLLATE NOCASE
          `).get(query).count;
          if (count > 0) {
            searchMode = 'exact';
            matchType = 'Job Card Number';
            matchValue = query;
            searchCondition = 'job_cards.job_card_number = ? COLLATE NOCASE';
            searchParams.push(query);
            break;
          }
        } else if (type === 'registration_number') {
          const count = this.db.prepare(`
            SELECT COUNT(*) AS count FROM job_cards
            JOIN customers ON customers.id = job_cards.customer_id
            JOIN vehicles ON vehicles.id = job_cards.vehicle_id
            WHERE vehicles.registration_number = ? COLLATE NOCASE
          `).get(query).count;
          if (count > 0) {
            searchMode = 'exact';
            matchType = 'Registration Number';
            matchValue = query;
            searchCondition = 'vehicles.registration_number = ? COLLATE NOCASE';
            searchParams.push(query);
            break;
          }
        } else if (type === 'phone') {
          const count = this.db.prepare(`
            SELECT COUNT(*) AS count FROM job_cards
            JOIN customers ON customers.id = job_cards.customer_id
            JOIN vehicles ON vehicles.id = job_cards.vehicle_id
            WHERE customers.phone = ?
          `).get(query).count;
          if (count > 0) {
            searchMode = 'exact';
            matchType = 'Phone Number';
            matchValue = query;
            searchCondition = 'customers.phone = ?';
            searchParams.push(query);
            break;
          }
        } else if (type === 'name') {
          const count = this.db.prepare(`
            SELECT COUNT(*) AS count FROM job_cards
            JOIN customers ON customers.id = job_cards.customer_id
            JOIN vehicles ON vehicles.id = job_cards.vehicle_id
            WHERE customers.name = ? COLLATE NOCASE
          `).get(query).count;
          if (count > 0) {
            searchMode = 'exact';
            matchType = 'Customer Name';
            matchValue = query;
            searchCondition = 'customers.name = ? COLLATE NOCASE';
            searchParams.push(query);
            break;
          }
        }
      }

      if (searchMode === 'none') {
        if (exactMatchOnly) {
          return { data: [], total: 0, unfilteredTotal: this.db.prepare('SELECT COUNT(*) AS count FROM job_cards').get().count, matchType: '', matchValue: '' };
        } else {
          searchMode = 'partial';
          searchCondition = `(job_cards.job_card_number LIKE ? COLLATE NOCASE
            OR customers.name LIKE ? COLLATE NOCASE
            OR customers.phone LIKE ? COLLATE NOCASE
            OR vehicles.registration_number LIKE ? COLLATE NOCASE
            OR vehicles.engine_number LIKE ? COLLATE NOCASE
            OR vehicles.chassis_number LIKE ? COLLATE NOCASE)`;
          
          const wildcard = `%${query}%`;
          searchParams.push(wildcard, wildcard, wildcard, wildcard, wildcard, wildcard);

          if (detectedType === 'phone') {
            orderBy = `CASE WHEN customers.phone LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, job_cards.opened_at DESC, job_cards.id DESC`;
            orderByParams.push(wildcard);
          } else if (detectedType === 'job_card_number') {
            orderBy = `CASE WHEN job_cards.job_card_number LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, job_cards.opened_at DESC, job_cards.id DESC`;
            orderByParams.push(wildcard);
          } else if (detectedType === 'registration_number') {
            orderBy = `CASE WHEN vehicles.registration_number LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, job_cards.opened_at DESC, job_cards.id DESC`;
            orderByParams.push(wildcard);
          } else {
            orderBy = `CASE WHEN customers.name LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, job_cards.opened_at DESC, job_cards.id DESC`;
            orderByParams.push(wildcard);
          }
        }
      }
    }

    const finalConditions = [...conditions];
    if (searchCondition) {
      finalConditions.push(searchCondition);
    }
    const where = finalConditions.length > 0 ? `WHERE ${finalConditions.join(' AND ')}` : '';

    const baseParams = conditions.length > 0 ? params.slice(0, conditions.length) : [];
    const dataParams = [...baseParams, ...searchParams, ...orderByParams];
    const totalParams = [...baseParams, ...searchParams];

    const data = this.db.prepare(`
      SELECT
        job_cards.*,
        customers.name AS customer_name,
        customers.phone AS customer_phone,
        vehicles.registration_number,
        vehicles.engine_number,
        vehicles.chassis_number,
        COALESCE(technicians.full_name, users.name) AS assigned_mechanic_name
      FROM job_cards
      JOIN customers ON customers.id = job_cards.customer_id
      JOIN vehicles ON vehicles.id = job_cards.vehicle_id
      LEFT JOIN users ON users.id = job_cards.assigned_to
      LEFT JOIN technicians ON technicians.id = job_cards.technician_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...dataParams, pageSize, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM job_cards
      JOIN customers ON customers.id = job_cards.customer_id
      JOIN vehicles ON vehicles.id = job_cards.vehicle_id
      ${where}
    `).get(...totalParams).count;

    const unfilteredTotal = this.db.prepare('SELECT COUNT(*) AS count FROM job_cards').get().count;

    return { data, total, unfilteredTotal, matchType, matchValue };
  }

  findJobCardById(id) {
    return this.db.prepare(`
      SELECT
        job_cards.*,
        customers.name AS customer_name,
        customers.phone AS customer_phone,
        vehicles.registration_number,
        vehicles.engine_number,
        vehicles.chassis_number,
        COALESCE(technicians.full_name, users.name) AS assigned_mechanic_name
      FROM job_cards
      JOIN customers ON customers.id = job_cards.customer_id
      JOIN vehicles ON vehicles.id = job_cards.vehicle_id
      LEFT JOIN users ON users.id = job_cards.assigned_to
      LEFT JOIN technicians ON technicians.id = job_cards.technician_id
      WHERE job_cards.id = ?
    `).get(id);
  }

  findTechnicianById(id) {
    return this.db.prepare('SELECT * FROM technicians WHERE id = ?').get(id);
  }

  createJobCard(data) {
    const result = this.db.prepare(`
      INSERT INTO job_cards (
        job_card_number,
        customer_id,
        vehicle_id,
        status,
        complaint,
        odometer_reading,
        assigned_to,
        technician_id,
        created_by,
        fuel_level,
        promised_delivery_at,
        toolkit_present,
        spare_wheel_present,
        jack_present,
        stereo_present,
        battery_brand
      )
      VALUES (
        @job_card_number,
        @customer_id,
        @vehicle_id,
        @status,
        @complaint,
        @odometer_reading,
        @assigned_to,
        @technician_id,
        @created_by,
        @fuel_level,
        @promised_delivery_at,
        @toolkit_present,
        @spare_wheel_present,
        @jack_present,
        @stereo_present,
        @battery_brand
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  updateJobCardStatus(id, status) {
    this.db.prepare(`
      UPDATE job_cards
      SET status = ?,
          closed_at = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE closed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, status, id);
  }

  updateVehicleOdometer(vehicleId, odometerReading) {
    this.db.prepare(`
      UPDATE vehicles
      SET odometer_reading = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(odometerReading, vehicleId);
  }

  createPart(data) {
    const result = this.db.prepare(`
      INSERT INTO job_card_items (
        job_card_id,
        item_type,
        inventory_item_id,
        batch_id,
        description,
        quantity,
        selling_price,
        purchase_cost_snapshot,
        gst_rate,
        gst_amount,
        line_total
      )
      VALUES (
        @job_card_id,
        @item_type,
        @inventory_item_id,
        @batch_id,
        @description,
        @quantity,
        @selling_price,
        @purchase_cost_snapshot,
        @gst_rate,
        @gst_amount,
        @line_total
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  createLabour(data) {
    const result = this.db.prepare(`
      INSERT INTO job_card_labour (
        job_card_id,
        description,
        labour_charge,
        gst_rate
      )
      VALUES (
        @job_card_id,
        @description,
        @labour_charge,
        @gst_rate
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  listParts(jobCardId) {
    return this.db.prepare(`
      SELECT
        job_card_items.*,
        inventory_items.sku,
        inventory_items.item_name,
        inventory_items.category,
        inventory_batches.warehouse_id
      FROM job_card_items
      JOIN inventory_items ON inventory_items.id = job_card_items.inventory_item_id
      JOIN inventory_batches ON inventory_batches.id = job_card_items.batch_id
      WHERE job_card_items.job_card_id = ?
        AND job_card_items.item_type IN ('PART', 'LUBRICANT')
      ORDER BY job_card_items.id
    `).all(jobCardId);
  }

  listLabour(jobCardId) {
    return this.db.prepare(`
      SELECT *
      FROM job_card_labour
      WHERE job_card_id = ?
      ORDER BY id
    `).all(jobCardId);
  }

  createInvoice(data) {
    const result = this.db.prepare(`
      INSERT INTO invoices (
        invoice_number,
        job_card_id,
        customer_id,
        vehicle_id,
        invoice_date,
        subtotal,
        taxable_amount,
        cgst_total,
        sgst_total,
        gst_total,
        grand_total,
        status,
        revenue,
        cost_total,
        gross_profit,
        net_profit,
        created_by
      )
      VALUES (
        @invoice_number,
        @job_card_id,
        @customer_id,
        @vehicle_id,
        @invoice_date,
        @subtotal,
        @taxable_amount,
        @cgst_total,
        @sgst_total,
        @gst_total,
        @grand_total,
        @status,
        @revenue,
        @cost_total,
        @gross_profit,
        @net_profit,
        @created_by
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  createInvoiceItem(data) {
    const result = this.db.prepare(`
      INSERT INTO invoice_items (
        invoice_id,
        item_type,
        inventory_item_id,
        batch_id,
        description,
        quantity,
        unit_price,
        purchase_cost_snapshot,
        gst_rate,
        cgst_amount,
        sgst_amount,
        line_revenue,
        line_cost,
        line_profit,
        line_total
      )
      VALUES (
        @invoice_id,
        @item_type,
        @inventory_item_id,
        @batch_id,
        @description,
        @quantity,
        @unit_price,
        @purchase_cost_snapshot,
        @gst_rate,
        @cgst_amount,
        @sgst_amount,
        @line_revenue,
        @line_cost,
        @line_profit,
        @line_total
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  createProfitRecord(data) {
    const result = this.db.prepare(`
      INSERT INTO profit_records (
        invoice_id,
        revenue,
        cost_total,
        gross_profit,
        expense_total,
        net_profit
      )
      VALUES (
        @invoice_id,
        @revenue,
        @cost_total,
        @gross_profit,
        0,
        @net_profit
      )
    `).run(data);

    return result.lastInsertRowid;
  }

  findInvoiceById(id) {
    return this.db.prepare(`
      SELECT *
      FROM invoices
      WHERE id = ?
    `).get(id);
  }

  findInvoiceByJobCardId(jobCardId) {
    return this.db.prepare(`
      SELECT *
      FROM invoices
      WHERE job_card_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(jobCardId);
  }

  listInvoiceItems(invoiceId) {
    return this.db.prepare(`
      SELECT
        invoice_items.*,
        inventory_items.category,
        inventory_items.hsn_code
      FROM invoice_items
      LEFT JOIN inventory_items ON inventory_items.id = invoice_items.inventory_item_id
      WHERE invoice_items.invoice_id = ?
      ORDER BY invoice_items.id
    `).all(invoiceId);
  }

  cancelInvoice(id) {
    this.db.prepare(`
      UPDATE invoices
      SET status = 'CANCELLED',
          payment_status = 'UNPAID',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  }

  reverseProfitRecord(invoiceId) {
    this.db.prepare(`
      UPDATE profit_records
      SET revenue = 0,
          cost_total = 0,
          gross_profit = 0,
          expense_total = 0,
          net_profit = 0
      WHERE invoice_id = ?
    `).run(invoiceId);
  }
}
