import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Repository safety gate. The repository is public and must contain code
 * only: workshop databases, backups, customer documents and secret keys
 * belong on the workshop laptop, never in git.
 */

const forbiddenPathRules = [
  { pattern: /\.(sqlite3?|db)(-wal|-shm|-journal)?$/i, reason: 'database file' },
  {
    pattern: /(^|\/)(data|backups|Tax_Invoices|job_cards)\//,
    reason: 'private workshop data folder',
  },
  { pattern: /(^|\/)\.env(\.(?!example$)[^/]+)?$/, reason: 'environment file with local secrets' },
  { pattern: /\.(pem|key|pfx|p12)$/i, reason: 'private key or certificate' },
];

const secretRules = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, reason: 'private key block' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, reason: 'GitHub token' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/, reason: 'GitHub token' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, reason: 'AWS access key' },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/, reason: 'Google API key' },
  { pattern: /\brzp_live_[A-Za-z0-9]{10,}\b/, reason: 'Razorpay live key' },
  { pattern: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/, reason: 'Stripe live key' },
  { pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, reason: 'Slack token' },
  { pattern: /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{32,}\b/, reason: 'AI service API key' },
];

const maxScannedBytes = 2 * 1024 * 1024;

export function findPathProblem(file) {
  const normalized = file.replaceAll('\\', '/');
  return forbiddenPathRules.find((rule) => rule.pattern.test(normalized))?.reason ?? null;
}

export function findSecretProblems(text) {
  const problems = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const rule of secretRules) {
      if (rule.pattern.test(line)) problems.push({ line: index + 1, reason: rule.reason });
    }
  });
  return problems;
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

export function scanRepository(root) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  // Tracked files plus new files git would pick up, so mistakes are caught before a commit.
  const files = new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard'));
  const problems = [];
  for (const file of git('ls-files', '-z', '--cached', '--ignored', '--exclude-standard')) {
    problems.push(`${file}: tracked even though .gitignore excludes it`);
  }
  for (const file of files) {
    const pathProblem = findPathProblem(file);
    if (pathProblem) problems.push(`${file}: ${pathProblem}`);
    const fullPath = path.join(root, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue; // deleted in the working tree
    }
    if (!stat.isFile() || stat.size > maxScannedBytes) continue;
    const buffer = fs.readFileSync(fullPath);
    if (isBinary(buffer)) continue;
    for (const { line, reason } of findSecretProblems(buffer.toString('utf8'))) {
      problems.push(`${file}:${line}: possible ${reason}`);
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const problems = scanRepository(root);
  if (problems.length) {
    console.error('Repository safety check failed. These must not be committed:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('Keep workshop data on the laptop and secrets in .env or app Settings.');
    process.exitCode = 1;
  } else {
    console.log('Repository safety check passed: no data files or secrets found.');
  }
}
