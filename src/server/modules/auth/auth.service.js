import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';
import { generateToken, hashToken } from '../../shared/utils/tokens.js';

function getSetupDir(db) {
  return path.join(path.dirname(db.name), 'setup');
}

export function saveRecoveryCode(db, code) {
  const setupDir = getSetupDir(db);
  if (!fs.existsSync(setupDir)) {
    fs.mkdirSync(setupDir, { recursive: true });
  }
  const filePath = path.join(setupDir, 'recovery-code.txt');
  fs.writeFileSync(filePath, code, 'utf8');
}

export function deleteRecoveryCode(db) {
  const setupDir = getSetupDir(db);
  const filePath = path.join(setupDir, 'recovery-code.txt');
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      // Ignore if cannot delete
    }
  }
}

function generateRecoveryCode() {
  const bytes = crypto.randomBytes(16);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomStr = '';
  for (let i = 0; i < bytes.length; i++) {
    randomStr += chars[bytes[i] % chars.length];
  }
  return `GOLDY-${randomStr.slice(0, 4)}-${randomStr.slice(4, 8)}-${randomStr.slice(8, 12)}-${randomStr.slice(12, 16)}`;
}

function publicUser(user, permissions) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email || null,
    role: {
      id: user.role_id,
      name: user.role_name,
    },
    permissions,
  };
}

function validatePasswordComplexity(password) {
  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters long.', 400, 'PASSWORD_TOO_SHORT');
  }
  if (!/[A-Z]/.test(password)) {
    throw new AppError(
      'Password must contain at least one uppercase letter.',
      400,
      'PASSWORD_MISSING_UPPERCASE',
    );
  }
  if (!/[a-z]/.test(password)) {
    throw new AppError(
      'Password must contain at least one lowercase letter.',
      400,
      'PASSWORD_MISSING_LOWERCASE',
    );
  }
  if (!/[0-9]/.test(password)) {
    throw new AppError(
      'Password must contain at least one numeric digit.',
      400,
      'PASSWORD_MISSING_DIGIT',
    );
  }
}

function verifyLockout(user) {
  if (user.lockedUntil) {
    const lockTime = new Date(user.lockedUntil).getTime();
    const now = Date.now();
    if (lockTime > now) {
      const remainingMinutes = Math.ceil((lockTime - now) / (1000 * 60));
      throw new AppError(
        `Account is temporarily locked. Try again in ${remainingMinutes} minutes.`,
        429,
        'ACCOUNT_LOCKED',
      );
    }
  }
}

export class AuthService {
  constructor(authRepository) {
    this.authRepository = authRepository;
  }

  getSetupStatus() {
    const setupCompleted = this.authRepository.hasAdmin();
    return { setupCompleted };
  }

  async setupAdmin({ username, password, email }) {
    if (this.authRepository.hasAdmin()) {
      throw new AppError(
        'Initial administrator setup has already been completed.',
        400,
        'SETUP_ALREADY_COMPLETED',
      );
    }

    if (!username || !username.trim()) {
      throw new AppError('Username is required.', 400, 'USERNAME_REQUIRED');
    }

    validatePasswordComplexity(password);

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('Email must be valid.', 400, 'INVALID_EMAIL');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = await bcrypt.hash(recoveryCode, 12);

    const userId = this.authRepository.createAdmin({
      username: username.trim(),
      passwordHash,
      email: email ? email.trim() : null,
      recoveryCodeHash,
    });

    saveRecoveryCode(this.authRepository.db, recoveryCode);

    return {
      userId,
      recoveryCode,
    };
  }

  async login({ username, password }) {
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new AppError('Username and password must be text.', 400, 'LOGIN_FIELDS_INVALID_TYPE');
    }

    if (!username.trim() || !password) {
      throw new AppError('Username and password are required.', 400, 'LOGIN_FIELDS_REQUIRED');
    }

    const user = this.authRepository.findUserByUsername(username.trim());

    if (!user || !user.is_active) {
      throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
    }

    verifyLockout(user);

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      const newAttempts = (user.failedLoginAttempts || 0) + 1;
      this.authRepository.incrementFailedAttempts(user.id);

      if (newAttempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        this.authRepository.lockUserAccount(user.id, lockUntil);
        throw new AppError(
          'Too many failed login attempts. Account locked for 15 minutes.',
          429,
          'ACCOUNT_LOCKED',
        );
      }

      throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
    }

    this.authRepository.resetFailedAttempts(user.id);
    deleteRecoveryCode(this.authRepository.db);

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

  async forgotPassword({ username, recoveryCode, newPassword }) {
    if (!username || !username.trim() || !recoveryCode || !recoveryCode.trim()) {
      throw new AppError(
        'Username and recovery code are required.',
        400,
        'RECOVERY_FIELDS_REQUIRED',
      );
    }

    const user = this.authRepository.findUserByUsername(username.trim());
    if (!user || !user.is_active) {
      throw new AppError('Invalid username or recovery code.', 401, 'INVALID_RECOVERY');
    }

    verifyLockout(user);

    if (!user.recovery_code_hash) {
      throw new AppError('No recovery code set for this user.', 400, 'NO_RECOVERY_CODE');
    }

    const recoveryMatches = await bcrypt.compare(recoveryCode.trim(), user.recovery_code_hash);
    if (!recoveryMatches) {
      const newAttempts = (user.failedLoginAttempts || 0) + 1;
      this.authRepository.incrementFailedAttempts(user.id);

      if (newAttempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        this.authRepository.lockUserAccount(user.id, lockUntil);
        throw new AppError(
          'Too many failed attempts. Account locked for 15 minutes.',
          429,
          'ACCOUNT_LOCKED',
        );
      }

      throw new AppError('Invalid username or recovery code.', 401, 'INVALID_RECOVERY');
    }

    if (!newPassword) {
      return { valid: true };
    }

    validatePasswordComplexity(newPassword);

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const newRecoveryCode = generateRecoveryCode();
    const newRecoveryCodeHash = await bcrypt.hash(newRecoveryCode, 12);

    this.authRepository.resetPassword(user.id, passwordHash, newRecoveryCodeHash);
    deleteRecoveryCode(this.authRepository.db);

    return {
      success: true,
      newRecoveryCode,
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
