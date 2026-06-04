import { createDatabase } from './connection.js';
import { runMigrations } from './migrationRunner.js';

const db = createDatabase();

try {
  const applied = runMigrations(db);
  console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database already migrated.');
} finally {
  db.close();
}
