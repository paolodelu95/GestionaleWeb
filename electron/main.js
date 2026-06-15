// Ordeva — edizione offline desktop (Electron).
// Avvia il backend Express in-process in OFFLINE_MODE e carica la SPA servita
// dallo stesso backend su http://localhost:<porta> (niente file://, niente CORS).
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || '3000';

// I dati (auth.db + tenants/default.db) vivono nella userData dell'utente, fuori
// dall'app: persistono tra un aggiornamento e l'altro e non finiscono nell'asar.
const dataDir = path.join(app.getPath('userData'), 'data');
fs.mkdirSync(path.join(dataDir, 'tenants'), { recursive: true });

process.env.OFFLINE_MODE = '1';
process.env.DATA_DIR = dataDir;
process.env.PORT = PORT;
process.env.NODE_ENV = 'production';

// Avvia il backend (require → bootstrap + app.listen).
// - in sviluppo: backend del repo (../backend)
// - impacchettato: copiato in resources/backend (vedi build.extraResources)
const backendEntry = app.isPackaged
  ? path.join(process.resourcesPath, 'backend', 'server.js')
  : path.join(__dirname, '..', 'backend', 'server.js');
require(backendEntry);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    title: 'Ordeva',
    backgroundColor: '#0f172a',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  Menu.setApplicationMenu(null);

  // Link esterni (https, mailto, tel) → gestiti dal sistema, non in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|tel):/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  loadWhenReady(win, `http://localhost:${PORT}/`);
}

// Il backend impiega un attimo a fare bootstrap + listen: riprova finché risponde.
function loadWhenReady(win, url, attempt = 0) {
  win.loadURL(url).catch(() => {
    if (attempt < 60 && !win.isDestroyed()) {
      setTimeout(() => loadWhenReady(win, url, attempt + 1), 250);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
