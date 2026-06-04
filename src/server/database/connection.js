import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

let activeDatabase = null;

export function createDatabase(filePath = env.dbFile) {
  const resolvedPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  return db;
}

export function getDatabase() {
  if (!activeDatabase) {
    activeDatabase = createDatabase();
  }

  return activeDatabase;
}

export function closeDatabase() {
  if (activeDatabase) {
    activeDatabase.close();
    activeDatabase = null;
  }
}
