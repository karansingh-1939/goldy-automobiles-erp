export class AuthRepository {
  constructor(db) {
    this.db = db;
  }

  findUserByUsername(username) {
    return this.db.prepare(`
      SELECT
        users.id,
        users.name,
        users.username,
        users.password_hash,
        users.role_id,
        users.is_active,
        roles.name AS role_name
      FROM users
      JOIN roles ON roles.id = users.role_id
      WHERE users.username = ?
    `).get(username);
  }

  findUserById(userId) {
    return this.db.prepare(`
      SELECT
        users.id,
        users.name,
        users.username,
        users.role_id,
        users.is_active,
        roles.name AS role_name
      FROM users
      JOIN roles ON roles.id = users.role_id
      WHERE users.id = ?
    `).get(userId);
  }

  getPermissionsForRole(roleId) {
    return this.db.prepare(`
      SELECT permissions.key
      FROM role_permissions
      JOIN permissions ON permissions.id = role_permissions.permission_id
      WHERE role_permissions.role_id = ?
      ORDER BY permissions.key
    `).all(roleId).map((row) => row.key);
  }

  updateLastLogin(userId) {
    this.db.prepare(`
      UPDATE users
      SET last_login_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);
  }

  createSession({ userId, tokenHash, expiresAt }) {
    this.db.prepare(`
      INSERT INTO user_sessions (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(userId, tokenHash, expiresAt);
  }

  findActiveSessionByTokenHash(tokenHash, now) {
    return this.db.prepare(`
      SELECT id, user_id, expires_at
      FROM user_sessions
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > ?
    `).get(tokenHash, now);
  }

  revokeSession(tokenHash) {
    const result = this.db.prepare(`
      UPDATE user_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = ?
        AND revoked_at IS NULL
    `).run(tokenHash);

    return result.changes > 0;
  }

  pruneExpiredSessions(now) {
    this.db.prepare(`
      DELETE FROM user_sessions
      WHERE expires_at <= ?
         OR revoked_at IS NOT NULL
    `).run(now);
  }
}
