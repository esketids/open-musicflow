import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { createBackendServer, BackendServerInstance } from '../backend/apiServer';

let mainWindow: BrowserWindow | null = null;
let backendInstance: BackendServerInstance | null = null;

async function createWindow() {
  const distPath = path.join(__dirname, '../../dist');
  backendInstance = await createBackendServer(4741, distPath);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'Open MusicFlow Studio — LG Soundbar & Mesh Controller',
    backgroundColor: '#0c0e12',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await mainWindow.loadURL(`http://127.0.0.1:${backendInstance.apiPort}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (backendInstance) {
    await backendInstance.stop();
    backendInstance = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
