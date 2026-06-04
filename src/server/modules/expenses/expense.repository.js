function whereClause(filters) {
  const clauses = [];
  const params = {};

  if (filters.category) {
    clauses.push('expenses.category = @category');
    params.category = filters.category;
  }

  if (filters.dateFrom) {
    clauses.push('DATE(expenses.expense_date) >= DATE(@dateFrom)');
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    clauses.push('DATE(expenses.expense_date) <= DATE(@dateTo)');
    params.dateTo = filters.dateTo;
  }

  return {
    clause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export class ExpenseRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  list(filters) {
    const { clause, params } = whereClause(filters);
    const data = this.db.prepare(`
      SELECT
        expenses.*,
        users.name AS created_by_name
      FROM expenses
      LEFT JOIN users ON users.id = expenses.created_by
      ${clause}
      ORDER BY expenses.expense_date DESC, expenses.id DESC
      LIMIT @pageSize OFFSET @offset
    `).all({ ...params, pageSize: filters.pageSize, offset: filters.offset });

    const total = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM expenses
      ${clause}
    `).get(params).count;

    return { data, total };
  }

  findById(id) {
    return this.db.prepare(`
      SELECT
        expenses.*,
        users.name AS created_by_name
      FROM expenses
      LEFT JOIN users ON users.id = expenses.created_by
      WHERE expenses.id = ?
    `).get(id);
  }

  create(data) {
    const result = this.db.prepare(`
      INSERT INTO expenses (
        expense_date,
        category,
        amount,
        description,
        created_by
      )
      VALUES (
        @expense_date,
        @category,
        @amount,
        @description,
        @created_by
      )
    `).run(data);

    return this.findById(result.lastInsertRowid);
  }

  update(id, data) {
    const columns = Object.keys(data);
    const setClause = columns.map((column) => `${column} = @${column}`).join(', ');

    this.db.prepare(`
      UPDATE expenses
      SET ${setClause},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...data, id });

    return this.findById(id);
  }

  delete(id) {
    return this.db.prepare(`
      DELETE FROM expenses
      WHERE id = ?
    `).run(id).changes > 0;
  }
}
