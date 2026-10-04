const { app, BrowserWindow, dialog, ipcMain, protocol, Menu, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const { Readable } = require('node:stream')
const { randomUUID } = require('node:crypto')

const isDev = !app.isPackaged
const mediaFiles = new Map()
const mediaTypes = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wma': 'audio/x-ms-wma',
}
const packageInfo = require('../package.json')

function getReleaseUrl() {
  const repository = typeof packageInfo.repository === 'string' ? packageInfo.repository : packageInfo.repository?.url
  if (!repository) return null
  try {
    const url = new URL(repository.replace(/^git\+/, '').replace(/\.git$/, ''))
    if (url.hostname !== 'github.com') return null
    return `https://github.com${url.pathname.replace(/\/$/, '')}/releases/latest`
  } catch { return null }
}

function showVersionInfo() {
  return dialog.showMessageBox({
    type: 'info',
    title: 'VidEd Studio — Version Info',
    message: `VidEd Studio ${app.getVersion()}`,
    detail: `Windows desktop app\nElectron ${process.versions.electron}\nChromium ${process.versions.chrome}\nNode.js ${process.versions.node}\nBuild: ${app.isPackaged ? 'Installed' : 'Development'}`,
  })
}

async function checkForUpdates() {
  const releaseUrl = getReleaseUrl()
  if (!releaseUrl) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Check For Updates',
      message: 'No update release is configured yet.',
      detail: `Current version: ${app.getVersion()}\nThe latest release page for oppdown/VidEd will open in your browser.`,
    })
    return
  }
  try { await shell.openExternal(releaseUrl) }
  catch (error) {
    await dialog.showMessageBox({ type: 'error', title: 'Check For Updates', message: 'Could not open the release page.', detail: error.message })
  }
}

function installApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('new-project') },
      { label: 'Open Project...', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open-project') },
      { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save-project') },
      { type: 'separator' },
      { label: 'Export Video...', click: () => sendMenuAction('export-video') },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' },
      { label: 'Key bind...', click: () => sendMenuAction('open-keybinds') },
    ] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
      { role: 'togglefullscreen' },
    ] },
    { label: 'Window', submenu: [
      { role: 'minimize' }, { role: 'zoom' }, { role: 'close' },
    ] },
    { label: 'Help', submenu: [
      { label: 'Check For Updates...', click: checkForUpdates },
      { type: 'separator' },
      { label: 'Version Info', click: showVersionInfo },
    ] },
  ]))
}

function sendMenuAction(action) {
  BrowserWindow.getFocusedWindow()?.webContents.send('app-menu-action', action)
}

protocol.registerSchemesAsPrivileged([{ scheme: 'vided-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }])

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 960, minWidth: 1120, minHeight: 720,
    backgroundColor: '#101114', title: 'VidEd Studio',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  if (isDev) win.loadURL('http://127.0.0.1:5173')
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

ipcMain.handle('project:save', async (_event, project) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save VidEd project', defaultPath: 'Untitled.vide', filters: [{ name: 'VidEd Project', extensions: ['vide'] }] })
  if (canceled || !filePath) return null
  await fs.writeFile(filePath, JSON.stringify(project, null, 2), 'utf8')
  return filePath
})
ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ title: 'Open VidEd project', properties: ['openFile'], filters: [{ name: 'VidEd Project', extensions: ['vide'] }] })
  if (canceled || !filePaths[0]) return null
  return JSON.parse(await fs.readFile(filePaths[0], 'utf8'))
})
ipcMain.handle('media:resolve', async (_event, requestedPath) => {
  if (typeof requestedPath !== 'string' || !path.isAbsolute(requestedPath)) return null
  const fullPath = path.resolve(requestedPath)
  if (!mediaTypes[path.extname(fullPath).toLowerCase()]) return null
  try { if (!(await fs.stat(fullPath)).isFile()) return null } catch { return null }
  const token = randomUUID()
  mediaFiles.set(token, fullPath)
  return `vided-media://asset/${token}`
})

async function handleMedia(request) {
  const token = new URL(request.url).pathname.slice(1)
  const fullPath = mediaFiles.get(token)
  if (!fullPath) return new Response('Media not found', { status: 404 })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range' } })
  try {
    const info = await fs.stat(fullPath)
    const baseHeaders = {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range',
      'Accept-Ranges': 'bytes', 'Content-Type': mediaTypes[path.extname(fullPath).toLowerCase()],
    }
    if (request.method === 'HEAD') return new Response(null, { headers: { ...baseHeaders, 'Content-Length': String(info.size) } })
    const range = request.headers.get('range')
    let start = 0
    let end = info.size - 1
    let status = 200
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match) return new Response(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${info.size}` } })
      if (match[1]) start = Number(match[1])
      if (match[2]) end = Math.min(Number(match[2]), end)
      if (!match[1] && match[2]) start = Math.max(0, info.size - Number(match[2]))
      if (start > end || start >= info.size) return new Response(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${info.size}` } })
      status = 206
    }
    const headers = { ...baseHeaders, 'Content-Length': String(end - start + 1) }
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
    return new Response(Readable.toWeb(fsSync.createReadStream(fullPath, { start, end })), { status, headers })
  } catch { return new Response('Media unavailable', { status: 404 }) }
}
app.whenReady().then(() => {
  protocol.handle('vided-media', handleMedia)
  installApplicationMenu()
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
