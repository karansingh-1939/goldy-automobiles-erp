import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../database/connection.js';
import { runMigrations } from '../database/migrationRunner.js';
import { runSeeds } from '../database/seedRunner.js';
import { createApp } from '../app.js';
import { createTestContext } from './helpers.js';

test('admin can login and read the current user profile', async () => {
  const context = await createTestContext();

  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'Admin@12345',
      }),
    });

    assert.equal(login.response.status, 200);
    assert.ok(login.body.token);
    assert.equal(login.body.user.username, 'admin');
    assert.equal(login.body.user.role.name, 'Admin');
    assert.ok(login.body.user.permissions.includes('users.manage'));

    const me = await context.request('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${login.body.token}`,
      },
    });

    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.username, 'admin');
  } finally {
    await context.close();
  }
});

test('login rejects invalid credentials', async () => {
  const context = await createTestContext();

  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'wrong-password',
      }),
    });

    assert.equal(login.response.status, 401);
    assert.equal(login.body.error.code, 'INVALID_CREDENTIALS');
  } finally {
    await context.close();
  }
});

test('logout revokes the active session token', async () => {
  const context = await createTestContext();

  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'Admin@12345',
      }),
    });

    const token = login.body.token;

    const logout = await context.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(logout.response.status, 200);
    assert.equal(logout.body.success, true);

    const meAfterLogout = await context.request('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(meAfterLogout.response.status, 401);
    assert.equal(meAfterLogout.body.error.code, 'AUTH_TOKEN_INVALID');
  } finally {
    await context.close();
  }
});

async function createSetupTestContext() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-erp-setup-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  const db = createDatabase(dbPath);

  // Run migrations and seed roles/permissions, but do NOT insert the admin user
  runMigrations(db);
  await runSeeds(db);

  const app = createApp({ db });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();

  async function request(pathname, options = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    return { response, body };
  }

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { db, request, close, dbPath };
}

test('onboarding setup and login flows', async () => {
  const context = await createSetupTestContext();

  try {
    // 1. Initial setup-status check should be false
    const statusBefore = await context.request('/api/v1/auth/setup-status');
    assert.equal(statusBefore.response.status, 200);
    assert.equal(statusBefore.body.setupCompleted, false);

    // 2. Setup requires username and password validation
    const invalidSetup1 = await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: '',
        password: 'password',
      }),
    });
    assert.equal(invalidSetup1.response.status, 400);

    const invalidSetup2 = await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'shrt',
      }),
    });
    assert.equal(invalidSetup2.response.status, 400);

    const invalidSetup3 = await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'password123',
        email: 'invalid-email',
      }),
    });
    assert.equal(invalidSetup3.response.status, 400);

    // 3. Successful admin creation
    const validSetup = await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'SecurePassword123',
        email: 'admin@goldy.com',
      }),
    });
    assert.equal(validSetup.response.status, 201);
    assert.ok(validSetup.body.userId);
    assert.ok(validSetup.body.recoveryCode);
    assert.match(validSetup.body.recoveryCode, /^GOLDY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    // Verify recovery-code.txt exists in data/setup/
    const setupDir = path.join(path.dirname(context.dbPath), 'setup');
    const recoveryFilePath = path.join(setupDir, 'recovery-code.txt');
    assert.ok(fs.existsSync(recoveryFilePath));
    const savedCode = fs.readFileSync(recoveryFilePath, 'utf8');
    assert.equal(savedCode, validSetup.body.recoveryCode);

    // 4. Setup-status check should now return true
    const statusAfter = await context.request('/api/v1/auth/setup-status');
    assert.equal(statusAfter.response.status, 200);
    assert.equal(statusAfter.body.setupCompleted, true);

    // 5. Prevent duplicate setup
    const duplicateSetup = await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'anotheradmin',
        password: 'AnotherSecurePassword123',
      }),
    });
    assert.equal(duplicateSetup.response.status, 400);

    // 6. Successful login deletes recovery-code.txt
    const loginResponse = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'SecurePassword123',
      }),
    });
    assert.equal(loginResponse.response.status, 200);
    assert.ok(loginResponse.body.token);

    // Recovery code file should now be deleted!
    assert.ok(!fs.existsSync(recoveryFilePath));

  } finally {
    await context.close();
  }
});

test('password complexity validation constraints', async () => {
  const context = await createSetupTestContext();

  try {
    // Rejects password without uppercase
    const badPassword1 = await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'securepassword1', // no uppercase
      }),
    });
    assert.equal(badPassword1.response.status, 400);
    assert.equal(badPassword1.body.error.code, 'PASSWORD_MISSING_UPPERCASE');

    // Rejects password without lowercase
    const badPassword2 = await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'SECUREPASSWORD1', // no lowercase
      }),
    });
    assert.equal(badPassword2.response.status, 400);
    assert.equal(badPassword2.body.error.code, 'PASSWORD_MISSING_LOWERCASE');

    // Rejects password without number
    const badPassword3 = await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'SecurePassword', // no digit
      }),
    });
    assert.equal(badPassword3.response.status, 400);
    assert.equal(badPassword3.body.error.code, 'PASSWORD_MISSING_DIGIT');

  } finally {
    await context.close();
  }
});

