// Academic Weapon for macOS: serves the built tracker from a private app:// address and opens it in its own window.
const { app, BrowserWindow, protocol, net, shell, Menu, Tray, nativeImage, ipcMain, dialog } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const WEB = path.join(__dirname, 'web');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath).replace(/\.\.+/g, '');
  const file = path.join(WEB, clean);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  const idx = path.join(file, 'index.html');
  if (fs.existsSync(idx)) return idx;
  return path.join(WEB, 'index.html'); // single-page fallback
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: 'Academic Weapon',
    // Native macOS look: inset traffic lights over a translucent sidebar.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadURL('app://academic-weapon/');
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

// System sounds: only names that exist in /System/Library/Sounds are played.
const SOUND_DIR = '/System/Library/Sounds';
ipcMain.on('aw:sound', (_e, name, volume) => {
  if (!/^[A-Za-z]+$/.test(name)) return;
  const file = path.join(SOUND_DIR, `${name}.aiff`);
  if (!fs.existsSync(file)) return;
  const v = Math.max(0, Math.min(1, Number(volume) || 0.6));
  execFile('/usr/bin/afplay', ['-v', String(v * 2), file], () => {});
});

// Remaining time next to the clock in the menu bar while the timer is active.
let tray = null;
ipcMain.on('aw:tray', (_e, text) => {
  if (!text) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (!tray) {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip('Academic Weapon');
    tray.on('click', () => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w) {
        w.show();
        w.focus();
      } else createWindow();
    });
  }
  tray.setTitle(String(text).slice(0, 40), { fontType: 'monospacedDigit' });
});

// Full screen while focusing. macOS's own full screen slides to a new Space; simple full
// screen switches instantly, which the page hides behind its faded-in backdrop.
ipcMain.on('aw:fullscreen', (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isFullScreen() || w.isSimpleFullScreen() === !!on) return;
  w.setWindowButtonVisibility(!on);
  w.setSimpleFullScreen(!!on);
});
ipcMain.on('aw:attention', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isFocused()) app.dock?.bounce('informational');
});

