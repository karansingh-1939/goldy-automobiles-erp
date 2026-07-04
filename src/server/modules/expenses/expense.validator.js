import { AppError } from '../../shared/errors/AppError.js';

export const expenseCategories = [
  'Rent',
  'Salary',
  'Electricity',
  'Internet',
  'Fuel',
  'Maintenance',
  'Miscellaneous',
];

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function normalizeDate(value) {
  if (!hasValue(value)) {
    return undefined;
  }

  const date = String(value).trim();
  if (!isoDatePattern.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
    throw new AppError('Expense date must be a valid YYYY-MM-DD date.', 400, 'VALIDATION_ERROR');
  }

  return date;
}

function normalizeCategory(value) {
  if (!hasValue(value)) {
    return undefined;
  }

  const category = String(value).trim();
  if (!expenseCategories.includes(category)) {
    throw new AppError('Expense category is invalid.', 400, 'VALIDATION_ERROR');
  }

  return category;
}

function normalizeAmount(value) {
  if (!hasValue(value)) {
    return undefined;
  }

  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Expense amount must be greater than zero.', 400, 'VALIDATION_ERROR');
  }

  return amount;
}

function normalizeDescription(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const description = String(value).trim();
  if (description.length > 1000) {
    throw new AppError('Description must be 1000 characters or fewer.', 400, 'VALIDATION_ERROR');
  }

  return description || null;
}

export function validateExpensePayload(payload = {}, { partial = false } = {}) {
  const data = {};
  const unknownFields = Object.keys(payload)
    .filter((field) => !['date', 'expense_date', 'category', 'amount', 'description'].includes(field));

  if (unknownFields.length) {
    throw new AppError(`Unknown fields: ${unknownFields.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  const expenseDate = normalizeDate(payload.expense_date ?? payload.date);
  const category = normalizeCategory(payload.category);
  const amount = normalizeAmount(payload.amount);
  const description = normalizeDescription(payload.description);

  if (!partial) {
    if (!expenseDate) throw new AppError('Expense date is required.', 400, 'VALIDATION_ERROR');
    if (!category) throw new AppError('Expense category is required.', 400, 'VALIDATION_ERROR');
    if (amount === undefined) throw new AppError('Expense amount is required.', 400, 'VALIDATION_ERROR');
  }

  if (expenseDate !== undefined) {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (process.env.ALLOW_FUTURE_EXPENSES !== 'true' && expenseDate > todayStr) {
      throw new AppError('Expense date cannot be in the future.', 400, 'VALIDATION_ERROR');
    }
    data.expense_date = expenseDate;
  }
  if (category !== undefined) data.category = category;
  if (amount !== undefined) data.amount = amount;
  if (description !== undefined) data.description = description;

  if (partial && Object.keys(data).length === 0) {
    throw new AppError('At least one field is required.', 400, 'VALIDATION_ERROR');
  }

  return data;
}

export function parseExpenseListQuery(query = {}) {
  const page = Math.max(Number.parseInt(query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '20', 10) || 20, 1), 100);
  const category = normalizeCategory(query.category);
  const dateFrom = normalizeDate(query.dateFrom ?? query.from);
  const dateTo = normalizeDate(query.dateTo ?? query.to);

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AppError('Date range is invalid.', 400, 'VALIDATION_ERROR');
  }

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    category,
    dateFrom,
    dateTo,
  };
}
