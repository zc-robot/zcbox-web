const path = require('node:path')
const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const { app, BrowserWindow, ipcMain, shell } = require('electron')

const appId = 'com.zcbox.desktop'
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'

let mainWindow = null
let zenohRobotPoseProcess = null
let zenohPointCloudProcess = null

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

function getZenohRobotPoseBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-robot-pose-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-robot-pose-bridge.py')
}

function getZenohPointCloudBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-pointcloud-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-pointcloud-bridge.py')
}

function getBundledZenohPythonPath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'vendor', 'zenoh-py-1.7.1')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'vendor', 'zenoh-py-1.7.1')
}

function getPythonCommand() {
  if (process.env.ZCBOX_ZENOH_PYTHON)
    return process.env.ZCBOX_ZENOH_PYTHON

  for (const candidate of ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3']) {
    if (existsSync(candidate))
      return candidate
  }

  return 'python3'
}

function sendZenohRobotPoseMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-robot-pose:message', message)
}

function sendZenohPointCloudMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-pointcloud:message', message)
}

function stopZenohRobotPoseBridge() {
  if (!zenohRobotPoseProcess)
    return

  zenohRobotPoseProcess.kill()
  zenohRobotPoseProcess = null
}

function startZenohRobotPoseBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''

  if (!host || !namespace)
    throw new Error('Zenoh robot pose requires host and namespace')

  stopZenohRobotPoseBridge()

  const python = getPythonCommand()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const bridgeProcess = spawn(python, [
    getZenohRobotPoseBridgePath(),
    '--host',
    host,
    '--namespace',
    namespace,
  ], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  zenohRobotPoseProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohRobotPoseMessage(JSON.parse(line))
      }
      catch {
        sendZenohRobotPoseMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohRobotPoseMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohRobotPoseMessage({ type: 'error', message: error.message })
    if (zenohRobotPoseProcess === bridgeProcess)
      zenohRobotPoseProcess = null
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohRobotPoseMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohRobotPoseProcess === bridgeProcess)
      zenohRobotPoseProcess = null
  })
}

function stopZenohPointCloudBridge() {
  if (!zenohPointCloudProcess)
    return

  zenohPointCloudProcess.kill()
  zenohPointCloudProcess = null
}

function startZenohPointCloudBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []
  const maxPoints = Number.isFinite(options?.maxPoints) ? Math.floor(options.maxPoints) : 3500
  const minIntervalMs = Number.isFinite(options?.minIntervalMs) ? Math.floor(options.minIntervalMs) : 250

  if (!host || !namespace)
    throw new Error('Zenoh pointcloud requires host and namespace')

  stopZenohPointCloudBridge()

  const python = getPythonCommand()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohPointCloudBridgePath(),
    '--host',
    host,
    '--namespace',
    namespace,
    '--max-points',
    String(maxPoints),
    '--min-interval-ms',
    String(minIntervalMs),
  ]
  for (const topic of topics)
    args.push('--topic', topic)

  const bridgeProcess = spawn(python, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  zenohPointCloudProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohPointCloudMessage(JSON.parse(line))
      }
      catch {
        sendZenohPointCloudMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohPointCloudMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohPointCloudMessage({ type: 'error', message: error.message })
    if (zenohPointCloudProcess === bridgeProcess)
      zenohPointCloudProcess = null
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohPointCloudMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohPointCloudProcess === bridgeProcess)
      zenohPointCloudProcess = null
  })
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

ipcMain.handle('zenoh-robot-pose:start', (_event, options) => {
  startZenohRobotPoseBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-robot-pose:stop', () => {
  stopZenohRobotPoseBridge()
  return { ok: true }
})

ipcMain.handle('zenoh-pointcloud:start', (_event, options) => {
  startZenohPointCloudBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-pointcloud:stop', () => {
  stopZenohPointCloudBridge()
  return { ok: true }
})

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
    stopZenohRobotPoseBridge()
    stopZenohPointCloudBridge()
    if (process.platform !== 'darwin')
      app.quit()
  })
}
