import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

const rootDir = process.cwd();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4321),
  dbFile: path.resolve(rootDir, process.env.DB_FILE || './data/goldy.sqlite'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminDefaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@12345',
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 12),
};
