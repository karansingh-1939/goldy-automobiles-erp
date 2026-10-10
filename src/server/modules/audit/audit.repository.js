export class AuditRepository {
  constructor(db) {
    this.db = db;
  }

  create({ userId, action, entityType, entityId, oldValue, newValue }) {
    this.db
      .prepare(
        `
      INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        old_value_json,
        new_value_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        userId || null,
        action,
        entityType,
        entityId || null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
      );
  }

  list(filters = {}) {
    const clauses = [];
    const params = {};

    if (filters.entityType) {
      clauses.push('audit_logs.entity_type = @entityType');
      params.entityType = filters.entityType;
    }

    if (filters.action) {
      clauses.push('audit_logs.action = @action');
      params.action = filters.action;
    }

    if (filters.userId) {
      clauses.push('audit_logs.user_id = @userId');
      params.userId = filters.userId;
    }

    if (filters.dateFrom) {
      clauses.push('DATE(audit_logs.created_at) >= DATE(@dateFrom)');
      params.dateFrom = filters.dateFrom;
    }

    if (filters.dateTo) {
      clauses.push('DATE(audit_logs.created_at) <= DATE(@dateTo)');
      params.dateTo = filters.dateTo;
    }

    if (filters.search) {
      clauses.push(
        '(audit_logs.action LIKE @search OR audit_logs.entity_type LIKE @search OR users.name LIKE @search OR users.username LIKE @search)',
      );
      params.search = `%${filters.search}%`;
    }

    const clause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const pageSize = Number(filters.pageSize) || 50;
    const offset = Number(filters.offset) || 0;

    const data = this.db
      .prepare(
        `
      SELECT
        audit_logs.id,
        audit_logs.user_id,
        audit_logs.action,
        audit_logs.entity_type,
        audit_logs.entity_id,
        audit_logs.old_value_json,
        audit_logs.new_value_json,
        audit_logs.created_at,
        users.name AS user_name,
        users.username AS user_username
      FROM audit_logs
      LEFT JOIN users ON users.id = audit_logs.user_id
      ${clause}
      ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
      LIMIT @pageSize OFFSET @offset
    `,
      )
      .all({ ...params, pageSize, offset });

    const total = this.db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM audit_logs
      LEFT JOIN users ON users.id = audit_logs.user_id
      ${clause}
    `,
      )
      .get(params).count;

    return {
      data: data.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        userUsername: row.user_username,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        oldValue: row.old_value_json ? JSON.parse(row.old_value_json) : null,
        newValue: row.new_value_json ? JSON.parse(row.new_value_json) : null,
        createdAt: row.created_at,
      })),
      total,
    };
  }
}
