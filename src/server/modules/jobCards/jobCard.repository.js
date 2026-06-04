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
    return this.db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  }

  findBatchById(id) {
    return this.db.prepare('SELECT * FROM inventory_batches WHERE id = ?').get(id);
  }

  listJobCards({ search, pageSize, offset }) {
    const params = [];
    const where = search
      ? `WHERE job_cards.job_card_number LIKE ? COLLATE NOCASE
          OR customers.name LIKE ? COLLATE NOCASE
          OR vehicles.registration_number LIKE ? COLLATE NOCASE`
      : '';

    if (search) {
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const data = this.db.prepare(`
      SELECT
        job_cards.*,
        customers.name AS customer_name,
        vehicles.registration_number,
        users.name AS assigned_mechanic_name
      FROM job_cards
      JOIN customers ON customers.id = job_cards.customer_id
      JOIN vehicles ON vehicles.id = job_cards.vehicle_id
      LEFT JOIN users ON users.id = job_cards.assigned_to
      ${where}
      ORDER BY job_cards.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM job_cards
      JOIN customers ON customers.id = job_cards.customer_id
      JOIN vehicles ON vehicles.id = job_cards.vehicle_id
      ${where}
    `).get(...params).count;

    return { data, total };
  }

  findJobCardById(id) {
    return this.db.prepare(`
      SELECT
        job_cards.*,
        customers.name AS customer_name,
        vehicles.registration_number,
        users.name AS assigned_mechanic_name
      FROM job_cards
      JOIN customers ON customers.id = job_cards.customer_id
      JOIN vehicles ON vehicles.id = job_cards.vehicle_id
      LEFT JOIN users ON users.id = job_cards.assigned_to
      WHERE job_cards.id = ?
    `).get(id);
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
        created_by
      )
      VALUES (
        @job_card_number,
        @customer_id,
        @vehicle_id,
        @status,
        @complaint,
        @odometer_reading,
        @assigned_to,
        @created_by
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
        'PART',
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
        inventory_batches.warehouse_id
      FROM job_card_items
      JOIN inventory_items ON inventory_items.id = job_card_items.inventory_item_id
      JOIN inventory_batches ON inventory_batches.id = job_card_items.batch_id
      WHERE job_card_items.job_card_id = ?
        AND job_card_items.item_type = 'PART'
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
      SELECT *
      FROM invoice_items
      WHERE invoice_id = ?
      ORDER BY id
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
