import assert from 'node:assert/strict';
import test from 'node:test';
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
