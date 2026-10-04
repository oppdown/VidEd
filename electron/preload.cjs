const { contextBridge, ipcRenderer, webUtils } = require('electron')
contextBridge.exposeInMainWorld('vided', {
  saveProject: (project) => ipcRenderer.invoke('project:save', project),
  openProject: () => ipcRenderer.invoke('project:open'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  resolveMedia: (filePath) => ipcRenderer.invoke('media:resolve', filePath),
  onMenuAction: (callback) => {
    const listener = (_event, action) => callback(action)
    ipcRenderer.on('app-menu-action', listener)
    return () => ipcRenderer.removeListener('app-menu-action', listener)
  },
  isDesktop: true,
})
