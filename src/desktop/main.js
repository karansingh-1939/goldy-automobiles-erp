import { app, BrowserWindow, dialog } from 'electron';
import { env } from '../server/config/env.js';
import { getLogger } from '../server/shared/utils/logger.js';

if (app.isPackaged) process.env.NODE_ENV = 'production';
const smoke = process.env.GOLDY_SMOKE === '1' ? await import('./smoke-check.js') : null;
if (smoke) smoke.assertSmokeIsolation(env);
app.setPath('userData', env.appDataPath);

let mainWindow;
let backend;
let shuttingDown = false;
let closeChecked = false;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'GOLDY AUTOMOBILE ERP',
    show: !smoke,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: !smoke,
    },
  });
  const smokeErrors = smoke ? smoke.observeSmokeErrors(mainWindow) : null;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const target = new URL(url);
    if (target.origin !== backend.url || target.pathname !== '/print-job-card.html')
      return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      },
    };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== backend.url) event.preventDefault();
  });
  await mainWindow.loadURL(backend.url);
  if (process.env.OPEN_DEVTOOLS === 'true') mainWindow.webContents.openDevTools();
  mainWindow.on('close', (event) => {
    if (smoke || closeChecked || !backend?.backupHealth) return;
    let health;
    try {
      health = backend.backupHealth();
    } catch {
      return;
    }
    if (!health.externalConfigured) return;
    const copiedToday =
      health.externalLastSuccessAt &&
      Date.now() - Date.parse(health.externalLastSuccessAt) < 12 * 60 * 60 * 1000;
    if (copiedToday) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Copy backup to USB and close', 'Close without copying'],
      defaultId: 0,
      cancelId: 1,
      title: 'Backup',
      message: "Save a copy of today's data to the USB / external folder before closing?",
    });
    closeChecked = true;
    if (choice !== 0) return mainWindow.close();
    backend
      .backupNow()
      .then((log) => {
        if (log?.external?.status !== 'SUCCESS')
          dialog.showMessageBoxSync(mainWindow, {
            type: 'warning',
            message:
              'The backup was saved on this laptop, but the USB copy failed. Check the USB drive is connected.',
          });
      })
      .catch((error) =>
        dialog.showMessageBoxSync(mainWindow, {
          type: 'error',
          message: `Backup failed: ${error.message}`,
        }),
      )
      .finally(() => mainWindow?.close());
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  if (smoke) await smoke.runDesktopSmoke(mainWindow, backend, smokeErrors);
}

if (!app.requestSingleInstanceLock()) {
  if (smoke) app.exit(1);
  else app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.whenReady().then(async () => {
    try {
      getLogger().info('STARTUP', 'Starting GOLDY AUTOMOBILE ERP');
      const { startServer } = await import('../server/server.js');
      backend = await startServer();
      await createWindow();
      if (smoke) {
        await backend.close();
        backend = null;
        app.exit(0);
      }
    } catch (error) {
      if (smoke) {
        console.log('SMOKE FAIL: desktop workflow');
        console.error(error.message);
        await backend?.close();
        backend = null;
        app.exit(1);
        return;
      }
      getLogger().error('STARTUP', 'Application startup failed', error);
      dialog.showErrorBox('GOLDY AUTOMOBILE could not start', error.message);
      app.quit();
    }
  });
  app.on('activate', () => {
    if (!mainWindow && backend) void createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', (event) => {
  if (!backend || shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  backend
    .close()
    .catch((error) => getLogger().error('SHUTDOWN', error.message))
    .finally(() => app.quit());
});
