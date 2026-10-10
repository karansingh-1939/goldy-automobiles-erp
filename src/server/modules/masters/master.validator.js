import { AppError } from '../../shared/errors/app-error.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function normalizeValue(value, rule) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (rule.type === 'string' || rule.type === 'email') {
    const text = String(value).trim();
    return rule.normalize === 'uppercase' ? text.toUpperCase() : text;
  }

  if (rule.type === 'integer') {
    return Number.parseInt(value, 10);
  }

  if (rule.type === 'number') {
    return Number(value);
  }

  if (rule.type === 'boolean') {
    return value === true || value === 1 || value === '1' ? 1 : 0;
  }

  return value;
}

function validateValue(field, value, rule, errors) {
  if (!hasValue(value)) {
    if (rule.required) {
      errors[field] = 'This field is required.';
    }
    return;
  }

  if (rule.type === 'string' || rule.type === 'email') {
    if (typeof value !== 'string') {
      errors[field] = 'Must be text.';
      return;
    }

    if (rule.min && value.length < rule.min) {
      errors[field] = `Must be at least ${rule.min} characters.`;
      return;
    }

    if (rule.max && value.length > rule.max) {
      errors[field] = `Must be ${rule.max} characters or fewer.`;
      return;
    }

    if (rule.type === 'email' && !emailPattern.test(value)) {
      errors[field] = 'Must be a valid email address.';
      return;
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors[field] = 'Has an invalid format.';
    }
  }

  if (rule.type === 'integer') {
    if (!Number.isInteger(value)) {
      errors[field] = 'Must be an integer.';
      return;
    }

    if (rule.min !== undefined && value < rule.min) {
      errors[field] = `Must be at least ${rule.min}.`;
      return;
    }

    if (rule.max !== undefined && value > rule.max) {
      errors[field] = `Must be ${rule.max} or less.`;
    }
  }

  if (rule.type === 'number') {
    if (!Number.isFinite(value)) {
      errors[field] = 'Must be a number.';
      return;
    }

    if (rule.min !== undefined && value < rule.min) {
      errors[field] = `Must be at least ${rule.min}.`;
    }
  }
}

export function validatePayload(config, payload, { partial = false } = {}) {
  const clean = {};
  const errors = {};
  const unknownFields = Object.keys(payload || {}).filter((field) => !config.fields[field]);

  if (unknownFields.length) {
    throw new AppError(`Unknown fields: ${unknownFields.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  for (const [field, rule] of Object.entries(config.fields)) {
    const normalized = normalizeValue(payload?.[field], rule);

    if (normalized !== undefined) {
      clean[field] = normalized;
    }

    if (!partial || normalized !== undefined) {
      validateValue(field, normalized, rule, errors);
    }
  }

  if (partial && Object.keys(clean).length === 0) {
    throw new AppError('At least one field is required.', 400, 'VALIDATION_ERROR');
  }

  if (Object.keys(errors).length) {
    const error = new AppError('Validation failed.', 400, 'VALIDATION_ERROR');
    error.details = errors;
    throw error;
  }

  return clean;
}

export function parseListQuery(query) {
  const page = Math.max(Number.parseInt(query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '20', 10) || 20, 1), 100);
  const search = typeof query.search === 'string' ? query.search.trim() : '';

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search,
  };
}
