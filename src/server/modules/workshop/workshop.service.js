import { AppError } from '../../shared/errors/app-error.js';
import { WorkshopRepository } from './workshop.repository.js';

function fail(message, code = 'VALIDATION_ERROR', status = 400) {
  throw new AppError(message, status, code);
}
function text(value, label, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    fail(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}

export class WorkshopService {
  constructor(db) {
    this.repository = new WorkshopRepository(db);
  }
  activeJob(id) {
    if (!Number.isSafeInteger(id) || id < 1) fail('Invalid job card ID.');
    const job = this.repository.job(id);
    if (!job) fail('Job card not found.', 'JOB_CARD_NOT_FOUND', 404);
    if (!['DRAFT', 'IN_PROGRESS'].includes(job.status))
      fail('This job card is closed.', 'JOB_CARD_CLOSED', 409);
    return job;
  }
  queue() {
    return this.repository.queue();
  }
  history(id) {
    this.activeJob(id);
    return this.repository.history(id);
  }
  delivery(id, payload = {}) {
    this.activeJob(id);
    const value = payload.promisedAt;
    if (
      value !== null &&
      (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).getDate() !== Number(value.slice(8, 10)))
    )
      fail('Promised delivery must be a valid local date and time.');
    return this.repository.delivery(id, value);
  }
  requestEstimate(id, payload = {}, actor) {
    return this.repository.transaction(() => {
      this.activeJob(id);
      const amount = Number(payload.amount);
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 100000000 ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001
      )
        fail('Estimate amount must be positive with at most two decimal places.');
      return this.repository.requestEstimate(id, amount, text(payload.scope, 'Work scope'), actor);
    });
  }
  decide(id, payload = {}, actor) {
    return this.repository.transaction(() => {
      const estimate = this.repository.estimate(id);
      if (!estimate) fail('Estimate not found.', 'ESTIMATE_NOT_FOUND', 404);
      this.activeJob(estimate.job_card_id);
      if (
        estimate.status !== 'REQUESTED' ||
        this.repository.latestEstimate(estimate.job_card_id).id !== id
      )
        fail('This estimate is no longer awaiting a decision.', 'ESTIMATE_ALREADY_DECIDED', 409);
      if (
        !['APPROVED', 'REJECTED'].includes(payload.status) ||
        !['PHONE', 'IN_PERSON', 'MESSAGE'].includes(payload.method)
      )
        fail('Choose an approval decision and contact method.');
      return this.repository.decide(
        id,
        {
          status: payload.status,
          contactName: text(payload.contactName, 'Customer contact', 120),
          method: payload.method,
          notes: text(payload.notes, 'Decision notes'),
        },
        actor,
      );
    });
  }
}
