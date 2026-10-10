import { AuditRepository } from './audit.repository.js';

export class AuditService {
  constructor(auditRepository) {
    this.auditRepository = auditRepository;
  }

  record(entry) {
    this.auditRepository.create(entry);
  }

  list(filters) {
    return this.auditRepository.list(filters);
  }
}

export function createAuditService(db) {
  return new AuditService(new AuditRepository(db));
}
