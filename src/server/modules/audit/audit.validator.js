import { AppError } from '../../shared/errors/app-error.js';

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
    throw new AppError('Date must be a valid YYYY-MM-DD date.', 400, 'VALIDATION_ERROR');
  }

  return date;
}

export function parseAuditListQuery(query = {}) {
  const page = Math.max(Number.parseInt(query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '20', 10) || 20, 1), 100);
  const entityType = hasValue(query.entityType) ? String(query.entityType).trim() : undefined;
  const action = hasValue(query.action) ? String(query.action).trim() : undefined;
  const userId = hasValue(query.userId)
    ? Number.parseInt(query.userId, 10) || undefined
    : undefined;
  const dateFrom = normalizeDate(query.dateFrom ?? query.from);
  const dateTo = normalizeDate(query.dateTo ?? query.to);
  const search = hasValue(query.search) ? String(query.search).trim() : undefined;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AppError('Date range is invalid.', 400, 'VALIDATION_ERROR');
  }

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    entityType,
    action,
    userId,
    dateFrom,
    dateTo,
    search,
  };
}
