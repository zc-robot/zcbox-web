const path = require('node:path')
const { app, BrowserWindow, shell } = require('electron')

const appId = 'com.zcbox.desktop'
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'

let mainWindow = null

function isAllowedNavigation(url) {
  if (!url)
    return false

  if (!app.isPackaged)
    return url.startsWith(devServerUrl)

  try {
    return new URL(url).protocol === 'file:'
  }
  catch {
    return false
  }
}

function openExternal(url) {
  if (/^https?:\/\//.test(url))
    shell.openExternal(url)
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#ffffff',
    title: 'Zcbox',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url))
      return

    event.preventDefault()
    openExternal(url)
  })

  if (app.isPackaged)
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else
    await mainWindow.loadURL(devServerUrl)
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
}
else {
  app.on('second-instance', () => {
    if (!mainWindow)
      return

    if (mainWindow.isMinimized())
      mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    if (process.platform === 'win32')
      app.setAppUserModelId(appId)

    await createWindow()

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0)
        await createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
      app.quit()
  })
}
