import { AppError } from '../../shared/errors/app-error.js';
import { TechnicianRepository } from './technician.repository.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { JobCardRepository } from '../job-cards/job-card.repository.js';

function required(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new AppError(`${label} is required.`, 400, 'VALIDATION_ERROR');
  }
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

function normalizeDatabaseError(error) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new AppError(
      'A technician with this code already exists.',
      409,
      'DUPLICATE_TECHNICIAN_CODE',
    );
  }
  return error;
}

export class TechnicianService {
  /**
   * Constructs the TechnicianService
   * Supports constructor injection of repositories
   */
  constructor(
    db,
    {
      technicianRepository = new TechnicianRepository(db),
      auditRepository = new AuditRepository(db),
      jobCardRepository = new JobCardRepository(db),
    } = {},
  ) {
    this.db = db;
    this.repository = technicianRepository;
    this.auditRepository = auditRepository;
    this.jobCardRepository = jobCardRepository;
  }

  /**
   * Creates a new technician
   * @param {object} payload - Create technician payload
   * @param {number} userId - The user creating the record
   * @returns {object} Created technician
   */
  create(payload, userId) {
    required(payload.full_name, 'Full Name');
    required(payload.phone_number, 'Phone Number');

    // Business code format validation: only if explicitly provided
    if (payload.technician_code) {
      const codePattern = /^[a-zA-Z0-9_-]+$/;
      if (!codePattern.test(payload.technician_code)) {
        throw new AppError(
          'Technician Code contains invalid characters. Only alphanumeric, dashes, and underscores are allowed.',
          400,
          'INVALID_CODE_FORMAT',
        );
      }

      // Check if code is already in use
      const existing = this.repository.findByCode(payload.technician_code);
      if (existing) {
        throw new AppError(
          `Technician Code "${payload.technician_code}" is already in use.`,
          409,
          'DUPLICATE_TECHNICIAN_CODE',
        );
      }
    }

    try {
      const technicianId = this.repository.create({
        technician_code: payload.technician_code ? payload.technician_code.trim() : null,
        full_name: payload.full_name.trim(),
        phone_number: payload.phone_number.trim(),
        specialization: payload.specialization ? payload.specialization.trim() : null,
        notes: payload.notes ? payload.notes.trim() : null,
        is_active: 1,
      });

      const technician = this.repository.findById(technicianId);
      this.auditRepository.create({
        userId,
        action: 'CREATE',
        entityType: 'technicians',
        entityId: technicianId,
        newValue: technician,
      });

      return technician;
    } catch (err) {
      throw normalizeDatabaseError(err);
    }
  }

  /**
   * Retrieves a technician by ID
   * @param {number} id
   * @returns {object} Technician record
   */
  get(id) {
    const technician = this.repository.findById(id);
    if (!technician) {
      throw new AppError('Technician was not found.', 404, 'TECHNICIAN_NOT_FOUND');
    }
    return technician;
  }

