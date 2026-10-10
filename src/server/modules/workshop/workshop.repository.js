export class WorkshopRepository {
  constructor(db) {
    this.db = db;
  }
  transaction(fn) {
    return this.db.transaction(fn)();
  }
  job(id) {
    return this.db.prepare('SELECT * FROM job_cards WHERE id = ?').get(id);
  }
  queue() {
    return this.db
      .prepare(
        `SELECT j.id, j.job_card_number, j.status, j.promised_delivery_at,
      c.name AS customer_name, v.registration_number, e.id AS estimate_id,
      e.amount AS estimate_amount, e.scope, e.status AS approval_status,
      e.contact_name, e.contact_method, e.decision_notes,
      CASE WHEN j.promised_delivery_at IS NOT NULL AND datetime(j.promised_delivery_at) < datetime('now', 'localtime') THEN 1 ELSE 0 END AS overdue
      FROM job_cards j JOIN customers c ON c.id = j.customer_id JOIN vehicles v ON v.id = j.vehicle_id
      LEFT JOIN estimate_approvals e ON e.id = (SELECT id FROM estimate_approvals WHERE job_card_id = j.id ORDER BY id DESC LIMIT 1)
      WHERE j.status IN ('DRAFT', 'IN_PROGRESS')
      ORDER BY j.promised_delivery_at IS NULL, j.promised_delivery_at, j.id`,
      )
      .all();
  }
  delivery(id, promisedAt) {
    this.db
      .prepare(
        'UPDATE job_cards SET promised_delivery_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      )
      .run(promisedAt, id);
    return this.job(id);
  }
  requestEstimate(jobId, amount, scope, actor) {
    this.db
      .prepare(
        "UPDATE estimate_approvals SET status = 'SUPERSEDED' WHERE job_card_id = ? AND status = 'REQUESTED'",
      )
      .run(jobId);
    const result = this.db
      .prepare(
        'INSERT INTO estimate_approvals (job_card_id, amount, scope, requested_by) VALUES (?, ?, ?, ?)',
      )
      .run(jobId, amount, scope, actor);
    return this.estimate(result.lastInsertRowid);
  }
  estimate(id) {
    return this.db.prepare('SELECT * FROM estimate_approvals WHERE id = ?').get(id);
  }
  latestEstimate(jobId) {
    return this.db
      .prepare('SELECT * FROM estimate_approvals WHERE job_card_id = ? ORDER BY id DESC LIMIT 1')
      .get(jobId);
  }
  history(jobId) {
    return this.db
      .prepare('SELECT * FROM estimate_approvals WHERE job_card_id = ? ORDER BY id DESC')
      .all(jobId);
  }
  decide(id, data, actor) {
    this.db
      .prepare(
        `UPDATE estimate_approvals SET status = ?, contact_name = ?, contact_method = ?, decision_notes = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .run(data.status, data.contactName, data.method, data.notes, actor, id);
    return this.estimate(id);
  }
}
