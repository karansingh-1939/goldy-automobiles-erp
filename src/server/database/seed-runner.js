import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSeedsDir = path.join(__dirname, 'seeds');

export function ensureSeedTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seed_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function runSeeds(db, seedsDir = defaultSeedsDir) {
  ensureSeedTable(db);

  const applied = new Set(
    db
      .prepare('SELECT filename FROM seed_history')
      .all()
      .map((row) => row.filename),
  );

  const files = fs
    .readdirSync(seedsDir)
    .filter((file) => file.endsWith('.js'))
    .sort();

  const appliedFiles = [];

  for (const filename of files) {
    if (applied.has(filename)) {
      continue;
    }

    const seedUrl = pathToFileURL(path.join(seedsDir, filename)).href;
    const seed = await import(`${seedUrl}?t=${Date.now()}`);

    if (typeof seed.run !== 'function') {
      throw new Error(`Seed is missing run(db): ${filename}`);
    }

    await seed.run(db);
    db.prepare('INSERT INTO seed_history (filename) VALUES (?)').run(filename);
    appliedFiles.push(filename);
  }

  return appliedFiles;
}
