// Bridge between the page and macOS: sounds, menu-bar timer, full screen, Dock and backups.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aw', {
  playSound: (name, volume) => ipcRenderer.send('aw:sound', String(name), Number(volume)),
  setTray: (text) => ipcRenderer.send('aw:tray', String(text)),
  setFullScreen: (on) => ipcRenderer.send('aw:fullscreen', !!on),
  attention: () => ipcRenderer.send('aw:attention'),
  backup: (json, dir) => ipcRenderer.invoke('aw:backup', String(json), String(dir || '')),
  chooseFolder: () => ipcRenderer.invoke('aw:choose-folder'),
  reveal: (p) => ipcRenderer.send('aw:reveal', String(p)),
  bridgeSnapshot: (json) => ipcRenderer.send('aw:bridge-snapshot', String(json)),
  onInbox: (cb) => {
    const h = (_e, items) => cb(items);
    ipcRenderer.on('aw:inbox', h);
    return () => ipcRenderer.removeListener('aw:inbox', h);
  },
  inboxReady: () => ipcRenderer.send('aw:inbox-ready'),
  inboxDone: (ids) => ipcRenderer.send('aw:inbox-done', ids),
  claudeStatus: () => ipcRenderer.invoke('aw:claude-status'),
  claudeConnect: (on) => ipcRenderer.invoke('aw:claude-connect', !!on),
});
