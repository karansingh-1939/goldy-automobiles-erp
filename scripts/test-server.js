import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('../', import.meta.url));
const testDir = path.join(root, 'tests/server');
const files = fs
  .readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-tests-'));
const child = spawn(
  electron,
  [
    '--test',
    '--test-concurrency=2',
    '--test-reporter=spec',
    ...process.argv.slice(2),
    ...files.map((file) => path.join(testDir, file)),
  ],
  {
    cwd: sandbox,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'test',
      DATABASE_PATH: path.join(sandbox, 'data/global.sqlite'),
      APPDATA_PATH: sandbox,
    },
    stdio: 'inherit',
    windowsHide: true,
  },
);
function finish(code) {
  if (path.dirname(sandbox) !== path.resolve(os.tmpdir())) throw new Error('Invalid test sandbox');
  fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 3 });
  process.exitCode = code ?? 1;
}
child.on('error', (error) => {
  console.error(error.message);
  finish(1);
});
child.on('exit', finish);
