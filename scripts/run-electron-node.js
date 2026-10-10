import { spawn } from 'node:child_process';
import electron from 'electron';

// Keep SQLite on one ABI for the desktop, backend tools, and integration tests.
const child = spawn(electron, process.argv.slice(2), {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
