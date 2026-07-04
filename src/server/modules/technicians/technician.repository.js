export class TechnicianRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Helper to execute queries inside a transaction context
   * @param {function} fn - The transaction logic to run
   * @returns {any} Result of transaction function
   */
  transaction(fn) {
    return this.db.transaction(fn)();
  }

  /**
   * Create a new technician record
   * @param {object} data - Technician master payload
   * @returns {number} Inserted row ID
   */
  create(data) {
    return this.transaction(() => {
      const hasCode = data.technician_code && data.technician_code.trim() !== '';
      const tempCode = hasCode ? data.technician_code.trim() : `TEMP-${Date.now()}-${Math.random()}`;

      const result = this.db.prepare(`
        INSERT INTO technicians (
          technician_code,
          full_name,
          phone_number,
          specialization,
          is_active,
          notes
        )
        VALUES (
          ?,
          @full_name,
          @phone_number,
          @specialization,
          @is_active,
          @notes
        )
      `).run(tempCode, {
        specialization: null,
        notes: null,
        is_active: 1, // default active
        ...data
      });

      const insertId = result.lastInsertRowid;

      if (!hasCode) {
        const finalCode = String(insertId);
        this.db.prepare('UPDATE technicians SET technician_code = ? WHERE id = ?').run(finalCode, insertId);
      }

      return insertId;
    });
  }

  /**
   * Find a technician by unique internal ID
   * @param {number} id
   * @returns {object|undefined} Technician record or undefined
   */
  findById(id) {
    return this.db.prepare('SELECT * FROM technicians WHERE id = ?').get(id);
  }

  /**
   * Find a technician by unique business code
   * @param {string} code
   * @returns {object|undefined} Technician record or undefined
   */
  findByCode(code) {
    return this.db.prepare('SELECT * FROM technicians WHERE technician_code = ?').get(code);
  }

  /**
   * List technicians with optional filters and pagination
   * @param {object} filters
   * @param {string} [filters.search] - Partial match for code, name, or specialization
   * @param {boolean} [filters.activeOnly] - If true, only returns active technicians
   * @param {number} [filters.limit]
   * @param {number} [filters.offset]
   * @returns {object} { data, total }
   */
  list({ search, activeOnly, limit = 20, offset = 0 } = {}) {
    const params = [];
    const clauses = [];

    if (search) {
      clauses.push('(technician_code LIKE ? COLLATE NOCASE OR full_name LIKE ? COLLATE NOCASE OR specialization LIKE ? COLLATE NOCASE)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (activeOnly) {
      clauses.push('is_active = 1');
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const data = this.db.prepare(`
      SELECT * FROM technicians
      ${where}
      ORDER BY full_name ASC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) AS count FROM technicians
      ${where}
    `).get(...params).count;

    return { data, total };
  }

  /**
   * Update technician master fields (excluding code)
   * @param {number} id
   * @param {object} data
   * @returns {object} Updated technician record
   */
  update(id, data) {
    const columns = Object.keys(data).filter(col => col !== 'id' && col !== 'technician_code');
    if (columns.length === 0) {
      return this.findById(id);
    }

    const setClause = columns.map(col => `${col} = @${col}`).join(', ');
    this.db.prepare(`
      UPDATE technicians
      SET ${setClause},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...data, id });

    return this.findById(id);
  }

  /**
   * Soft deactivate a technician (keeps historical job references intact)
   * @param {number} id
   * @returns {object} Updated technician record
   */
  deactivate(id) {
    this.db.prepare(`
      UPDATE technicians
      SET is_active = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    return this.findById(id);
  }

  /**
   * Assigns a technician to a job card and writes an entry to assignment history
   * Runs in a transaction context.
   * @param {number} jobCardId
   * @param {number} technicianId
   * @param {number} userId - User performing assignment
   * @param {string|null} notes - Relational update context notes
   * @returns {number} Inserted assignment record ID
   */
  assignToJobCard(jobCardId, technicianId, userId, notes = null) {
    return this.transaction(() => {
      // 1. Update job card currently assigned technician
      this.db.prepare(`
        UPDATE job_cards
        SET technician_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(technicianId, jobCardId);

      // 2. Insert reassignment history record
      const result = this.db.prepare(`
        INSERT INTO job_card_assignments (
          job_card_id,
          technician_id,
          assigned_by,
          notes
        )
        VALUES (?, ?, ?, ?)
      `).run(jobCardId, technicianId, userId, notes);

      return result.lastInsertRowid;
    });
  }

  /**
   * Retrieves full assignment history logs for a job card
   * @param {number} jobCardId
   * @returns {Array} List of historical assignments
   */
  getAssignmentHistory(jobCardId) {
    return this.db.prepare(`
      SELECT
        a.id,
        a.job_card_id AS jobCardId,
        a.technician_id AS technicianId,
        t.technician_code AS technicianCode,
        t.full_name AS technicianName,
        a.assigned_at AS assignedAt,
        a.assigned_by AS assignedById,
        u.name AS assignedByName,
        a.notes
      FROM job_card_assignments a
      JOIN technicians t ON t.id = a.technician_id
      LEFT JOIN users u ON u.id = a.assigned_by
      WHERE a.job_card_id = ?
      ORDER BY a.assigned_at DESC, a.id DESC
    `).all(jobCardId);
  }

  /**
   * Get KPI metrics for a specific technician
   * @param {number} technicianId
   * @returns {object} { totalAssignedJobs, completedJobs, activeJobs }
   */
  getMetrics(technicianId) {
    return this.db.prepare(`
      SELECT
        COUNT(id) AS totalAssignedJobs,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completedJobs,
        COALESCE(SUM(CASE WHEN status IN ('DRAFT', 'IN_PROGRESS') THEN 1 ELSE 0 END), 0) AS activeJobs
      FROM job_cards
      WHERE technician_id = ?
    `).get(technicianId) || { totalAssignedJobs: 0, completedJobs: 0, activeJobs: 0 };
  }

  /**
   * Prevent N+1 queries when listing technicians: retrieves statistics metrics for multiple technician IDs
   * @param {Array<number>} technicianIds
   * @returns {object} Map of technicianId -> metrics object
   */
  getBulkMetrics(technicianIds) {
    if (!technicianIds || technicianIds.length === 0) {
      return {};
    }

    const placeholders = technicianIds.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT
        technician_id AS technicianId,
        COUNT(id) AS totalAssignedJobs,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completedJobs,
        COALESCE(SUM(CASE WHEN status IN ('DRAFT', 'IN_PROGRESS') THEN 1 ELSE 0 END), 0) AS activeJobs
      FROM job_cards
      WHERE technician_id IN (${placeholders})
      GROUP BY technician_id
    `).all(...technicianIds);

    const metricsMap = {};
    for (const id of technicianIds) {
      metricsMap[id] = { totalAssignedJobs: 0, completedJobs: 0, activeJobs: 0 };
    }
    for (const row of rows) {
      metricsMap[row.technicianId] = {
        totalAssignedJobs: row.totalAssignedJobs,
        completedJobs: row.completedJobs,
        activeJobs: row.activeJobs
      };
    }

    return metricsMap;
  }

  /**
   * Retrieve paginated list of job cards worked on, vehicles, and generated invoice statuses
   * @param {number} technicianId
   * @param {object} pagination
   * @param {number} pagination.limit
   * @param {number} pagination.offset
   * @returns {Array} List of service visit logs
   */
  getServiceHistory(technicianId, { limit = 20, offset = 0 } = {}) {
    return this.db.prepare(`
      SELECT
        jc.id AS jobCardId,
        jc.job_card_number AS jobCardNumber,
        jc.status AS jobCardStatus,
        jc.opened_at AS openedAt,
        jc.closed_at AS closedAt,
        v.id AS vehicleId,
        v.registration_number AS registrationNumber,
        v.make AS vehicleMake,
        v.model AS vehicleModel,
        c.id AS customerId,
        c.name AS customerName,
        inv.id AS invoiceId,
        inv.invoice_number AS invoiceNumber,
        inv.status AS invoiceStatus,
        inv.grand_total AS invoiceGrandTotal
      FROM job_cards jc
      JOIN vehicles v ON v.id = jc.vehicle_id
      JOIN customers c ON c.id = jc.customer_id
      LEFT JOIN invoices inv ON inv.job_card_id = jc.id
      WHERE jc.technician_id = ?
      ORDER BY jc.id DESC
      LIMIT ? OFFSET ?
    `).all(technicianId, limit, offset);
  }
}