test('login lockout and expiration protection', async () => {
  const context = await createSetupTestContext();

  try {
    // Setup admin first
    await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'SecurePassword123',
      }),
    });

    // Perform 4 failed login attempts
    for (let i = 0; i < 4; i++) {
      const failed = await context.request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: 'admin',
          password: 'wrong-password',
        }),
      });
      assert.equal(failed.response.status, 401);
    }

    // Verify database shows 4 attempts
    let userRow = context.db.prepare("SELECT failed_login_attempts, locked_until FROM users WHERE username = 'admin'").get();
    assert.equal(userRow.failed_login_attempts, 4);
    assert.equal(userRow.locked_until, null);

    // 5th failed login attempt should lock the account (status 429)
    const lockAttempt = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'wrong-password',
      }),
    });
    assert.equal(lockAttempt.response.status, 429);
    assert.equal(lockAttempt.body.error.code, 'ACCOUNT_LOCKED');

    userRow = context.db.prepare("SELECT failed_login_attempts, locked_until FROM users WHERE username = 'admin'").get();
    assert.equal(userRow.failed_login_attempts, 5);
    assert.ok(userRow.locked_until);

    // Any subsequent attempt (even with correct password) should be blocked immediately
    const blockedAttempt = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'SecurePassword123',
      }),
    });
    assert.equal(blockedAttempt.response.status, 429);
    assert.equal(blockedAttempt.body.error.code, 'ACCOUNT_LOCKED');

    // Simulate lockout expiration by updating locked_until to a past date
    context.db.prepare("UPDATE users SET locked_until = '2020-01-01T00:00:00.000Z' WHERE username = 'admin'").run();

    // Now login should succeed and reset failed attempts counter
    const successLogin = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'SecurePassword123',
      }),
    });
    assert.equal(successLogin.response.status, 200);

    userRow = context.db.prepare("SELECT failed_login_attempts, locked_until FROM users WHERE username = 'admin'").get();
    assert.equal(userRow.failed_login_attempts, 0);
    assert.equal(userRow.locked_until, null);

  } finally {
    await context.close();
  }
});

test('forgot-password recovery, password validation and code rotation flow', async () => {
  const context = await createSetupTestContext();

  try {
    // Setup admin
    const setupRes = await context.request('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'SecurePassword123',
      }),
    });
    const firstRecoveryCode = setupRes.body.recoveryCode;

    // 1. Verify invalid recovery code rejects
    const invalidCodeRes = await context.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        recoveryCode: 'GOLDY-WRONG-CODE-1234',
      }),
    });
    assert.equal(invalidCodeRes.response.status, 401);
    assert.equal(invalidCodeRes.body.error.code, 'INVALID_RECOVERY');

    // 2. Verify valid recovery code without password returns valid true
    const validCodeRes = await context.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        recoveryCode: firstRecoveryCode,
      }),
    });
    assert.equal(validCodeRes.response.status, 200);
    assert.equal(validCodeRes.body.valid, true);

    // 3. Reset password with invalid password complexity rejects
    const invalidPassRes = await context.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        recoveryCode: firstRecoveryCode,
        newPassword: 'short',
      }),
    });
    assert.equal(invalidPassRes.response.status, 400);
    assert.equal(invalidPassRes.body.error.code, 'PASSWORD_TOO_SHORT');

    // 4. Successful password reset
    const resetRes = await context.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        recoveryCode: firstRecoveryCode,
        newPassword: 'NewSecurePassword789',
      }),
    });
    assert.equal(resetRes.response.status, 200);
    assert.ok(resetRes.body.success);
    assert.ok(resetRes.body.newRecoveryCode);

    const secondRecoveryCode = resetRes.body.newRecoveryCode;

    // 5. Old recovery code should no longer work
    const oldCodeRetry = await context.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        recoveryCode: firstRecoveryCode,
      }),
    });
    assert.equal(oldCodeRetry.response.status, 401);

    // 6. Login with old password should fail
    const oldLogin = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'SecurePassword123',
      }),
    });
    assert.equal(oldLogin.response.status, 401);

    // 7. Login with new password should succeed
    const newLogin = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'NewSecurePassword789',
      }),
    });
    assert.equal(newLogin.response.status, 200);

    // 8. Subsequent reset using the new rotated recovery code should work!
    const secondReset = await context.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin',
        recoveryCode: secondRecoveryCode,
        newPassword: 'FinalSecurePassword999',
      }),
    });
    assert.equal(secondReset.response.status, 200);
    assert.ok(secondReset.body.success);

  } finally {
    await context.close();
  }
});
