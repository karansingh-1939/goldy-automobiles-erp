import dotenv from 'dotenv';
import path from 'node:path';
import os from 'node:os';

dotenv.config();

const rootDir = process.cwd();

const getAppDataPath = () => {
  if (process.env.APPDATA_PATH) {
    return path.resolve(process.env.APPDATA_PATH);
  }
  
  const platform = os.platform();
  const homeDir = os.homedir();
  
  if (platform === 'win32') {
    return process.env.APPDATA 
      ? path.join(process.env.APPDATA, 'Goldy_Automobiles')
      : path.join(homeDir, 'AppData', 'Roaming', 'Goldy_Automobiles');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Goldy_Automobiles');
  } else {
    return path.join(homeDir, '.config', 'goldy_automobiles');
  }
};

const appDataPath = getAppDataPath();

const getDatabaseFilePath = () => {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }
  if (process.env.DB_FILE) {
    return path.resolve(process.env.DB_FILE);
  }
  if (process.env.NODE_ENV === 'production') {
    return path.join(appDataPath, 'data', 'goldy_erp.db');
  }
  return path.resolve(rootDir, './data/goldy.sqlite');
};

const dbFile = getDatabaseFilePath();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4321),
  appDataPath,
  dbFile,
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminDefaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@12345',
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 12),
};

