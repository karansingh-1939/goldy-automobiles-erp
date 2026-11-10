import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { localHostGuard } from '../../src/server/shared/middleware/local-host-guard.js';

function requestWithHost(port, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/v1/auth/setup-status', headers: { host } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('local API refuses requests addressed to non-loopback hosts (DNS rebinding)', async () => {
  const app = express();
  app.use(localHostGuard());
  app.get('/api/v1/auth/setup-status', (req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();
  try {
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, 'LOCALHOST']) {
      assert.equal((await requestWithHost(port, host)).status, 200, host);
    }
    for (const host of [
      `evil.example:${port}`,
      'evil.example',
      `127.0.0.1.evil.example:${port}`,
      `localhost.evil.example:${port}`,
    ]) {
      const result = await requestWithHost(port, host);
      assert.equal(result.status, 403, host);
      assert.match(result.body, /HOST_NOT_ALLOWED/);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
