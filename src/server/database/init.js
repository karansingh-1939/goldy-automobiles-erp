import { createDatabase } from './connection.js';
import { runMigrations } from './migrationRunner.js';
import { runSeeds } from './seedRunner.js';
import { pathToFileURL } from 'node:url';

export async function initializeDatabase(db = createDatabase()) {
  const migrations = runMigrations(db);
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
