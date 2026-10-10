import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from '../../database/migration-runner.js';
import { verifySnapshot, verifySchema } from '../restore/restore.service.js';

// Exercise the restore migration path on an isolated copy, never the live database.
export async function verifyBackupSnapshot(filepath) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goldy-verify-'));
  let source;
  let staged;
  try {
    source = new Database(filepath, { readonly: true, fileMustExist: true });
    verifySnapshot(source);
    if (!source.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'").get()) {
      throw new Error('This file is not an ERP backup.');
    }
    await source.backup(path.join(directory, 'snapshot.sqlite'));
    staged = new Database(path.join(directory, 'snapshot.sqlite'));
    staged.pragma('foreign_keys = ON');
    runMigrations(staged);
    verifySnapshot(staged);
    verifySchema(staged);
    return { verified: true, checkedAt: new Date().toISOString() };
  } finally {
    staged?.close();
    source?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
