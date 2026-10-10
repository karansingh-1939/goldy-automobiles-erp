/**
 * Repository layer for the Vehicle Service History module.
 * Provides SQLite operations to fetch consolidated vehicle and customer service history data.
 */
export class ServiceHistoryRepository {
  /**
   * @param {import('better-sqlite3').Database} db - The SQLite database instance.
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Retrieves a vehicle record by its ID.
   * @param {number} vehicleId - The primary key of the vehicle.
   * @returns {object|null} The vehicle record, or null if not found.
   */
  getVehicleById(vehicleId) {
    return (
      this.db
        .prepare(
          `
      SELECT 
        id,
        customer_id AS customerId,
        registration_number AS registrationNumber,
        make,
        model,
        variant,
        fuel_type AS fuelType,
        year,
        vin,
        engine_number AS engineNumber,
        chassis_number AS chassisNumber,
        odometer_reading AS odometerReading,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM vehicles
      WHERE id = ?
    `,
        )
        .get(vehicleId) || null
    );
  }

  /**
   * Retrieves a customer record by their ID.
   * @param {number} customerId - The primary key of the customer.
   * @returns {object|null} The customer record, or null if not found.
   */
  getCustomerById(customerId) {
    return (
      this.db
        .prepare(
          `
      SELECT 
        id,
        name,
        phone,
        alternate_phone AS alternatePhone,
        email,
        gstin,
        address,
        city,
        state,
        pincode,
        notes,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM customers
      WHERE id = ?
    `,
        )
        .get(customerId) || null
    );
  }

  /**
   * Retrieves all vehicle records owned by a specific customer.
   * @param {number} customerId - The owner's customer ID.
   * @returns {Array<object>} List of vehicles.
   */
  getVehiclesByCustomerId(customerId) {
    return this.db
      .prepare(
        `
      SELECT 
        id,
        customer_id AS customerId,
        registration_number AS registrationNumber,
        make,
        model,
        variant,
        fuel_type AS fuelType,
        year,
        vin,
        engine_number AS engineNumber,
        chassis_number AS chassisNumber,
        odometer_reading AS odometerReading,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM vehicles
      WHERE customer_id = ?
      ORDER BY registration_number ASC
    `,
      )
      .all(customerId);
  }

  /**
   * Retrieves basic service visits (paired job cards & invoices) for a specific vehicle.
   * Elements are ordered chronologically descending by date.
   *
   * @param {number} vehicleId - Target vehicle ID.
   * @returns {Array<object>} Aggregated visits list.
   */
  getServiceVisitsByVehicleId(vehicleId) {
    return this.db
      .prepare(
        `
      SELECT 
        jc.id AS jobCardId,
        jc.job_card_number AS jobCardNumber,
        jc.status AS jobCardStatus,
        jc.complaint,
        jc.diagnosis,
        jc.odometer_reading AS odometerReading,
        jc.opened_at AS openedAt,
        jc.closed_at AS closedAt,
        inv.id AS invoiceId,
        inv.invoice_number AS invoiceNumber,
        inv.status AS invoiceStatus,
        inv.invoice_date AS invoiceDate,
        COALESCE(inv.grand_total, 0) AS invoiceTotal
      FROM job_cards jc
      LEFT JOIN invoices inv ON inv.job_card_id = jc.id
      WHERE jc.vehicle_id = ?
      ORDER BY COALESCE(inv.invoice_date, DATE(jc.opened_at)) DESC, jc.id DESC
    `,
      )
      .all(vehicleId);
  }

  /**
   * Bulk loads invoice items for a list of invoice IDs.
   * Prevents N+1 database queries.
   *
   * @param {Array<number>} invoiceIds - List of invoice primary key IDs.
   * @returns {Array<object>} Combined list of invoice items.
   */
  getBulkInvoiceItems(invoiceIds) {
    if (!invoiceIds || invoiceIds.length === 0) {
      return [];
    }

    const placeholders = invoiceIds.map(() => '?').join(', ');
    const sql = `
      SELECT 
        invoice_id AS invoiceId,
        item_type AS itemType,
        description,
        quantity,
        unit_price AS unitPrice,
        line_total AS lineTotal
      FROM invoice_items
      WHERE invoice_id IN (${placeholders})
    `;

    return this.db.prepare(sql).all(...invoiceIds);
  }

  /**
   * Bulk loads job card items for a list of job card IDs.
   * Prevents N+1 database queries.
   *
   * @param {Array<number>} jobCardIds - List of job card primary key IDs.
   * @returns {Array<object>} Combined list of job card items.
   */
  getBulkJobCardItems(jobCardIds) {
    if (!jobCardIds || jobCardIds.length === 0) {
      return [];
    }

    const placeholders = jobCardIds.map(() => '?').join(', ');
    const sql = `
      SELECT 
        job_card_id AS jobCardId,
        item_type AS itemType,
        description,
        quantity,
        selling_price AS unitPrice,
        line_total AS lineTotal
      FROM job_card_items
      WHERE job_card_id IN (${placeholders})
    `;

    return this.db.prepare(sql).all(...jobCardIds);
  }
}
