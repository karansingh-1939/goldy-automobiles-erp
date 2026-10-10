import { AppError } from '../../shared/errors/app-error.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { ExpenseRepository } from './expense.repository.js';
import { parseExpenseListQuery, validateExpensePayload } from './expense.validator.js';
import { AccountingPostingEngine } from '../accounting/posting-engine.service.js';

function normalizeDatabaseError(error, action = null) {
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

export class ExpenseService {
  constructor(db) {
    this.db = db;
    this.repository = new ExpenseRepository(db);
    this.auditRepository = new AuditRepository(db);
    this.postingEngine = new AccountingPostingEngine(db);
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
          description: data.description ?? null,
          created_by: userId || null,
        });

        this.auditRepository.create({
          userId,
          action: 'CREATE',
          entityType: 'expenses',
          entityId: expense.id,
          newValue: expense,
        });

        this.postExpense(expense, userId);

        return expense;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  postExpense(expense, userId) {
    // Post Expense Voucher automatically
    const categoryKeyMap = {
      Rent: 'rent_expense',
      Salary: 'salary_expense',
      Electricity: 'electricity_expense',
      Internet: 'internet_expense',
      Miscellaneous: 'misc_expense',
    };
    const systemKey = categoryKeyMap[expense.category] || 'misc_expense';
    const expenseLedgerId = this.postingEngine.ledgerResolver.getLedgerId(1, systemKey);
    const cashLedgerId = this.postingEngine.ledgerResolver.getLedgerId(1, 'cash_in_hand');

    const voucherResult = this.postingEngine.post({
      companyId: 1,
      voucherType: 'Payment',
      voucherDate: expense.expense_date,
      referenceTable: 'expenses',
      referenceId: expense.id,
      narration: `Expense payment: ${expense.category}. ${expense.description || ''}`,
      created_by: userId,
      entries: [
        { ledgerId: expenseLedgerId, type: 'DEBIT', amount: expense.amount },
        { ledgerId: cashLedgerId, type: 'CREDIT', amount: expense.amount },
      ],
    });

    this.db
      .prepare('UPDATE expenses SET voucher_id = ? WHERE id = ?')
      .run(voucherResult.voucherId, expense.id);
    expense.voucher_id = voucherResult.voucherId;
  }

  update(id, payload, userId) {
    const existing = this.get(id);
    const data = validateExpensePayload(payload, { partial: true });

    try {
      return this.repository.transaction(() => {
        this.cancelExpensePosting(existing);
        const expense = this.repository.update(id, data);
        this.postExpense(expense, userId);
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
        this.cancelExpensePosting(existing);

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
      throw normalizeDatabaseError(error, 'delete');
    }
  }

  cancelExpensePosting(expense) {
    const vouchers = this.db
      .prepare(
        `
      SELECT id, company_id FROM vouchers
      WHERE status <> 'CANCELLED' AND (
        id = @voucherId OR (company_id = 1 AND reference_table = 'expenses' AND reference_id = @expenseId)
      )
    `,
      )
      .all({ voucherId: expense.voucher_id, expenseId: expense.id });
    for (const voucher of vouchers)
      this.postingEngine.deleteVoucher(voucher.company_id, voucher.id);
  }
}

export function createExpenseService(db) {
  return new ExpenseService(db);
}
