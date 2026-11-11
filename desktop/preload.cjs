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
  claudeKeyStatus: () => ipcRenderer.invoke('aw:claude-key-status'),
  claudeKeySet: (key) => ipcRenderer.invoke('aw:claude-key-set', String(key)),
  claudeKeyClear: () => ipcRenderer.invoke('aw:claude-key-clear'),
  claudeAsk: (system, prompt) => ipcRenderer.invoke('aw:claude-ask', String(system), String(prompt)),
});
