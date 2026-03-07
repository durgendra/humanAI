const { app, BrowserWindow } = require('electron');
const pathModule = require('path');

const isDev = process.env.ELECTRON_DEV === 'true';

let mainWindow: ReturnType<typeof BrowserWindow> | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: pathModule.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(pathModule.join(__dirname, '../dist-renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

// IPC will be registered by orchestrator
require('./ipc');

export {};
