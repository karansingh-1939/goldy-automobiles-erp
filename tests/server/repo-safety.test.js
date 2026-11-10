import assert from 'node:assert/strict';
import test from 'node:test';
import { findPathProblem, findSecretProblems } from '../../scripts/check-repo-safety.js';

test('repository safety check rejects workshop data and secret files', () => {
  for (const file of [
    'data/goldy.sqlite',
    'goldy_erp.db',
    'goldy_erp.db-wal',
    'backups/2026-11-10/snapshot.json',
    'Tax_Invoices/INV-001.pdf',
    '.env',
    '.env.production',
    'certs/signing.pfx',
  ]) {
    assert.ok(findPathProblem(file), file);
  }
  for (const file of ['.env.example', 'src/server/app.js', 'docs/database.md']) {
    assert.equal(findPathProblem(file), null, file);
  }
});

test('repository safety check detects secret key formats without flagging ordinary code', () => {
  // Built by concatenation so this test file itself never contains a real-looking key.
  const samples = [
    '-----BEGIN RSA ' + 'PRIVATE KEY-----',
    'token = "ghp_' + 'a'.repeat(36) + '"',
    'RAZORPAY_KEY=rzp_' + 'live_' + 'Ab12Cd34Ef56Gh',
    'stripe: sk_' + 'live_' + 'x'.repeat(24),
    'aws=AKIA' + 'ABCDEFGHIJKLMNOP',
  ];
  for (const sample of samples) assert.equal(findSecretProblems(sample).length, 1, sample);
  assert.deepEqual(
    findSecretProblems('const key = process.env.RAZORPAY_KEY;\nconst test = "rzp_test_abc";'),
    [],
  );
});
