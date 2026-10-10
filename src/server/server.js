import { pathToFileURL } from 'node:url';
import { env } from './config/env.js';
import { closeDatabase, getDatabase } from './database/connection.js';
import { initializeDatabase } from './database/init.js';
import { createApp } from './app.js';
import { createBackupService } from './modules/backup/backup.service.js';
import { BackupScheduler } from './modules/backup/backup.scheduler.js';

export async function startServer({ port = env.port } = {}) {
  const db = getDatabase();
  let scheduler;
  let server;
  try {
    await initializeDatabase(db);
    scheduler = new BackupScheduler(createBackupService(db));
    const app = createApp({ db, backupScheduler: scheduler });
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(port, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    scheduler.start();
  } catch (error) {
    scheduler?.stop();
    if (server) await new Promise((resolve) => server.close(resolve));
    closeDatabase();
    throw error;
  }
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      scheduler.stop();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      closeDatabase();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const backend = await startServer();
    console.log(`GOLDY AUTOMOBILE API listening at ${backend.url}`);
    const shutdown = async () => {
      await backend.close();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    console.error(`Unable to start GOLDY AUTOMOBILE: ${error.message}`);
    process.exitCode = 1;
  }
}
