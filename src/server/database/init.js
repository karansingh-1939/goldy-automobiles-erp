import { createDatabase } from './connection.js';
import { MigrationRunner } from './migration-runner.js';
import { BackupService } from './backup-service.js';
import { runSeeds } from './seed-runner.js';
import { pathToFileURL } from 'node:url';

export async function initializeDatabase(db = createDatabase()) {
  const backupService = new BackupService(db);
  const runner = new MigrationRunner(db, backupService);
  const migrations = runner.run();
  const seeds = await runSeeds(db);

  return { migrations, seeds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = createDatabase();

  try {
    const result = await initializeDatabase(db);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    db.close();
  }
}
