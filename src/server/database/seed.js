import { createDatabase } from './connection.js';
import { runSeeds } from './seedRunner.js';

const db = createDatabase();

try {
  const applied = await runSeeds(db);
  console.log(applied.length ? `Applied seeds: ${applied.join(', ')}` : 'Database already seeded.');
} finally {
  db.close();
}
