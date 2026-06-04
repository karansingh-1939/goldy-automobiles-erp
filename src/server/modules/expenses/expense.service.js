import { AppError } from '../../shared/errors/AppError.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { ExpenseRepository } from './expense.repository.js';
import { parseExpenseListQuery, validateExpensePayload } from './expense.validator.js';

function normalizeDatabaseError(error) {
  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new AppError('Related record was not found.', 400, 'RELATED_RECORD_NOT_FOUND');
  }

  if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
    return new AppError('Record violates a database constraint.', 400, 'CONSTRAINT_FAILED');
  }

  return error;
}

export class ExpenseService {
  constructor(db) {
    this.repository = new ExpenseRepository(db);
    this.auditRepository = new AuditRepository(db);
  }

  list(query = {}) {
    const filters = parseExpenseListQuery(query);
    const result = this.repository.list(filters);

    return {
      data: result.data,
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / filters.pageSize),
      },
    };
  }

  get(id) {
    const expense = this.repository.findById(id);

    if (!expense) {
      throw new AppError('Expense not found.', 404, 'EXPENSE_NOT_FOUND');
    }

    return expense;
  }

  create(payload, userId) {
    const data = validateExpensePayload(payload);

    try {
      return this.repository.transaction(() => {
        const expense = this.repository.create({
          ...data,
          created_by: userId || null,
        });

        this.auditRepository.create({
          userId,
          action: 'CREATE',
          entityType: 'expenses',
          entityId: expense.id,
          newValue: expense,
        });

        return expense;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  update(id, payload, userId) {
    const existing = this.get(id);
    const data = validateExpensePayload(payload, { partial: true });

    try {
      return this.repository.transaction(() => {
        const expense = this.repository.update(id, data);
        this.auditRepository.create({
          userId,
          action: 'UPDATE',
          entityType: 'expenses',
          entityId: expense.id,
          oldValue: existing,
          newValue: expense,
        });

        return expense;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  delete(id, userId) {
    const existing = this.get(id);

    try {
      return this.repository.transaction(() => {
        this.repository.delete(id);
        this.auditRepository.create({
          userId,
          action: 'DELETE',
          entityType: 'expenses',
          entityId: id,
          oldValue: existing,
        });

        return { success: true };
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }
}

export function createExpenseService(db) {
  return new ExpenseService(db);
}
