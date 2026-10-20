// TIBIALY desktop: the site in its own window (Windows and Mac). The pages, prices and analyzers
// all come from the site, so the app is always current; links to other sites open in the browser.
// The address is in config.json (TIBIALY_URL overrides it, e.g. http://localhost:3000 to test).
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const URL_BASE = process.env.TIBIALY_URL || require('./config.json').url;
const HOST = new URL(URL_BASE).host;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    backgroundColor: '#0f0e0d', title: 'TIBIALY', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const open = () => win.loadURL(URL_BASE).catch(() => {});
  // no connection (or the free server waking up too slowly): a page that retries
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: URL_BASE } });
  });
  // other sites (TibiaWiki, tibiatools…) open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    const u = new URL(url);
    if (u.protocol !== 'file:' && u.host !== HOST) { e.preventDefault(); shell.openExternal(url); }
  });
  open();
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]));
  } else Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
