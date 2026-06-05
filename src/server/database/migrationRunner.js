import { MigrationRepository } from './migrationRepository.js';
import { MigrationService } from './migrationService.js';
import { IntegrityCheckService } from './integrityCheckService.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDir = path.join(__dirname, 'migrations');

// Dynamically resolve application version from package.json if available
let appVersion = '0.1.0';
try {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    appVersion = pkg.version || appVersion;
  }
} catch (err) {
  // Fallback to default
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
      this.version
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
