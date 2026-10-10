import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';

test('authenticated root requests keep the React shell', async () => {
  const context = await createTestContext();
  try {
    const login = await context.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
    });
    const result = await context.request('/', {
      redirect: 'manual',
      headers: { Cookie: `goldy_session_token=${login.body.token}` },
    });
    assert.equal(result.response.status, 200);
    assert.match(result.body, /id="root"/);
  } finally {
    await context.close();
  }
});
