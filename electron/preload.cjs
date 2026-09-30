const { contextBridge, ipcRenderer } = require('electron');

// The only main-process API the renderer can use (see src/io/platform.ts).
contextBridge.exposeInMainWorld('native', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (text) => ipcRenderer.invoke('store:save', text),
  openFile: (opts) => ipcRenderer.invoke('file:open', opts),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  setFullscreen: (on) => ipcRenderer.invoke('win:fullscreen', on),
  takePendingFile: () => ipcRenderer.invoke('app:pending-file'),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_e, file) => cb(file)),
});
