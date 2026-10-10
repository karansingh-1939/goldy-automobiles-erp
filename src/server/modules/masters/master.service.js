import { AppError } from '../../shared/errors/app-error.js';
import { validatePayload } from './master.validator.js';

function normalizeDatabaseError(error, action = null) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new AppError(
      'A record with the same unique value already exists.',
      409,
      'DUPLICATE_RECORD',
    );
  }

  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    if (action === 'delete') {
      return new AppError(
        'Cannot delete record because it is referenced by other records.',
        400,
        'RELATED_RECORD_EXISTS',
      );
    }
    return new AppError('Related record was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
  }

  if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
    return new AppError('Record violates a database constraint.', 400, 'CONSTRAINT_FAILED');
  }

  return error;
}

export class MasterService {
  constructor({ repository, auditService, config }) {
    this.repository = repository;
    this.auditService = auditService;
    this.config = config;
  }

  list(query) {
    const { rows, total } = this.repository.list(query);

    return {
      data: rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  get(id) {
    const record = this.repository.findById(id);

    if (!record) {
      throw new AppError('Record not found.', 404, 'RECORD_NOT_FOUND');
    }

    return record;
  }

  create(payload, userId) {
    if (this.config.entityType === 'vehicles') {
      delete payload.registration_number_normalized;
    }
    if (this.config.entityType === 'vehicles' && !payload.customer_id) {
      let defaultCustomer = this.repository.db
        .prepare("SELECT * FROM customers WHERE phone = '9999999999'")
        .get();
      if (!defaultCustomer) {
        const result = this.repository.db
          .prepare(
            `
          INSERT INTO customers (name, phone, address, city, state)
          VALUES ('General Customer', '9999999999', 'Workshop', 'Karnal', 'Haryana')
        `,
          )
          .run();
        defaultCustomer = { id: result.lastInsertRowid };
      }
      payload.customer_id = defaultCustomer.id;
    }

    if (this.config.entityType === 'vehicles' && payload.registration_number) {
      payload.registration_number_normalized = String(payload.registration_number)
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
    }

    const data = validatePayload(this.config, payload);
    this.validateRelations(data);

    try {
      const record = this.repository.create(data);
      this.auditService.record({
        userId,
        action: 'CREATE',
        entityType: this.config.entityType,
        entityId: record.id,
        newValue: record,
      });

      return record;
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  update(id, payload, userId) {
    const existing = this.get(id);
    if (this.config.entityType === 'vehicles') {
      delete payload.registration_number_normalized;
    }
    if (this.config.entityType === 'vehicles' && payload.registration_number) {
      payload.registration_number_normalized = String(payload.registration_number)
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
    }
    const data = validatePayload(this.config, payload, { partial: true });
    this.validateRelations(data);

    try {
      const record = this.repository.update(id, data);
      this.auditService.record({
        userId,
        action: 'UPDATE',
        entityType: this.config.entityType,
        entityId: id,
        oldValue: existing,
        newValue: record,
      });

      return record;
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  delete(id, userId) {
    const existing = this.get(id);

    try {
      this.repository.delete(id);
      this.auditService.record({
        userId,
        action: 'DELETE',
        entityType: this.config.entityType,
        entityId: id,
        oldValue: existing,
      });

      return { success: true };
    } catch (error) {
      throw normalizeDatabaseError(error, 'delete');
    }
  }

  validateRelations(data) {
    for (const relation of this.config.relations || []) {
      if (data[relation.field] !== undefined && data[relation.field] !== null) {
        const exists = this.repository.exists(relation.table, data[relation.field]);

        if (!exists) {
          throw new AppError(`${relation.label} was not found.`, 400, 'RELATED_RECORD_NOT_FOUND');
        }
      }
    }
  }
}
