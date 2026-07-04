import { env } from './config/env.js';
import { getDatabase } from './database/connection.js';
import { initializeDatabase } from './database/init.js';
import { createApp } from './app.js';
import { createBackupService } from './modules/backup/backup.service.js';
import { BackupScheduler } from './modules/backup/backup.scheduler.js';

const db = getDatabase();
await initializeDatabase(db);

const backupService = createBackupService(db);
const backupScheduler = new BackupScheduler(backupService);
backupScheduler.start();

const app = createApp({ db, backupScheduler });

const server = app.listen(env.port, '127.0.0.1', () => {
  console.log(`GOLDY AUTOMOBILE API listening at http://127.0.0.1:${env.port}`);
});

function shutdown() {
  backupScheduler.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
