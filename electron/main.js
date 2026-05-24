'use strict';

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Single instance lock — focus existing window if user double-launches
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const PORT = 3001;
let mainWindow = null;

// Disable any Google Safe Browsing or update pings — we want 100% offline
app.commandLine.appendSwitch('disable-features', 'AutoupgradeMixedContent,CertificateTransparencyComponentUpdater');
app.commandLine.appendSwitch('no-proxy-server');

function waitForServer(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    function check() {
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(500, () => { req.destroy(); retry(); });
    }
    function retry() {
      if (++attempts >= maxAttempts) return reject(new Error(`Server did not start after ${maxAttempts} attempts`));
      setTimeout(check, 300);
    }
    check();
  });
}

/** Returns true if something is already listening on the given url */
function isReachable(url) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const req = http.get(
        { hostname: parsed.hostname, port: Number(parsed.port) || 80, path: parsed.pathname || '/', timeout: 800 },
        () => resolve(true)
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    } catch {
      resolve(false);
    }
  });
}

app.whenReady().then(async () => {
  // Data lives in the OS user-data folder so it survives app updates
  const dataDir = path.join(app.getPath('userData'), 'data');
  process.env.DATA_DIR = dataDir;

  const isPackaged = app.isPackaged;

  // ── Determine client source and load URL ─────────────────────────────────
  let clientDist = null;
  let loadUrl;

  if (isPackaged) {
    // Production: Express serves the client from the resources folder
    clientDist = path.join(process.resourcesPath, 'client');
    process.env.CLIENT_DIST = clientDist;
    loadUrl = `http://127.0.0.1:${PORT}`;
  } else {
    // Development: prefer Vite (hot-reload); fall back to built client/dist
    const viteUrl = process.env.VITE_URL || 'http://127.0.0.1:5173';
    const viteUp = await isReachable(viteUrl);

    if (viteUp) {
      // Vite dev server is running — use it (hot-reload works)
      loadUrl = viteUrl;
    } else {
      // No Vite — serve the built React app directly from Express
      const builtDist = path.join(__dirname, '..', 'client', 'dist');
      if (fs.existsSync(path.join(builtDist, 'index.html'))) {
        clientDist = builtDist;
        process.env.CLIENT_DIST = clientDist;
      }
      loadUrl = `http://127.0.0.1:${PORT}`;
    }
  }

  // ── Start the Express server ─────────────────────────────────────────────
  const serverEntry = isPackaged
    ? path.join(__dirname, 'server-dist', 'index.js')
    : path.join(__dirname, '..', 'server', 'dist', 'index.js');

  try {
    const { startServer } = require(serverEntry);
    await startServer(PORT, clientDist ?? undefined);
  } catch (err) {
    await dialog.showErrorBox('Startup error', String(err));
    app.quit();
    return;
  }

  // Wait until the server is accepting connections
  try {
    await waitForServer();
  } catch (err) {
    await dialog.showErrorBox('Server timeout', String(err));
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0e1a',
    title: 'Game Ledger',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Block any web-accessible resource from making external requests
      webSecurity: true,
    },
  });

  mainWindow.loadURL(loadUrl);

  // Open links that explicitly target _blank in the system browser, not in-app
  mainWindow.webContents.setWindowOpenHandler(({ url: href }) => {
    shell.openExternal(href);
    return { action: 'deny' };
  });

  // Block any navigation away from localhost (defence-in-depth)
  mainWindow.webContents.on('will-navigate', (event, href) => {
    const allowed = href.startsWith(`http://127.0.0.1:${PORT}`) ||
                    href.startsWith('http://localhost:');
    if (!allowed) {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
