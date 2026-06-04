import { env } from './config/env.js';
import { createDatabase } from './database/connection.js';
import { initializeDatabase } from './database/init.js';
import { createApp } from './app.js';

const db = createDatabase(env.dbFile);
await initializeDatabase(db);

const app = createApp({ db });

const server = app.listen(env.port, '127.0.0.1', () => {
  console.log(`Goldy Automobiles API listening at http://127.0.0.1:${env.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
