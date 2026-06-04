function columnsSql(columns) {
  return columns.join(', ');
}

function searchWhere(config, search) {
  if (!search) {
    return { clause: '', params: [] };
  }

  const clause = config.searchableColumns
    .map((column) => `${column} LIKE ? COLLATE NOCASE`)
    .join(' OR ');

  return {
    clause: `WHERE ${clause}`,
    params: config.searchableColumns.map(() => `%${search}%`),
  };
}

export class MasterRepository {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }

  list({ search, pageSize, offset }) {
    const { clause, params } = searchWhere(this.config, search);
    const rows = this.db.prepare(`
      SELECT ${columnsSql(this.config.listColumns)}
      FROM ${this.config.table}
      ${clause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM ${this.config.table}
      ${clause}
    `).get(...params).count;

    return { rows, total };
  }

  findById(id) {
    return this.db.prepare(`
      SELECT ${columnsSql(this.config.listColumns)}
      FROM ${this.config.table}
      WHERE id = ?
    `).get(id);
  }

  exists(table, id) {
    return Boolean(this.db.prepare(`
      SELECT id
      FROM ${table}
      WHERE id = ?
    `).get(id));
  }

  create(data) {
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const result = this.db.prepare(`
      INSERT INTO ${this.config.table} (${columns.join(', ')})
      VALUES (${placeholders})
    `).run(...columns.map((column) => data[column]));

    return this.findById(result.lastInsertRowid);
  }

  update(id, data) {
    const columns = Object.keys(data);
    const setClause = columns.map((column) => `${column} = ?`).join(', ');

    this.db.prepare(`
      UPDATE ${this.config.table}
      SET ${setClause},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(...columns.map((column) => data[column]), id);

    return this.findById(id);
  }

  delete(id) {
    return this.db.prepare(`
      DELETE FROM ${this.config.table}
      WHERE id = ?
    `).run(id).changes > 0;
  }
}
