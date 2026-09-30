const { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol, net, screen } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { pathToFileURL } = require('url');

const DIST = path.join(__dirname, '..', 'dist');
const OPENABLE = /\.(ftree|json|ged)$/i;
const userFile = (name) => path.join(app.getPath('userData'), name);

// ---------------- single instance ----------------
// A second launch (e.g. double-clicking a .ftree file) hands its file to the running window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let mainWindow = null;
let pendingFile = fileFromArgs(process.argv);

function fileFromArgs(argv) {
  return argv.slice(1).find((a) => OPENABLE.test(a) && fsSync.existsSync(a)) ?? null;
}

async function readForRenderer(file) {
  const buf = await fs.readFile(file);
  // GEDCOM goes as bytes (the renderer detects its charset), projects as text
  return { name: path.basename(file), data: /\.ged$/i.test(file) ? new Uint8Array(buf) : buf.toString('utf8') };
}

app.on('second-instance', async (_e, argv) => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  const file = fileFromArgs(argv);
  if (file) mainWindow.webContents.send('open-file', await readForRenderer(file));
});

// ---------------- app:// protocol ----------------
// The UI is served from app://bundle/ instead of file:// so fetch() works for its own assets
// (fonts are embedded into exported images) and the page has a normal origin.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function serveBundle() {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------------- window (size/position remembered) ----------------
function loadWindowState() {
  try {
    const s = JSON.parse(fsSync.readFileSync(userFile('window.json'), 'utf8'));
    // ignore a position that is no longer on any screen (monitor unplugged)
    const visible = screen.getAllDisplays().some(({ workArea: a }) => s.x < a.x + a.width - 100 && s.x + s.width > a.x + 100 && s.y >= a.y - 20 && s.y < a.y + a.height - 100);
    return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch {
    return { width: 1400, height: 900, maximized: false };
  }
}

function saveWindowState(win) {
  const b = win.getNormalBounds();
  try {
    fsSync.writeFileSync(userFile('window.json'), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {
    /* not critical */
  }
}

function createWindow() {
  const state = loadWindowState();
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    title: 'Родословная',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveWindowState(win));
  win.on('closed', () => (mainWindow = null));
  win.loadURL(process.env.VITE_DEV_SERVER_URL || 'app://bundle/index.html');
  // external links open in the system browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------------- IPC ----------------
// autosave in userData, written atomically
ipcMain.handle('store:load', () => fs.readFile(userFile('tree.json'), 'utf8').catch(() => null));
ipcMain.handle('store:save', async (_e, text) => {
  const tmp = userFile('tree.json.tmp');
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, userFile('tree.json'));
});

// file dialogs: text as string, binary as Uint8Array
ipcMain.handle('file:open', async (e, { filters, binary }) => {
  const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile'], filters });
  const file = res.filePaths[0];
  if (res.canceled || !file) return null;
  const buf = await fs.readFile(file);
  return { name: path.basename(file), data: binary ? new Uint8Array(buf) : buf.toString('utf8') };
});
ipcMain.handle('file:save', async (e, { defaultName, filters, data }) => {
  const res = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: defaultName, filters });
  if (res.canceled || !res.filePath) return null;
  await fs.writeFile(res.filePath, data);
  return res.filePath;
});

// a file the app was launched with (double-click in Explorer), handed over once the UI is ready
ipcMain.handle('app:pending-file', async () => {
  const file = pendingFile;
  pendingFile = null;
  return file ? readForRenderer(file) : null;
});

ipcMain.handle('win:fullscreen', (e, on) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  win.setFullScreen(!!on);
  return win.isFullScreen();
});

// ---------------- lifecycle ----------------
app.setAppUserModelId('com.familytree.app');
app.whenReady().then(() => {
  // the packaged program has no developer menu (reload, devtools shortcuts)
  if (app.isPackaged) Menu.setApplicationMenu(null);
  serveBundle();
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
