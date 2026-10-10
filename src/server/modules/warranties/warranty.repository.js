export class WarrantyRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  createWarrantyRegistration(data) {
    const result = this.db
      .prepare(
        `
      INSERT INTO warranty_registrations (
        company_id,
        customer_id,
        vehicle_id,
        invoice_id,
        invoice_item_id,
        item_id,
        batch_number,
        serial_number,
        start_date,
        end_date,
        status
      ) VALUES (
        @company_id,
        @customer_id,
        @vehicle_id,
        @invoice_id,
        @invoice_item_id,
        @item_id,
        @batch_number,
        @serial_number,
        @start_date,
        @end_date,
        @status
      )
    `,
      )
      .run(data);

    return this.findWarrantyRegistrationById(result.lastInsertRowid);
  }

  findWarrantyRegistrationById(id) {
    return this.db
      .prepare(
        `
      SELECT w.*, c.name AS customer_name, v.registration_number, item.item_name, item.sku
      FROM warranty_registrations w
      JOIN customers c ON w.customer_id = c.id
      LEFT JOIN vehicles v ON w.vehicle_id = v.id
      JOIN inventory_items item ON w.item_id = item.id
      WHERE w.id = ?
    `,
      )
      .get(id);
  }

  listWarrantyRegistrations({ companyId, customerId, vehicleId, itemId, status }) {
    const clauses = ['w.company_id = ?'];
    const params = [companyId];

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
    if (status) {
      clauses.push('w.status = ?');
      params.push(status);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db
      .prepare(
        `
      SELECT w.*, c.name AS customer_name, v.registration_number, item.item_name, item.sku
      FROM warranty_registrations w
      JOIN customers c ON w.customer_id = c.id
      LEFT JOIN vehicles v ON w.vehicle_id = v.id
      JOIN inventory_items item ON w.item_id = item.id
      ${where}
      ORDER BY w.end_date ASC
    `,
      )
      .all(params);
  }

  updateWarrantyRegistration(id, data) {
    const columns = Object.keys(data);
    const setClause = columns.map((col) => `${col} = @${col}`).join(', ');
    this.db
      .prepare(
        `
      UPDATE warranty_registrations
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `,
      )
      .run({ ...data, id });

    return this.findWarrantyRegistrationById(id);
  }

  // CLAIMS
  createWarrantyClaim(data) {
    const result = this.db
      .prepare(
        `
      INSERT INTO warranty_claims (
        claim_number,
        company_id,
        warranty_registration_id,
        claim_date,
        status,
        notes,
        settlement_type,
        settlement_date,
        replacement_item_id,
        replacement_batch_id,
        replacement_qty,
        created_by
      ) VALUES (
        @claim_number,
        @company_id,
        @warranty_registration_id,
        @claim_date,
        @status,
        @notes,
        @settlement_type,
        @settlement_date,
        @replacement_item_id,
        @replacement_batch_id,
        @replacement_qty,
        @created_by
      )
    `,
      )
      .run(data);

    return this.findWarrantyClaimById(result.lastInsertRowid);
  }

  findWarrantyClaimById(id) {
    return this.db
      .prepare(
        `
      SELECT c.*, w.customer_id, w.vehicle_id, w.item_id, w.serial_number, item.item_name, item.sku
      FROM warranty_claims c
      JOIN warranty_registrations w ON c.warranty_registration_id = w.id
      JOIN inventory_items item ON w.item_id = item.id
      WHERE c.id = ?
    `,
      )
      .get(id);
  }

  listWarrantyClaims({ companyId, status }) {
    const clauses = ['c.company_id = ?'];
    const params = [companyId];

    if (status) {
      clauses.push('c.status = ?');
      params.push(status);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db
      .prepare(
        `
      SELECT c.*, w.customer_id, w.vehicle_id, w.item_id, w.serial_number, item.item_name, item.sku, cust.name AS customer_name
      FROM warranty_claims c
      JOIN warranty_registrations w ON c.warranty_registration_id = w.id
      JOIN inventory_items item ON w.item_id = item.id
      JOIN customers cust ON w.customer_id = cust.id
      ${where}
      ORDER BY c.claim_date DESC, c.id DESC
    `,
      )
      .all(params);
  }

  updateWarrantyClaim(id, data) {
    const columns = Object.keys(data);
    const setClause = columns.map((col) => `${col} = @${col}`).join(', ');
    this.db
      .prepare(
        `
      UPDATE warranty_claims
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `,
      )
      .run({ ...data, id });

    return this.findWarrantyClaimById(id);
  }

  findActiveRegistrationByItem(customerId, vehicleId, itemId) {
    const clauses = ['customer_id = ?', 'item_id = ?', "status = 'ACTIVE'"];
    const params = [customerId, itemId];

    if (vehicleId) {
      clauses.push('vehicle_id = ?');
      params.push(vehicleId);
    }

    const where = `WHERE ${clauses.join(' AND ')}`;
    return this.db
      .prepare(
        `
      SELECT * FROM warranty_registrations
      ${where}
      ORDER BY end_date DESC
      LIMIT 1
    `,
      )
      .get(params);
  }
}
