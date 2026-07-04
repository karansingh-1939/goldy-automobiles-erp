import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { getLogger } from './server/shared/utils/logger.js';

// Force NODE_ENV to production if packaged
if (app.isPackaged) {
  process.env.NODE_ENV = 'production';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve custom AppData folder to unify path strategy
const getCustomAppDataPath = () => {
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

// Set Electron's userData path to align with existing structure
app.setPath('userData', getCustomAppDataPath());

let mainWindow = null;

async function startBackend() {
  // Dynamically import backend server.js to trigger database init, migration, and Express launch
  await import('./server/server.js');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'GOLDY AUTOMOBILE ERP',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load Express application root
  const port = process.env.PORT || 4321;
  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Open devTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock to prevent multiple launches
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  try {
    const logger = getLogger();
    logger.warn('STARTUP', 'Another instance of GOLDY AUTOMOBILE ERP is already running. Exiting...');
  } catch (err) {
    console.error('Another instance of GOLDY AUTOMOBILE ERP is already running. Exiting...', err);
  }
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      const logger = getLogger();
      logger.info('STARTUP', 'GOLDY AUTOMOBILE ERP desktop application starting up...');
      await startBackend();
      createWindow();
    } catch (err) {
      try {
        const logger = getLogger();
        logger.error('STARTUP', 'Failed to initialize application server:', err);
      } catch (logErr) {
        console.error('Failed to log startup error:', logErr);
      }
      console.error('Failed to initialize application server:', err);
      app.quit();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
