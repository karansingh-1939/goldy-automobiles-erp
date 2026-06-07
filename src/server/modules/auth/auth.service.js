import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import { generateToken, hashToken } from '../../shared/utils/tokens.js';

function publicUser(user, permissions) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: {
      id: user.role_id,
      name: user.role_name,
    },
    permissions,
  };
}

export class AuthService {
  constructor(authRepository) {
    this.authRepository = authRepository;
  }

  async login({ username, password }) {
    if (!username || !password) {
      throw new AppError('Username and password are required.', 400, 'LOGIN_FIELDS_REQUIRED');
    }

    const user = this.authRepository.findUserByUsername(username.trim());

    if (!user || !user.is_active) {
      throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + env.sessionTtlHours * 60 * 60 * 1000).toISOString();

    this.authRepository.pruneExpiredSessions(new Date().toISOString());
    this.authRepository.createSession({ userId: user.id, tokenHash, expiresAt });
    this.authRepository.updateLastLogin(user.id);

    const permissions = this.authRepository.getPermissionsForRole(user.role_id);

    return {
      token,
      expiresAt,
      user: publicUser(user, permissions),
    };
  }

  logout(token) {
    if (!token) {
      throw new AppError('Authentication token is required.', 401, 'AUTH_TOKEN_REQUIRED');
    }

    return this.authRepository.revokeSession(hashToken(token));
  }

  getUserByToken(token) {
    const now = new Date().toISOString();
    const session = this.authRepository.findActiveSessionByTokenHash(hashToken(token), now);

    if (!session) {
      return null;
    }

    const user = this.authRepository.findUserById(session.user_id);

    if (!user || !user.is_active) {
      return null;
    }

    const permissions = this.authRepository.getPermissionsForRole(user.role_id);
    return publicUser(user, permissions);
  }
}
