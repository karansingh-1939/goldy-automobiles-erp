import { AuditRepository } from './audit.repository.js';

export class AuditService {
  constructor(auditRepository) {
    this.auditRepository = auditRepository;
  }

  record(entry) {
    this.auditRepository.create(entry);
  }
}

export function createAuditService(db) {
  return new AuditService(new AuditRepository(db));
}
