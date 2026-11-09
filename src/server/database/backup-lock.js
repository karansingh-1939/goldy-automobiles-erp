import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

function readLock(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) return null;
    const content = fs.readFileSync(file, 'utf8');
    const after = fs.lstatSync(file);
    if (stat.ino !== after.ino || stat.mtimeMs !== after.mtimeMs || stat.size !== after.size)
      return null;
    return { stat, content };
  } catch {
    return null;
  }
}

function sameLock(first, second) {
  return (
    first &&
    second &&
    first.content === second.content &&
    first.stat.ino === second.stat.ino &&
    first.stat.dev === second.stat.dev &&
    first.stat.mtimeMs === second.stat.mtimeMs &&
    first.stat.size === second.stat.size
  );
}

export function recoverOrphanBackupLock(dbPath) {
  const file = `${dbPath}.backup.lock`;
  const lock = readLock(file);
  if (!lock) return false;
  let pid;
  try {
    const marker = JSON.parse(lock.content);
    pid = typeof marker === 'number' ? marker : marker?.pid;
  } catch {
    return false;
  }
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2147483647) return false;
  try {
    process.kill(pid, 0);
    // An active or reused PID remains locked; permissions/unknown errors also fail closed.
    return false;
  } catch (error) {
    if (error.code !== 'ESRCH') return false;
  }
  if (!sameLock(lock, readLock(file))) return false;
  fs.unlinkSync(file);
  return true;
}

export function acquireBackupLock(dbPath) {
  recoverOrphanBackupLock(dbPath);
  const file = `${dbPath}.backup.lock`;
  const content = JSON.stringify({ pid: process.pid, owner: randomUUID() });
  fs.writeFileSync(file, content, { flag: 'wx' });
  const owned = readLock(file);
  return () => {
    if (owned?.content === content && sameLock(owned, readLock(file))) fs.unlinkSync(file);
  };
}
