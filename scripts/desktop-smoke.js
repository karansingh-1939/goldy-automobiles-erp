import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import electron from 'electron';

const project = fileURLToPath(new URL('../', import.meta.url));
const packaged = process.argv.includes('--packaged');
const executable = packaged
  ? path.join(project, 'release', 'win-unpacked', 'GOLDY AUTOMOBILE ERP.exe')
  : electron;
if (!fs.existsSync(executable))
  throw new Error('Build the requested desktop runtime before smoke testing.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsm-'));
const nonce = randomUUID();
fs.writeFileSync(path.join(root, '.goldy-smoke'), nonce, { flag: 'wx' });
fs.mkdirSync(path.join(root, 'data'));
fs.mkdirSync(path.join(root, 'app'));
const childEnv = {
  ...process.env,
  GOLDY_SMOKE: '1',
  GOLDY_SMOKE_ROOT: root,
  GOLDY_SMOKE_NONCE: nonce,
  APPDATA_PATH: path.join(root, 'app'),
  DATABASE_PATH: path.join(root, 'data', 'a.db'),
  PORT: '0',
  OPEN_DEVTOOLS: 'false',
};
delete childEnv.ELECTRON_RUN_AS_NODE;
delete childEnv.DB_FILE;
delete childEnv.ADMIN_DEFAULT_PASSWORD;
if (process.argv.includes('--screenshots'))
  childEnv.GOLDY_SMOKE_SCREENSHOTS = path.join(project, 'docs', 'images');
else delete childEnv.GOLDY_SMOKE_SCREENSHOTS;

const child = spawn(executable, packaged ? [] : ['.'], {
  cwd: project,
  env: childEnv,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let finished = false;
let passed = false;
let pendingOutput = '';
// Only the harness's fixed step messages are published; no credentials, logs or HTTP bodies.
child.stdout.on('data', (data) => {
  pendingOutput += data.toString();
  const lines = pendingOutput.split(/\r?\n/);
  pendingOutput = lines.pop();
  for (const line of lines) {
    if (/^SMOKE (PASS|FAIL): [a-zA-Z0-9 ,/-]+$/.test(line)) console.log(line);
    if (line === 'SMOKE PASS: renderer runtime checks') passed = true;
  }
});
child.stderr.on('data', (data) => {
  const message = data.toString();
  for (const category of [
    'Missing enabled action',
    'Missing form input',
    'Timed out at',
    'Synthetic API seed',
    'Confirmed order did not reserve stock',
    'Sales order did not persist',
    'Renderer runtime errors',
  ]) {
    if (message.includes(category)) console.error(`Desktop smoke diagnostic: ${category}.`);
  }
});
const timeout = setTimeout(() => {
  console.error('Desktop smoke exceeded its 110 second deadline.');
  child.kill();
}, 110000);
function finish(code) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    fs.readFileSync(path.join(root, '.goldy-smoke'), 'utf8') !== nonce
  )
    throw new Error('Smoke cleanup ownership check failed.');
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  process.exitCode = code === 0 && passed ? 0 : 1;
  if (process.exitCode) console.error('Desktop smoke failed; synthetic workspace was removed.');
}
child.on('error', () => finish(1));
child.on('close', finish);
