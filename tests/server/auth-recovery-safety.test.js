import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { runMigrations } from '../../src/server/database/migration-runner.js';
import { runSeeds } from '../../src/server/database/seed-runner.js';
import { AuthRepository } from '../../src/server/modules/auth/auth.repository.js';
import { AuthService } from '../../src/server/modules/auth/auth.service.js';
import { hashToken } from '../../src/server/shared/utils/tokens.js';

async function recoveryContext() {
  const db = new Database(':memory:');
  runMigrations(db);
  await runSeeds(db);
  const repository = new AuthRepository(db);
  const code = 'GOLDY-TEST-ABCD-EFGH-IJKL';
  const passwordHash = await bcrypt.hash('OriginalPassword1', 4);
  const id = repository.createAdmin({
    username: 'owner',
    passwordHash,
    recoveryCodeHash: await bcrypt.hash(code, 4),
  });
  repository.createSession({
    userId: id,
    tokenHash: hashToken('previous-session'),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  return { db, repository, service: new AuthService(repository), code, id, passwordHash };
}

test('password recovery returns the displayed code and revokes previous sessions', async () => {
  const context = await recoveryContext();
  try {
    const result = await context.service.forgotPassword({
      username: 'owner',
      recoveryCode: context.code,
      newPassword: 'ReplacementPassword1',
    });
    assert.ok(result.recoveryCode, 'reset must use the same response field as onboarding');
    assert.equal(result.recoveryCode, result.newRecoveryCode, 'retain the static page contract');
    assert.equal(context.service.getUserByToken('previous-session'), null);
    assert.equal(
      (
        await context.service.forgotPassword({
          username: 'owner',
          recoveryCode: result.recoveryCode,
        })
      ).valid,
      true,
    );
  } finally {
    context.db.close();
  }
});

test('session revocation failure rolls back the password and recovery code change', async () => {
  const context = await recoveryContext();
  try {
    const originalCodeHash = context.repository.findUserByUsername('owner').recovery_code_hash;
    context.db.exec(`CREATE TRIGGER reject_session_revocation BEFORE UPDATE ON user_sessions
      BEGIN SELECT RAISE(ABORT, 'simulated session failure'); END`);
    assert.throws(
      () => context.repository.resetPassword(context.id, 'replacement-hash', 'replacement-code'),
      /simulated session failure/,
    );
    assert.equal(context.repository.findUserById(context.id).recovery_code_hash, originalCodeHash);
    assert.equal(
      context.repository.findUserByUsername('owner').password_hash,
      context.passwordHash,
    );
    assert.ok(context.service.getUserByToken('previous-session'));
  } finally {
    context.db.close();
  }
});
