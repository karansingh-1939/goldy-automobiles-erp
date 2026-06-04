export class AuditRepository {
  constructor(db) {
    this.db = db;
  }

  create({ userId, action, entityType, entityId, oldValue, newValue }) {
    this.db.prepare(`
      INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        old_value_json,
        new_value_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId || null,
      action,
      entityType,
      entityId || null,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
    );
  }
}
