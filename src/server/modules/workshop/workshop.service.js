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
  timeEntries(id) {
    if (!this.repository.job(id)) fail('Job card not found.', 'JOB_CARD_NOT_FOUND', 404);
    const now = Date.now();
    return this.repository.timeEntries(id).map((entry) => ({
      ...entry,
      elapsedMinutes: Math.max(
        0,
        ((entry.stopped_at ? Date.parse(entry.stopped_at) : now) - Date.parse(entry.started_at)) /
          60000,
      ),
    }));
  }
  startTimer(id, payload = {}, actor) {
    return this.repository.transaction(() => {
      this.activeJob(id);
      const technicianId = Number(payload.technicianId);
      if (!Number.isSafeInteger(technicianId) || !this.repository.technician(technicianId))
        fail('Choose an active mechanic.');
      if (this.repository.runningTimer(technicianId))
        fail(
          'This mechanic already has a running timer. Stop it first.',
          'TIMER_ALREADY_RUNNING',
          409,
        );
      if (
        payload.notes !== undefined &&
        (typeof payload.notes !== 'string' || payload.notes.length > 1000)
      )
        fail('Notes must be text up to 1000 characters.');
      return this.repository.startTimer(id, technicianId, payload.notes?.trim() || '', actor);
    });
  }
  stopTimer(id, actor) {
    return this.repository.transaction(() => {
      const entry = this.repository.timeEntry(id);
      if (!entry) fail('Timer not found.', 'TIMER_NOT_FOUND', 404);
      if (entry.stopped_at) fail('This timer is already stopped.', 'TIMER_ALREADY_STOPPED', 409);
      if (Date.now() < Date.parse(entry.started_at))
        fail(
          'The laptop clock is earlier than the timer start. Correct the clock before stopping.',
          'TIMER_CLOCK_INVALID',
          409,
        );
      return this.repository.stopTimer(id, actor);
    });
  }
  history(id) {
    if (!Number.isSafeInteger(id) || id < 1) fail('Invalid job card ID.');
    if (!this.repository.job(id)) fail('Job card not found.', 'JOB_CARD_NOT_FOUND', 404);
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
