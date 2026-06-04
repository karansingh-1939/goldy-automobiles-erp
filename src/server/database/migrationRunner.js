import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDir = path.join(__dirname, 'migrations');

function checksum(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

export function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function runMigrations(db, migrationsDir = defaultMigrationsDir) {
  ensureMigrationTable(db);

  const applied = new Map(
    db.prepare('SELECT filename, checksum FROM schema_migrations').all()
      .map((row) => [row.filename, row.checksum]),
  );

  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const appliedFiles = [];

  for (const filename of files) {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    const hash = checksum(sql);

    if (applied.has(filename)) {
      if (applied.get(filename) !== hash) {
        throw new Error(`Migration checksum mismatch: ${filename}`);
      }
      continue;
    }

    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)',
      ).run(filename, hash);
    });

    applyMigration();
    appliedFiles.push(filename);
  }

  return appliedFiles;
}
