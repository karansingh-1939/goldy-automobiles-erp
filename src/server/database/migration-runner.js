import { MigrationRepository } from './migration-repository.js';
import { MigrationService } from './migration-service.js';
import { IntegrityCheckService } from './integrity-check-service.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDir = path.join(__dirname, 'migrations');

let appVersion = '0.1.0';
const packageJsonPaths = [
  path.join(__dirname, '..', '..', '..', 'package.json'),
  path.resolve(process.cwd(), 'package.json'),
];
for (const p of packageJsonPaths) {
  try {
    if (fs.existsSync(p)) {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      appVersion = pkg.version || appVersion;
      break;
    }
  } catch (err) {
    // Ignore and try next path
  }
}

export class MigrationRunner {
  /**
   * @param {object} db - Active better-sqlite3 database connection
   * @param {object} [backupService] - Backup service for pre-migration backups
   * @param {string} [migrationsDir] - Folder containing .sql migration files
   * @param {string} [version] - Current application version string
   */
  constructor(db, backupService = null, migrationsDir = null, version = appVersion) {
    this.db = db;
    this.backupService = backupService;
    this.migrationsDir = migrationsDir || defaultMigrationsDir;
    this.version = version;
  }

  /**
   * Runs the sequential migration process.
   * @returns {Array<string>} Filenames of migrations applied in this run.
   */
  run() {
    const repository = new MigrationRepository(this.db);
    const service = new MigrationService(
      this.db,
      repository,
      IntegrityCheckService,
      this.backupService,
      this.migrationsDir,
      this.version,
    );
    return service.runMigrations();
  }
}

/**
 * Legacy wrapper function to preserve backward compatibility for existing tests/files.
 * @param {object} db - SQLite connection
 * @param {string} [migrationsDir] - custom path
 * @returns {Array<string>} list of migrations applied
 */
export function runMigrations(db, migrationsDir = defaultMigrationsDir) {
  const runner = new MigrationRunner(db, null, migrationsDir);
  return runner.run();
}