  /**
   * Lists technicians with paginated stats (avoiding N+1 queries)
   * @param {object} query
   * @returns {object} paginated technician payload
   */
  list(query = {}) {
    const parsed = parseListQuery(query);
    const activeOnly = query.activeOnly === 'true';

    const result = this.repository.list({
      search: parsed.search,
      activeOnly,
      limit: parsed.pageSize,
      offset: parsed.offset,
    });

    // Bulk load metrics to prevent N+1 queries
    const ids = result.data.map((t) => t.id);
    const bulkMetrics = this.repository.getBulkMetrics(ids);

    const data = result.data.map((tech) => ({
      ...tech,
      metrics: bulkMetrics[tech.id] || { totalAssignedJobs: 0, completedJobs: 0, activeJobs: 0 },
    }));

    return {
      data,
      pagination: {
        page: parsed.page,
        pageSize: parsed.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / parsed.pageSize),
      },
    };
  }

  /**
   * Updates technician fields (excluding code)
   * @param {number} id
   * @param {object} payload
   * @param {number} userId
   * @returns {object} Updated technician record
   */
  update(id, payload, userId) {
    const current = this.get(id);

    const updateData = {};
    if (payload.full_name !== undefined) {
      required(payload.full_name, 'Full Name');
      updateData.full_name = payload.full_name.trim();
    }
    if (payload.phone_number !== undefined) {
      required(payload.phone_number, 'Phone Number');
      updateData.phone_number = payload.phone_number.trim();
    }
    if (payload.specialization !== undefined) {
      updateData.specialization = payload.specialization ? payload.specialization.trim() : null;
    }
    if (payload.notes !== undefined) {
      updateData.notes = payload.notes ? payload.notes.trim() : null;
    }
    if (payload.is_active !== undefined) {
      updateData.is_active = payload.is_active ? 1 : 0;
    }

    try {
      const updated = this.repository.update(id, updateData);

      this.auditRepository.create({
        userId,
        action: 'UPDATE',
        entityType: 'technicians',
        entityId: id,
        oldValue: current,
        newValue: updated,
      });

      return updated;
    } catch (err) {
      throw normalizeDatabaseError(err);
    }
  }

  /**
   * Deactivates a technician record (soft delete)
   * @param {number} id
   * @param {number} userId
   * @returns {object} Deactivated technician record
   */
  deactivate(id, userId) {
    const current = this.get(id);
    if (current.is_active === 0) {
      return current; // already inactive
    }

    const deactivated = this.repository.deactivate(id);

    this.auditRepository.create({
      userId,
      action: 'DEACTIVATE',
      entityType: 'technicians',
      entityId: id,
      oldValue: current,
      newValue: deactivated,
    });

    return deactivated;
  }

  /**
   * Assigns a technician to a job card
   * @param {number} jobCardId
   * @param {number} technicianId
   * @param {number} userId - The user assigning the technician
   * @param {string|null} notes - Assignment context notes
   * @returns {object} Updated Job Card
   */
  assignToJobCard(jobCardId, technicianId, userId, notes = null) {
    // 1. Verify technician exists and is active
    const technician = this.get(technicianId);
    if (technician.is_active === 0) {
      throw new AppError('Cannot assign to an inactive technician.', 400, 'INACTIVE_TECHNICIAN');
    }

    // 2. Verify job card exists
    const jobCard = this.jobCardRepository.findJobCardById(jobCardId);
    if (!jobCard) {
      throw new AppError('Job card not found.', 404, 'JOB_CARD_NOT_FOUND');
    }

    // 3. Verify job card is editable (not in completed or cancelled states)
    if (['COMPLETED', 'CANCELLED'].includes(jobCard.status)) {
      throw new AppError(
        'Cannot assign technician to a finalized or cancelled job card.',
        400,
        'JOB_CARD_LOCKED',
      );
    }

    this.repository.assignToJobCard(jobCardId, technicianId, userId, notes);

    const updatedJobCard = this.jobCardRepository.findJobCardById(jobCardId);

    // Write audit log on job card entity
    this.auditRepository.create({
      userId,
      action: 'ASSIGN_TECHNICIAN',
      entityType: 'job_cards',
      entityId: jobCardId,
      oldValue: jobCard,
      newValue: updatedJobCard,
    });

    return updatedJobCard;
  }

  /**
   * Retrieves technician service history and metrics
   * @param {number} id - Technician ID
   * @param {object} query
   * @returns {object} Complete history and metrics payload
   */
  getHistoryAndMetrics(id, query = {}) {
    const technician = this.get(id);
    const parsed = parseListQuery(query);

    const metrics = this.repository.getMetrics(id);
    const history = this.repository.getServiceHistory(id, {
      limit: parsed.pageSize,
      offset: parsed.offset,
    });

    return {
      technician: {
        id: technician.id,
        technician_code: technician.technician_code,
        full_name: technician.full_name,
      },
      metrics: {
        totalAssignedJobs: metrics.totalAssignedJobs,
        completedJobs: metrics.completedJobs,
        activeJobs: metrics.activeJobs,
      },
      history: history.map((row) => ({
        jobCardId: row.jobCardId,
        jobCardNumber: row.jobCardNumber,
        jobCardStatus: row.jobCardStatus,
        openedAt: row.openedAt,
        closedAt: row.closedAt,
        vehicle: {
          id: row.vehicleId,
          registrationNumber: row.registrationNumber,
          make: row.vehicleMake,
          model: row.vehicleModel,
        },
        customer: {
          id: row.customerId,
          name: row.customerName,
        },
        invoice: row.invoiceId
          ? {
              id: row.invoiceId,
              invoiceNumber: row.invoiceNumber,
              status: row.invoiceStatus,
              grandTotal: row.invoiceGrandTotal,
            }
          : null,
      })),
      pagination: {
        page: parsed.page,
        pageSize: parsed.pageSize,
      },
    };
  }
}

export function createTechnicianService(db) {
  return new TechnicianService(db);
}
