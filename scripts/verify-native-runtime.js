import { spawnSync } from 'node:child_process';
import electron from 'electron';

// Verify the shipped Node-API addon in the runtime used by the desktop app.
const result = spawnSync(
  electron,
  [
    '--input-type=module',
    '-e',
    "import Database from 'better-sqlite3'; const db = new Database(':memory:'); console.log('Electron SQLite ready:', db.prepare('SELECT sqlite_version() AS version').get().version); db.close();",
  ],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
