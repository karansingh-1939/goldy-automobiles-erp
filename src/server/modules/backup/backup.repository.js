export class BackupRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  findById(id) {
    return this.db
      .prepare(
        `
      SELECT backup_logs.*, users.name AS created_by_name
      FROM backup_logs
      LEFT JOIN users ON users.id = backup_logs.created_by
      WHERE backup_logs.id = ?
    `,
      )
      .get(id);
  }

  createBackupLog(data) {
    const result = this.db
      .prepare(
        `
      INSERT INTO backup_logs (
        filename,
        filepath,
        type,
        file_size,
        status,
        error_message,
        created_by
      )
      VALUES (
        @filename,
        @filepath,
        @type,
        @file_size,
        @status,
        @error_message,
        @created_by
      )
    `,
      )
      .run({
        filename: data.filename,
        filepath: data.filepath,
        type: data.type,
        file_size: data.file_size !== undefined ? data.file_size : null,
        status: data.status || 'PENDING',
        error_message: data.error_message || null,
        created_by: data.created_by || null,
      });

    return this.findById(result.lastInsertRowid);
  }

  updateBackupLogStatus(id, status, details = {}) {
    this.db
      .prepare(
        `
      UPDATE backup_logs
      SET status = @status,
          file_size = COALESCE(@file_size, file_size),
          error_message = COALESCE(@error_message, error_message),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `,
      )
      .run({
        id,
        status,
        file_size: details.file_size !== undefined ? details.file_size : null,
        error_message: details.error_message !== undefined ? details.error_message : null,
      });

    return this.findById(id);
  }

  getBackupLogs(limit = 50, offset = 0) {
    return this.db
      .prepare(
        `
      SELECT backup_logs.*, users.name AS created_by_name
      FROM backup_logs
      LEFT JOIN users ON users.id = backup_logs.created_by
      ORDER BY backup_logs.id DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(limit, offset);
  }

  getLatestSuccessfulBackup() {
    return this.db
      .prepare(
        `
      SELECT backup_logs.*, users.name AS created_by_name
      FROM backup_logs
      LEFT JOIN users ON users.id = backup_logs.created_by
      WHERE backup_logs.status = 'SUCCESS'
      ORDER BY backup_logs.id DESC
      LIMIT 1
    `,
      )
      .get();
  }

  getSchedulerSettings() {
    const rows = this.db
      .prepare(
        `
      SELECT key, value FROM system_settings WHERE key LIKE 'backup.%'
    `,
      )
      .all();

    const settings = {};
    for (const row of rows) {
      let val = row.value;
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);
      settings[row.key] = val;
    }
    return settings;
  }

  updateSchedulerSettings(settings) {
    const upsert = this.db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (@key, @value, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    this.transaction(() => {
      for (const [key, val] of Object.entries(settings)) {
        if (!key.startsWith('backup.')) continue;
        upsert.run({ key: key, value: String(val) });
      }
    });

    return this.getSchedulerSettings();
  }

  updateLastRunAt(timestamp) {
    this.db
      .prepare(
        `
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('backup.last_run_at', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
      )
      .run(String(timestamp));
  }

  getUnpurgedSuccessfulAutoBackups() {
    return this.db
      .prepare(
        `
      SELECT * FROM backup_logs
      WHERE type = 'AUTO' AND status = 'SUCCESS' AND purged = 0
      ORDER BY id DESC
    `,
      )
      .all();
  }

  markBackupAsPurged(id) {
    this.db
      .prepare(
        `
      UPDATE backup_logs
      SET purged = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      )
      .run(id);
    return this.findById(id);
  }
}