// Backups: a dated JSON file in the chosen folder; the newest 12 are kept.
const BACKUP_RE = /^academic-weapon-\d{4}-\d{2}-\d{2}_\d{4}\.json$/;
const defaultBackupDir = () => path.join(app.getPath('documents'), 'Academic Weapon Backup');
ipcMain.handle('aw:backup', (_e, json, dir) => {
  try {
    JSON.parse(json);
    const target = dir && path.isAbsolute(dir) ? dir : defaultBackupDir();
    fs.mkdirSync(target, { recursive: true });
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const file = path.join(target, `academic-weapon-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`);
    fs.writeFileSync(file, json);
    const old = fs.readdirSync(target).filter((f) => BACKUP_RE.test(f)).sort().slice(0, -30);
    old.forEach((f) => fs.rmSync(path.join(target, f)));
    return { ok: true, dir: target, file };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
// Claude: a local MCP server (mcp.cjs) that Claude Desktop or Claude Code starts on this Mac.
// The app shares a snapshot of its data in claude-bridge/ and imports what Claude logs from
// claude-bridge/inbox/. Nothing goes over the network from here, and no API key is involved.
const BRIDGE = () => path.join(app.getPath('userData'), 'claude-bridge');
const INBOX = () => path.join(BRIDGE(), 'inbox');
const MCP_SCRIPT = path.join(__dirname, 'mcp.cjs');
const CLAUDE_CONFIG = process.env.AW_CLAUDE_CONFIG || path.join(app.getPath('home'), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
const mcpEntry = () => ({ command: process.execPath, args: [MCP_SCRIPT], env: { ELECTRON_RUN_AS_NODE: '1' } });
const quote = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`;

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
ipcMain.on('aw:bridge-snapshot', (_e, json) => {
  try {
    fs.mkdirSync(BRIDGE(), { recursive: true });
    writeAtomic(path.join(BRIDGE(), 'snapshot.json'), String(json));
  } catch {
    /* the bridge is best effort: the app keeps working without it */
  }
});

// Inbox: complete files only (the server writes a temp file, then renames it).
let inboxTimer = null;
function scanInbox(win) {
  try {
    fs.mkdirSync(INBOX(), { recursive: true });
    const items = fs
      .readdirSync(INBOX())
      .filter((f) => f.endsWith('.json'))
      .sort()
      .flatMap((f) => {
        try {
          return [JSON.parse(fs.readFileSync(path.join(INBOX(), f), 'utf8'))];
        } catch {
          return [];
        }
      });
    if (items.length && win && !win.isDestroyed()) win.webContents.send('aw:inbox', items);
  } catch {
    /* ignore */
  }
}
function watchInbox(win) {
  fs.mkdirSync(INBOX(), { recursive: true });
  const kick = () => {
    clearTimeout(inboxTimer);
    inboxTimer = setTimeout(() => scanInbox(win), 300);
  };
  try {
    fs.watch(INBOX(), kick);
  } catch {
    /* fall back to the periodic scan */
  }
  setInterval(() => scanInbox(win), 60000);
}
ipcMain.on('aw:inbox-ready', (e) => scanInbox(BrowserWindow.fromWebContents(e.sender)));
ipcMain.on('aw:inbox-done', (_e, ids) => {
  for (const id of Array.isArray(ids) ? ids : []) {
    if (/^[\w-]+$/.test(String(id))) fs.rmSync(path.join(INBOX(), `${id}.json`), { force: true });
  }
});

function readClaudeConfig() {
  if (!fs.existsSync(CLAUDE_CONFIG)) return { ok: true, config: {} };
  try {
    const config = JSON.parse(fs.readFileSync(CLAUDE_CONFIG, 'utf8'));
    return config && typeof config === 'object' && !Array.isArray(config) ? { ok: true, config } : { ok: false };
  } catch {
    return { ok: false };
  }
}
ipcMain.handle('aw:claude-status', () => {
  const r = readClaudeConfig();
  const entry = r.ok ? r.config.mcpServers?.['academic-weapon'] : null;
  const want = mcpEntry();
  return {
    desktopInstalled: fs.existsSync('/Applications/Claude.app') || fs.existsSync(path.join(app.getPath('home'), 'Applications', 'Claude.app')),
    desktop: !entry ? 'off' : entry.command === want.command && entry.args?.[0] === want.args[0] ? 'on' : 'stale',
    codeCommand: `claude mcp add academic-weapon --scope user -e ELECTRON_RUN_AS_NODE=1 -- ${quote(want.command)} ${quote(want.args[0])}`,
    snippet: JSON.stringify({ mcpServers: { 'academic-weapon': want } }, null, 2),
  };
});
// Adds (or updates) our entry in Claude Desktop's config; everything else in it is kept, and the
// previous file is saved next to it. Runs only when the user presses "Collega" in Settings.
ipcMain.handle('aw:claude-connect', (_e, on) => {
  const r = readClaudeConfig();
  if (!r.ok) return { ok: false, error: 'Il file di configurazione di Claude non si legge: aggiungi la voce a mano.' };
  try {
    const config = r.config;
    config.mcpServers = config.mcpServers && typeof config.mcpServers === 'object' ? config.mcpServers : {};
    if (on) config.mcpServers['academic-weapon'] = mcpEntry();
    else delete config.mcpServers['academic-weapon'];
    fs.mkdirSync(path.dirname(CLAUDE_CONFIG), { recursive: true });
    if (fs.existsSync(CLAUDE_CONFIG)) fs.copyFileSync(CLAUDE_CONFIG, `${CLAUDE_CONFIG}.academic-weapon.bak`);
    writeAtomic(CLAUDE_CONFIG, JSON.stringify(config, null, 2));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
ipcMain.handle('aw:choose-folder', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Cartella per i backup',
    defaultPath: defaultBackupDir(),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Usa questa cartella',
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.on('aw:reveal', (_e, p) => {
  const target = p && path.isAbsolute(p) ? p : defaultBackupDir();
  if (fs.existsSync(target)) shell.openPath(target);
});

app.setName('Academic Weapon');
if (process.env.AW_USER_DATA) app.setPath('userData', process.env.AW_USER_DATA); // tests: a throwaway profile

app.whenReady().then(() => {
  protocol.handle('app', (req) => net.fetch(pathToFileURL(resolve(new URL(req.url).pathname)).toString()));
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  }
  createWindow();
  // Tell the MCP server the app is open, and import what Claude logs while it is.
  try {
    fs.mkdirSync(BRIDGE(), { recursive: true });
    fs.writeFileSync(path.join(BRIDGE(), 'app.pid'), String(process.pid));
  } catch {
    /* ignore */
  }
  watchInbox(BrowserWindow.getAllWindows()[0]);
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
app.on('will-quit', () => fs.rmSync(path.join(BRIDGE(), 'app.pid'), { force: true }));
