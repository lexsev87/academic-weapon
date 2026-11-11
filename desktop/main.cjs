// Academic Weapon for macOS: serves the built tracker from a private app:// address and opens it in its own window.
const { app, BrowserWindow, protocol, net, shell, Menu, Tray, nativeImage, ipcMain, dialog, safeStorage } = require('electron');
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
// Claude (weekly review). The API key is encrypted with the Mac's Keychain (safeStorage) and kept
// outside the app's data, so it never ends up in a backup or an export. Requests go out from here.
const keyFile = () => path.join(app.getPath('userData'), 'claude-key.bin');
function readKey() {
  try {
    if (!fs.existsSync(keyFile()) || !safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(fs.readFileSync(keyFile()));
  } catch {
    return '';
  }
}
ipcMain.handle('aw:claude-key-status', () => {
  const k = readKey();
  return { set: !!k, hint: k ? `…${k.slice(-4)}` : '' };
});
ipcMain.handle('aw:claude-key-set', (_e, key) => {
  const k = String(key).trim();
  if (!k) return { ok: false, error: 'Chiave vuota' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Il Portachiavi non è disponibile' };
  try {
    fs.writeFileSync(keyFile(), safeStorage.encryptString(k), { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
ipcMain.handle('aw:claude-key-clear', () => {
  fs.rmSync(keyFile(), { force: true });
});
ipcMain.handle('aw:claude-ask', async (_e, system, prompt) => {
  const apiKey = readKey();
  if (!apiKey) return { ok: false, code: 'no-key' };
  const sdk = require('@anthropic-ai/sdk');
  const Anthropic = sdk.default || sdk;
  try {
    const client = new Anthropic({ apiKey });
    // If the model declines a request, the API retries it on the recommended fallback model.
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: String(system),
      messages: [{ role: 'user', content: String(prompt) }],
    });
    if (res.stop_reason === 'refusal') return { ok: false, code: 'refused' };
    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text ? { ok: true, text } : { ok: false, code: 'other', message: 'Risposta vuota' };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { ok: false, code: 'auth' };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, code: 'rate' };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, code: 'network' };
    if (err instanceof Anthropic.APIError) return { ok: false, code: 'other', message: `${err.status ?? ''} ${err.message}`.trim() };
    return { ok: false, code: 'other', message: String(err && err.message ? err.message : err) };
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
app.whenReady().then(() => {
  protocol.handle('app', (req) => net.fetch(pathToFileURL(resolve(new URL(req.url).pathname)).toString()));
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  }
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
