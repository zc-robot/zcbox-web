const path = require('node:path')
const { Buffer } = require('node:buffer')
const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const nodeNet = require('node:net')
const { app, BrowserWindow, ipcMain, net, shell } = require('electron')

const appId = 'com.zcbox.desktop'
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'

let mainWindow = null
let zenohRobotPoseProcess = null
let zenohPointCloudProcess = null
let zenohTelemetryProcess = null
let zenohMotorStatesProcess = null
let zenohFleetDataProcess = null
let zenohBuildingMapProcess = null
let zenohDidoProcess = null
let zenohHardwareDiagnosticsProcess = null
let zenohCommandProcess = null
let zenohRobotPoseKey = null
let zenohPointCloudKey = null
let zenohTelemetryKey = null
let zenohMotorStatesKey = null
let zenohFleetDataKey = null
let zenohBuildingMapKey = null
let zenohDidoKey = null
let zenohHardwareDiagnosticsKey = null
let zenohCommandKey = null
let modbusTransactionId = 0

const shelfStateModbusAddresses = Object.freeze({
  shelfPresentCoil: 401,
  stockRegister: 50,
  liftEnableCoil: 7,
  controlCoil804: 804,
  controlCoil805: 805,
  controlCoil806: 806,
  controlCoil807: 807,
  liftRealHeightRegister: 51,
  liftTargetHeightRegister: 52,
})

function normalizeGatewayHost(value) {
  const host = typeof value === 'string' ? value.trim() : ''
  if (!host)
    throw new Error('Camera gateway request requires host')

  try {
    const url = new URL(host)
    return url.hostname
  }
  catch {
    return host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
}

function normalizeGatewayPath(value) {
  const requestPath = typeof value === 'string' ? value.trim() : ''
  if (!requestPath)
    throw new Error('Camera gateway request requires path')

  const normalizedPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`
  if (!normalizedPath.startsWith('/api/v1/sources') && normalizedPath !== '/api/v1/health')
    throw new Error(`Camera gateway path is not allowed: ${normalizedPath}`)

  return normalizedPath
}

function normalizeComposeControlHost(value) {
  const host = typeof value === 'string' ? value.trim() : ''
  if (!host)
    throw new Error('Compose control request requires host')

  try {
    const url = new URL(host)
    return url.hostname
  }
  catch {
    return host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
  }
}

function normalizeComposeControlPath(value) {
  const requestPath = typeof value === 'string' ? value.trim() : ''
  if (!requestPath)
    throw new Error('Compose control request requires path')

  const normalizedPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`
  const pathname = normalizedPath.split('?')[0]
  const isAllowed = pathname === '/health'
    || pathname === '/api/fleet-config'
    || pathname === '/api/fleet-config/reference-coordinates'
    || pathname === '/api/maps/sites'
    || /^\/api\/maps\/[^/]+\/files$/.test(pathname)
    || /^\/api\/maps\/[^/]+\/download$/.test(pathname)
    || /^\/api\/maps\/[^/]+\/(?:png|yaml|file)\/.+$/.test(pathname)

  if (!isAllowed)
    throw new Error(`Compose control path is not allowed: ${normalizedPath}`)

  return normalizedPath
}

async function requestCameraGateway(options) {
  const host = normalizeGatewayHost(options?.host)
  const port = Number.isFinite(options?.port) ? Math.floor(options.port) : 8083
  const method = typeof options?.method === 'string' ? options.method.toUpperCase() : 'GET'
  if (!['GET', 'POST'].includes(method))
    throw new Error(`Camera gateway method is not allowed: ${method}`)

  const requestPath = normalizeGatewayPath(options?.path)
  const url = new URL(requestPath, `http://${host}:${port}`)
  let response
  try {
    response = await net.fetch(url.toString(), {
      method,
      headers: {
        accept: 'application/json',
      },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Camera gateway request failed: ${method} ${url.toString()}: ${message}`)
  }
  const text = await response.text()
  let body = text
  if (text) {
    try {
      body = JSON.parse(text)
    }
    catch {}
  }

  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? body.message
      : `Camera gateway request failed: ${response.status}`
    throw new Error(message)
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  }
}

async function requestComposeControl(options) {
  const host = normalizeComposeControlHost(options?.host)
  const port = Number.isFinite(options?.port) ? Math.floor(options.port) : 4999
  const method = typeof options?.method === 'string' ? options.method.toUpperCase() : 'GET'
  if (!['GET', 'PUT', 'POST'].includes(method))
    throw new Error(`Compose control method is not allowed: ${method}`)

  const requestPath = normalizeComposeControlPath(options?.path)
  const token = typeof options?.token === 'string' ? options.token.trim() : ''
  const url = new URL(requestPath, `http://${host}:${port}`)
  const headers = {
    accept: 'application/json',
  }
  if (token)
    headers.authorization = `Bearer ${token}`
  const hasJsonBody = method !== 'GET' && options?.json !== undefined
  if (hasJsonBody)
    headers['content-type'] = 'application/json'

  let response
  try {
    response = await net.fetch(url.toString(), {
      method,
      headers,
      body: hasJsonBody ? JSON.stringify(options.json) : undefined,
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Compose control request failed: ${method} ${url.toString()}: ${message}`)
  }

  const text = await response.text()
  let body = text
  if (text) {
    try {
      body = JSON.parse(text)
    }
    catch {}
  }

  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body
      ? body.error
      : `Compose control request failed: ${response.status}`
    throw new Error(message)
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  }
}

async function fetchCameraGatewayBinary(options) {
  const host = normalizeGatewayHost(options?.host)
  const port = Number.isFinite(options?.port) ? Math.floor(options.port) : 8083
  const requestPath = normalizeGatewayPath(options?.path)
  const url = new URL(requestPath, `http://${host}:${port}`)
  let response
  try {
    response = await net.fetch(url.toString(), {
      method: 'GET',
      headers: {
        accept: 'image/*',
      },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Camera gateway image request failed: ${url.toString()}: ${message}`)
  }

  if (!response.ok)
    throw new Error(`Camera gateway image request failed: ${response.status}`)

  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const data = Buffer.from(await response.arrayBuffer()).toString('base64')
  return {
    ok: true,
    status: response.status,
    contentType,
    data,
  }
}

function normalizeModbusHost(value) {
  const host = typeof value === 'string' ? value.trim() : ''
  if (!host)
    throw new Error('Modbus request requires host')

  try {
    const url = new URL(host)
    return url.hostname
  }
  catch {
    return host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
  }
}

function normalizeModbusPort(value) {
  const port = Number.isFinite(value) ? Math.floor(value) : 502
  if (port <= 0 || port > 65535)
    throw new Error(`Invalid Modbus port: ${value}`)
  return port
}

function normalizeModbusUnitId(value) {
  const unitId = Number.isFinite(value) ? Math.floor(value) : 1
  if (unitId < 0 || unitId > 255)
    throw new Error(`Invalid Modbus unit id: ${value}`)
  return unitId
}

function normalizeModbusTimeout(value) {
  const timeoutMs = Number.isFinite(value) ? Math.floor(value) : 3000
  if (timeoutMs < 100 || timeoutMs > 30000)
    throw new Error(`Invalid Modbus timeout: ${value}`)
  return timeoutMs
}

function normalizeUint16(value, name) {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > 65535)
    throw new Error(`${name} must be an integer from 0 to 65535`)
  return numberValue
}

function normalizeBoolean(value, name) {
  if (typeof value !== 'boolean')
    throw new Error(`${name} must be boolean`)
  return value
}

function nextModbusTransactionId() {
  modbusTransactionId = (modbusTransactionId + 1) & 0xFFFF
  if (modbusTransactionId === 0)
    modbusTransactionId = 1
  return modbusTransactionId
}

function buildModbusFrame(unitId, functionCode, payload) {
  const transactionId = nextModbusTransactionId()
  const pdu = Buffer.concat([Buffer.from([functionCode]), payload])
  const frame = Buffer.alloc(7 + pdu.length)
  frame.writeUInt16BE(transactionId, 0)
  frame.writeUInt16BE(0, 2)
  frame.writeUInt16BE(pdu.length + 1, 4)
  frame.writeUInt8(unitId, 6)
  pdu.copy(frame, 7)
  return { transactionId, frame }
}

function describeModbusException(code) {
  const names = {
    1: 'illegal function',
    2: 'illegal data address',
    3: 'illegal data value',
    4: 'server device failure',
    5: 'acknowledge',
    6: 'server device busy',
  }

  return names[code] || `exception ${code}`
}

function requestModbusPdu({ host, port, unitId, functionCode, payload, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const { transactionId, frame } = buildModbusFrame(unitId, functionCode, payload)
    const socket = new nodeNet.Socket()
    let buffer = Buffer.alloc(0)
    let done = false

    function finish(error, responsePdu) {
      if (done)
        return

      done = true
      socket.removeAllListeners()
      socket.destroy()

      if (error)
        reject(error)
      else
        resolve(responsePdu)
    }

    socket.setNoDelay(true)
    socket.setTimeout(timeoutMs, () => {
      finish(new Error(`Modbus request timed out after ${timeoutMs}ms`))
    })

    socket.on('error', error => finish(error))

    socket.on('close', (hadError) => {
      if (!done && !hadError)
        finish(new Error('Modbus connection closed before response'))
    })

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length < 7)
        return

      const length = buffer.readUInt16BE(4)
      const frameLength = 6 + length
      if (buffer.length < frameLength)
        return

      const response = buffer.subarray(0, frameLength)
      if (response.readUInt16BE(0) !== transactionId) {
        finish(new Error('Modbus transaction id mismatch'))
        return
      }

      if (response.readUInt16BE(2) !== 0) {
        finish(new Error('Modbus protocol id mismatch'))
        return
      }

      const responseUnitId = response.readUInt8(6)
      if (responseUnitId !== unitId) {
        finish(new Error(`Modbus unit id mismatch: expected ${unitId}, got ${responseUnitId}`))
        return
      }

      const responsePdu = response.subarray(7)
      if (responsePdu.length < 1) {
        finish(new Error('Modbus response PDU is empty'))
        return
      }

      if (responsePdu[0] === (functionCode | 0x80)) {
        const exceptionCode = responsePdu[1] ?? 0
        finish(new Error(`Modbus ${describeModbusException(exceptionCode)}`))
        return
      }

      if (responsePdu[0] !== functionCode) {
        finish(new Error(`Unexpected Modbus function ${responsePdu[0]}`))
        return
      }

      finish(null, responsePdu)
    })

    socket.connect(port, host, () => {
      socket.write(frame)
    })
  })
}

async function readModbusCoils(connection, address, quantity) {
  const payload = Buffer.alloc(4)
  payload.writeUInt16BE(address, 0)
  payload.writeUInt16BE(quantity, 2)

  const pdu = await requestModbusPdu({
    ...connection,
    functionCode: 1,
    payload,
  })
  const byteCount = pdu[1]
  const expectedByteCount = Math.ceil(quantity / 8)
  if (byteCount < expectedByteCount || pdu.length < 2 + byteCount)
    throw new Error('Invalid Modbus coil response length')

  return Array.from({ length: quantity }, (_, index) => {
    const byte = pdu[2 + Math.floor(index / 8)]
    return (byte & (1 << (index % 8))) !== 0
  })
}

async function readModbusHoldingRegisters(connection, address, quantity) {
  const payload = Buffer.alloc(4)
  payload.writeUInt16BE(address, 0)
  payload.writeUInt16BE(quantity, 2)

  const pdu = await requestModbusPdu({
    ...connection,
    functionCode: 3,
    payload,
  })
  const byteCount = pdu[1]
  if (byteCount !== quantity * 2 || pdu.length < 2 + byteCount)
    throw new Error('Invalid Modbus holding register response length')

  return Array.from({ length: quantity }, (_, index) => pdu.readUInt16BE(2 + index * 2))
}

async function writeModbusSingleCoil(connection, address, value) {
  const payload = Buffer.alloc(4)
  payload.writeUInt16BE(address, 0)
  payload.writeUInt16BE(value ? 0xFF00 : 0x0000, 2)

  const pdu = await requestModbusPdu({
    ...connection,
    functionCode: 5,
    payload,
  })

  if (pdu.length < 5 || pdu.readUInt16BE(1) !== address)
    throw new Error('Invalid Modbus write coil response')
}

async function writeModbusSingleRegister(connection, address, value) {
  const payload = Buffer.alloc(4)
  payload.writeUInt16BE(address, 0)
  payload.writeUInt16BE(value, 2)

  const pdu = await requestModbusPdu({
    ...connection,
    functionCode: 6,
    payload,
  })

  if (pdu.length < 5 || pdu.readUInt16BE(1) !== address)
    throw new Error('Invalid Modbus write register response')
}

function normalizeModbusCoilAddress(value) {
  return normalizeUint16(value, 'coil address')
}

function buildModbusConnection(options) {
  return {
    host: normalizeModbusHost(options?.host),
    port: normalizeModbusPort(options?.port),
    unitId: normalizeModbusUnitId(options?.unitId),
    timeoutMs: normalizeModbusTimeout(options?.timeoutMs),
  }
}

async function readShelfStateModbus(options) {
  const connection = buildModbusConnection(options)
  const addresses = shelfStateModbusAddresses
  const shelfPresent = (await readModbusCoils(connection, addresses.shelfPresentCoil, 1))[0]
  const liftEnabled = (await readModbusCoils(connection, addresses.liftEnableCoil, 1))[0]
  const [
    controlCoil804,
    controlCoil805,
    controlCoil806,
    controlCoil807,
  ] = await readModbusCoils(connection, addresses.controlCoil804, 4)
  const [stock, liftRealHeight, liftTargetHeight] = await readModbusHoldingRegisters(connection, addresses.stockRegister, 3)

  return {
    ok: true,
    state: {
      shelf_present: shelfPresent,
      stock,
      lift_enabled: liftEnabled,
      coil_804: controlCoil804,
      coil_805: controlCoil805,
      coil_806: controlCoil806,
      coil_807: controlCoil807,
      lift_real_height: liftRealHeight,
      lift_target_height: liftTargetHeight,
      coil_address: addresses.shelfPresentCoil,
      holding_register_address: addresses.stockRegister,
      lift_enable_coil_address: addresses.liftEnableCoil,
      coil_804_address: addresses.controlCoil804,
      coil_805_address: addresses.controlCoil805,
      coil_806_address: addresses.controlCoil806,
      coil_807_address: addresses.controlCoil807,
      lift_real_height_register_address: addresses.liftRealHeightRegister,
      lift_target_height_register_address: addresses.liftTargetHeightRegister,
      source: 'desktop-modbus',
    },
    meta: connection,
  }
}

async function writeShelfStateModbus(options) {
  const connection = buildModbusConnection(options)
  const payload = options?.state || {}
  const addresses = shelfStateModbusAddresses
  const shelfPresent = normalizeBoolean(payload.shelf_present, 'shelf_present')
  const stock = normalizeUint16(payload.stock, 'stock')
  const liftEnabled = normalizeBoolean(payload.lift_enabled, 'lift_enabled')
  const liftTargetHeight = normalizeUint16(payload.lift_target_height, 'lift_target_height')

  await writeModbusSingleCoil(connection, addresses.shelfPresentCoil, shelfPresent)
  await writeModbusSingleRegister(connection, addresses.stockRegister, stock)
  await writeModbusSingleRegister(connection, addresses.liftTargetHeightRegister, liftTargetHeight)
  await writeModbusSingleCoil(connection, addresses.liftEnableCoil, liftEnabled)

  return readShelfStateModbus(options)
}

async function readModbusCoil(options) {
  const connection = buildModbusConnection(options)
  const address = normalizeModbusCoilAddress(options?.address)
  const [value] = await readModbusCoils(connection, address, 1)

  return {
    ok: true,
    address,
    value,
    meta: connection,
  }
}

async function writeModbusCoil(options) {
  const connection = buildModbusConnection(options)
  const address = normalizeModbusCoilAddress(options?.address)
  const value = normalizeBoolean(options?.value, 'value')

  await writeModbusSingleCoil(connection, address, value)

  return readModbusCoil(options)
}

async function writeModbusCoilSequence(options) {
  const connection = buildModbusConnection(options)
  const steps = Array.isArray(options?.steps) ? options.steps : []
  if (steps.length === 0)
    throw new Error('Modbus coil sequence requires at least one step')

  const normalizedSteps = steps.map((step, index) => ({
    address: normalizeModbusCoilAddress(step?.address),
    value: normalizeBoolean(step?.value, `steps[${index}].value`),
  }))

  for (const step of normalizedSteps)
    await writeModbusSingleCoil(connection, step.address, step.value)

  const shelfState = await readShelfStateModbus(options)

  return {
    ok: true,
    steps: normalizedSteps,
    state: shelfState.state,
    meta: connection,
  }
}

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

function getZenohTelemetryBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-telemetry-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-telemetry-bridge.py')
}

function getZenohMotorStateBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-motor-state-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-motor-state-bridge.py')
}

function getZenohFleetDataBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-fleet-data-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-fleet-data-bridge.py')
}

function getZenohBuildingMapBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-building-map-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-building-map-bridge.py')
}

function getZenohDidoBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-dido-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-dido-bridge.py')
}

function getZenohHardwareDiagnosticsBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-hardware-diagnostics-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-hardware-diagnostics-bridge.py')
}

function getZenohCommandBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-command-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-command-bridge.py')
}

function getBundledZenohPythonPath() {
  const vendorPackageName = process.platform === 'win32'
    ? 'zenoh-py-1.7.1-win-amd64'
    : 'zenoh-py-1.7.1'
  const vendorPath = !app.isPackaged
    ? path.join(__dirname, 'vendor', vendorPackageName)
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'vendor', vendorPackageName)

  return existsSync(vendorPath) ? vendorPath : ''
}

function getBundledWindowsPythonPath() {
  if (process.platform !== 'win32')
    return ''

  const pythonPath = !app.isPackaged
    ? path.join(__dirname, 'vendor', 'python-3.12.10-embed-win-amd64', 'python.exe')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'vendor', 'python-3.12.10-embed-win-amd64', 'python.exe')

  return existsSync(pythonPath) ? pythonPath : ''
}

function getPythonInvocation() {
  if (process.env.ZCBOX_ZENOH_PYTHON)
    return { command: process.env.ZCBOX_ZENOH_PYTHON, args: [] }

  const bundledWindowsPython = getBundledWindowsPythonPath()
  if (bundledWindowsPython)
    return { command: bundledWindowsPython, args: [] }

  if (process.platform === 'win32')
    return { command: 'python', args: [] }

  for (const candidate of ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3']) {
    if (existsSync(candidate))
      return { command: candidate, args: [] }
  }

  return { command: 'python3', args: [] }
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

function sendZenohTelemetryMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-telemetry:message', message)
}

function sendZenohMotorStatesMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-motor-states:message', message)
}

function sendZenohFleetDataMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-fleet-data:message', message)
}

function sendZenohBuildingMapMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-building-map:message', message)
}

function sendZenohDidoMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-dido:message', message)
}

function sendZenohHardwareDiagnosticsMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-hardware-diagnostics:message', message)
}

function sendZenohCommandMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-command:message', message)
}

function isBridgeRunning(bridgeProcess) {
  return bridgeProcess != null
    && bridgeProcess.exitCode == null
    && bridgeProcess.signalCode == null
    && !bridgeProcess.killed
}

function stopZenohRobotPoseBridge() {
  if (!zenohRobotPoseProcess)
    return

  zenohRobotPoseProcess.kill()
  zenohRobotPoseProcess = null
  zenohRobotPoseKey = null
}

function startZenohRobotPoseBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''

  if (!host || !namespace)
    throw new Error('Zenoh robot pose requires host and namespace')

  const bridgeKey = JSON.stringify({ host, namespace })
  if (zenohRobotPoseKey === bridgeKey && isBridgeRunning(zenohRobotPoseProcess)) {
    sendZenohRobotPoseMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: [namespace],
      source: 'priority_pose',
    })
    return
  }

  stopZenohRobotPoseBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const bridgeProcess = spawn(python.command, [
    ...python.args,
    getZenohRobotPoseBridgePath(),
    '--host',
    host,
    '--namespace',
    namespace,
    '--parent-pid',
    String(process.pid),
  ], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
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
    if (zenohRobotPoseProcess === bridgeProcess) {
      zenohRobotPoseProcess = null
      zenohRobotPoseKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohRobotPoseMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohRobotPoseProcess === bridgeProcess) {
      zenohRobotPoseProcess = null
      zenohRobotPoseKey = null
    }
  })

  zenohRobotPoseKey = bridgeKey
}

function stopZenohPointCloudBridge() {
  if (!zenohPointCloudProcess)
    return

  zenohPointCloudProcess.kill()
  zenohPointCloudProcess = null
  zenohPointCloudKey = null
}

function startZenohPointCloudBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []
  const targetFrames = Array.isArray(options?.targetFrames) ? options.targetFrames.filter(frame => typeof frame === 'string' && frame.trim()) : []
  const maxPoints = Number.isFinite(options?.maxPoints) ? Math.floor(options.maxPoints) : 3500
  const minIntervalMs = Number.isFinite(options?.minIntervalMs) ? Math.floor(options.minIntervalMs) : 250

  if (!host || !namespace)
    throw new Error('Zenoh pointcloud requires host and namespace')

  const normalizedTopics = topics.map(topic => topic.trim()).filter(Boolean)
  const normalizedTargetFrames = targetFrames.map(frame => frame.trim()).filter(Boolean)
  const bridgeKey = JSON.stringify({ host, namespace, topics: normalizedTopics, targetFrames: normalizedTargetFrames, maxPoints, minIntervalMs })
  if (zenohPointCloudKey === bridgeKey && isBridgeRunning(zenohPointCloudProcess)) {
    sendZenohPointCloudMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: normalizedTopics,
      targetFrames: normalizedTargetFrames,
    })
    return
  }

  stopZenohPointCloudBridge()

  const python = getPythonInvocation()
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
    '--parent-pid',
    String(process.pid),
    '--max-points',
    String(maxPoints),
    '--min-interval-ms',
    String(minIntervalMs),
  ]
  for (const topic of normalizedTopics)
    args.push('--topic', topic)
  for (const targetFrame of normalizedTargetFrames)
    args.push('--target-frame', targetFrame)

  const bridgeProcess = spawn(python.command, [...python.args, ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
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
    if (zenohPointCloudProcess === bridgeProcess) {
      zenohPointCloudProcess = null
      zenohPointCloudKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohPointCloudMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohPointCloudProcess === bridgeProcess) {
      zenohPointCloudProcess = null
      zenohPointCloudKey = null
    }
  })

  zenohPointCloudKey = bridgeKey
}

function stopZenohTelemetryBridge() {
  if (!zenohTelemetryProcess)
    return

  if (zenohTelemetryProcess.stdin?.writable) {
    try {
      zenohTelemetryProcess.stdin.write(`${JSON.stringify({ type: 'stop' })}\n`)
    }
    catch {}
  }

  zenohTelemetryProcess.kill()
  zenohTelemetryProcess = null
  zenohTelemetryKey = null
}

function startZenohTelemetryBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''
  const includeScan = options?.includeScan === true
  const includeMap = options?.includeMap === true
  const scanTopics = Array.isArray(options?.scanTopics)
    ? options.scanTopics.map(topic => typeof topic === 'string' ? topic.trim() : '').filter(Boolean)
    : []

  if (!host || !namespace)
    throw new Error('Zenoh telemetry requires host and namespace')

  const bridgeKey = JSON.stringify({ host, namespace, includeScan, includeMap, scanTopics })
  if (zenohTelemetryKey === bridgeKey && isBridgeRunning(zenohTelemetryProcess)) {
    sendZenohTelemetryMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: [],
    })
    return
  }

  stopZenohTelemetryBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohTelemetryBridgePath(),
    '--host',
    host,
    '--namespace',
    namespace,
    '--parent-pid',
    String(process.pid),
  ]
  if (includeScan)
    args.push('--include-scan')
  for (const topic of scanTopics)
    args.push('--scan-topic', topic)
  if (includeMap)
    args.push('--include-map')

  const bridgeProcess = spawn(python.command, [...python.args, ...args], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  zenohTelemetryProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohTelemetryMessage(JSON.parse(line))
      }
      catch {
        sendZenohTelemetryMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohTelemetryMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohTelemetryMessage({ type: 'error', message: error.message })
    if (zenohTelemetryProcess === bridgeProcess) {
      zenohTelemetryProcess = null
      zenohTelemetryKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohTelemetryMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohTelemetryProcess === bridgeProcess) {
      zenohTelemetryProcess = null
      zenohTelemetryKey = null
    }
  })

  zenohTelemetryKey = bridgeKey
}

function publishZenohVelocityCommand(command) {
  if (!zenohTelemetryProcess?.stdin?.writable)
    return false

  zenohTelemetryProcess.stdin.write(`${JSON.stringify({
    type: 'cmd_vel',
    command: command ?? {},
  })}\n`)

  return true
}

function publishZenohActuatorReset() {
  if (!zenohTelemetryProcess?.stdin?.writable)
    return false

  zenohTelemetryProcess.stdin.write(`${JSON.stringify({
    type: 'actuator_reset',
  })}\n`)

  return true
}

function stopZenohMotorStatesBridge() {
  if (!zenohMotorStatesProcess)
    return

  zenohMotorStatesProcess.kill()
  zenohMotorStatesProcess = null
  zenohMotorStatesKey = null
}

function startZenohMotorStatesBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []

  if (!host || !namespace)
    throw new Error('Zenoh motor states requires host and namespace')

  const normalizedTopics = topics.map(topic => topic.trim()).filter(Boolean)
  const bridgeKey = JSON.stringify({ host, namespace, topics: normalizedTopics })
  if (zenohMotorStatesKey === bridgeKey && isBridgeRunning(zenohMotorStatesProcess)) {
    sendZenohMotorStatesMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: normalizedTopics,
    })
    return
  }

  stopZenohMotorStatesBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohMotorStateBridgePath(),
    '--host',
    host,
    '--namespace',
    namespace,
    '--parent-pid',
    String(process.pid),
  ]
  for (const topic of normalizedTopics)
    args.push('--topic', topic)

  const bridgeProcess = spawn(python.command, [...python.args, ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  zenohMotorStatesProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohMotorStatesMessage(JSON.parse(line))
      }
      catch {
        sendZenohMotorStatesMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohMotorStatesMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohMotorStatesMessage({ type: 'error', message: error.message })
    if (zenohMotorStatesProcess === bridgeProcess) {
      zenohMotorStatesProcess = null
      zenohMotorStatesKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohMotorStatesMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohMotorStatesProcess === bridgeProcess) {
      zenohMotorStatesProcess = null
      zenohMotorStatesKey = null
    }
  })

  zenohMotorStatesKey = bridgeKey
}

function stopZenohFleetDataBridge() {
  if (!zenohFleetDataProcess)
    return

  zenohFleetDataProcess.kill()
  zenohFleetDataProcess = null
  zenohFleetDataKey = null
}

function startZenohFleetDataBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []

  if (!host)
    throw new Error('Zenoh fleet data requires host')

  const normalizedTopics = topics.map(topic => topic.trim()).filter(Boolean)
  const bridgeKey = JSON.stringify({ host, namespace, topics: normalizedTopics })
  if (zenohFleetDataKey === bridgeKey && isBridgeRunning(zenohFleetDataProcess)) {
    sendZenohFleetDataMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: normalizedTopics,
    })
    return
  }

  stopZenohFleetDataBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohFleetDataBridgePath(),
    '--host',
    host,
    '--parent-pid',
    String(process.pid),
  ]
  if (namespace)
    args.push('--namespace', namespace)
  for (const topic of normalizedTopics)
    args.push('--topic', topic)

  const bridgeProcess = spawn(python.command, [...python.args, ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  zenohFleetDataProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohFleetDataMessage(JSON.parse(line))
      }
      catch {
        sendZenohFleetDataMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohFleetDataMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohFleetDataMessage({ type: 'error', message: error.message })
    if (zenohFleetDataProcess === bridgeProcess) {
      zenohFleetDataProcess = null
      zenohFleetDataKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohFleetDataMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohFleetDataProcess === bridgeProcess) {
      zenohFleetDataProcess = null
      zenohFleetDataKey = null
    }
  })

  zenohFleetDataKey = bridgeKey
}

function stopZenohBuildingMapBridge() {
  if (!zenohBuildingMapProcess)
    return

  zenohBuildingMapProcess.kill()
  zenohBuildingMapProcess = null
  zenohBuildingMapKey = null
}

function startZenohBuildingMapBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []

  if (!host)
    throw new Error('Zenoh building map requires host')

  const normalizedTopics = topics.map(topic => topic.trim()).filter(Boolean)
  const bridgeKey = JSON.stringify({ host, namespace, topics: normalizedTopics })
  if (zenohBuildingMapKey === bridgeKey && isBridgeRunning(zenohBuildingMapProcess)) {
    sendZenohBuildingMapMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: normalizedTopics,
    })
    return
  }

  stopZenohBuildingMapBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohBuildingMapBridgePath(),
    '--host',
    host,
    '--parent-pid',
    String(process.pid),
  ]
  if (namespace)
    args.push('--namespace', namespace)
  for (const topic of normalizedTopics)
    args.push('--topic', topic)

  const bridgeProcess = spawn(python.command, [...python.args, ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  zenohBuildingMapProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohBuildingMapMessage(JSON.parse(line))
      }
      catch {
        sendZenohBuildingMapMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohBuildingMapMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohBuildingMapMessage({ type: 'error', message: error.message })
    if (zenohBuildingMapProcess === bridgeProcess) {
      zenohBuildingMapProcess = null
      zenohBuildingMapKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohBuildingMapMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohBuildingMapProcess === bridgeProcess) {
      zenohBuildingMapProcess = null
      zenohBuildingMapKey = null
    }
  })

  zenohBuildingMapKey = bridgeKey
}

function stopZenohDidoBridge() {
  if (!zenohDidoProcess)
    return

  zenohDidoProcess.kill()
  zenohDidoProcess = null
  zenohDidoKey = null
}

function startZenohDidoBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []
  const normalizedTopics = Array.from(new Set(topics.map(topic => topic.trim().replace(/^\/+/, '').replace(/\/+$/, '')).filter(Boolean)))

  if (!host)
    throw new Error('Zenoh DIDO requires host')
  if (normalizedTopics.length === 0)
    throw new Error('Zenoh DIDO requires at least one topic')

  const bridgeKey = JSON.stringify({ host, topics: normalizedTopics })
  if (zenohDidoKey === bridgeKey && isBridgeRunning(zenohDidoProcess)) {
    sendZenohDidoMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: normalizedTopics,
    })
    return
  }

  stopZenohDidoBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohDidoBridgePath(),
    '--host',
    host,
    '--parent-pid',
    String(process.pid),
  ]
  for (const topic of normalizedTopics)
    args.push('--topic', topic)

  const bridgeProcess = spawn(python.command, [...python.args, ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  zenohDidoProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohDidoMessage(JSON.parse(line))
      }
      catch {
        sendZenohDidoMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohDidoMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohDidoMessage({ type: 'error', message: error.message })
    if (zenohDidoProcess === bridgeProcess) {
      zenohDidoProcess = null
      zenohDidoKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohDidoMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohDidoProcess === bridgeProcess) {
      zenohDidoProcess = null
      zenohDidoKey = null
    }
  })

  zenohDidoKey = bridgeKey
}

function stopZenohHardwareDiagnosticsBridge() {
  if (!zenohHardwareDiagnosticsProcess)
    return

  zenohHardwareDiagnosticsProcess.kill()
  zenohHardwareDiagnosticsProcess = null
  zenohHardwareDiagnosticsKey = null
}

function startZenohHardwareDiagnosticsBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []
  const normalizedTopics = Array.from(new Set(topics.map(topic => topic.trim().replace(/^\/+/, '').replace(/\/+$/, '')).filter(Boolean)))

  if (!host)
    throw new Error('Zenoh hardware diagnostics requires host')
  if (normalizedTopics.length === 0)
    throw new Error('Zenoh hardware diagnostics requires at least one topic')

  const bridgeKey = JSON.stringify({ host, topics: normalizedTopics })
  if (zenohHardwareDiagnosticsKey === bridgeKey && isBridgeRunning(zenohHardwareDiagnosticsProcess)) {
    sendZenohHardwareDiagnosticsMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: normalizedTopics,
    })
    return
  }

  stopZenohHardwareDiagnosticsBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohHardwareDiagnosticsBridgePath(),
    '--host',
    host,
    '--parent-pid',
    String(process.pid),
  ]
  for (const topic of normalizedTopics)
    args.push('--topic', topic)

  const bridgeProcess = spawn(python.command, [...python.args, ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  zenohHardwareDiagnosticsProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohHardwareDiagnosticsMessage(JSON.parse(line))
      }
      catch {
        sendZenohHardwareDiagnosticsMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohHardwareDiagnosticsMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohHardwareDiagnosticsMessage({ type: 'error', message: error.message })
    if (zenohHardwareDiagnosticsProcess === bridgeProcess) {
      zenohHardwareDiagnosticsProcess = null
      zenohHardwareDiagnosticsKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohHardwareDiagnosticsMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohHardwareDiagnosticsProcess === bridgeProcess) {
      zenohHardwareDiagnosticsProcess = null
      zenohHardwareDiagnosticsKey = null
    }
  })

  zenohHardwareDiagnosticsKey = bridgeKey
}

function stopZenohCommandBridge() {
  if (!zenohCommandProcess)
    return

  if (zenohCommandProcess.stdin?.writable) {
    try {
      zenohCommandProcess.stdin.write(`${JSON.stringify({ type: 'stop' })}\n`)
    }
    catch {}
  }

  zenohCommandProcess.kill()
  zenohCommandProcess = null
  zenohCommandKey = null
}

function startZenohCommandBridge(host) {
  const normalizedHost = typeof host === 'string' ? host.trim() : ''
  if (!normalizedHost)
    throw new Error('Zenoh command publisher requires host')

  if (zenohCommandKey === normalizedHost && isBridgeRunning(zenohCommandProcess))
    return

  stopZenohCommandBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohCommandBridgePath(),
    '--host',
    normalizedHost,
    '--parent-pid',
    String(process.pid),
  ]

  const bridgeProcess = spawn(python.command, [...python.args, ...args], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  zenohCommandProcess = bridgeProcess
  zenohCommandKey = normalizedHost

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohCommandMessage(JSON.parse(line))
      }
      catch {
        sendZenohCommandMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohCommandMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohCommandMessage({ type: 'error', message: error.message })
    if (zenohCommandProcess === bridgeProcess) {
      zenohCommandProcess = null
      zenohCommandKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohCommandMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohCommandProcess === bridgeProcess) {
      zenohCommandProcess = null
      zenohCommandKey = null
    }
  })
}

function publishZenohFleetVelocityCommand(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const topic = typeof options?.topic === 'string' ? options.topic.trim().replace(/^\/+/, '').replace(/\/+$/, '') : ''

  if (!host || !topic)
    throw new Error('Fleet velocity command requires host and topic')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    return false

  zenohCommandProcess.stdin.write(`${JSON.stringify({
    type: 'twist',
    key: topic,
    command: options?.command ?? {},
  })}\n`)

  return true
}

function publishZenohFleetDigitalOutputCommand(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = typeof options?.servicePath === 'string'
    ? options.servicePath.trim().replace(/^\/+/, '').replace(/\/+$/, '')
    : ''
  const address = Number.isFinite(options?.address) ? Math.floor(options.address) : -1
  const value = options?.value === true
  const requestId = typeof options?.requestId === 'string' ? options.requestId.trim() : ''

  if (!host || !servicePath)
    throw new Error('Digital output command requires host and service path')
  if (address < 0 || address > 0xFFFF)
    throw new Error('Digital output command requires uint16 address')
  if (!requestId)
    throw new Error('Digital output command requires request id')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    return false

  zenohCommandProcess.stdin.write(`${JSON.stringify({
    type: 'write_coil',
    key: servicePath,
    address,
    value,
    requestId,
    controlId: typeof options?.controlId === 'string' ? options.controlId : undefined,
  })}\n`)

  return true
}

function stopAllZenohBridges() {
  stopZenohRobotPoseBridge()
  stopZenohPointCloudBridge()
  stopZenohTelemetryBridge()
  stopZenohMotorStatesBridge()
  stopZenohFleetDataBridge()
  stopZenohBuildingMapBridge()
  stopZenohDidoBridge()
  stopZenohHardwareDiagnosticsBridge()
  stopZenohCommandBridge()
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

ipcMain.handle('zenoh-telemetry:start', (_event, options) => {
  startZenohTelemetryBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-telemetry:stop', () => {
  stopZenohTelemetryBridge()
  return { ok: true }
})

ipcMain.handle('zenoh-telemetry:publish-cmd-vel', (_event, command) => {
  return { ok: publishZenohVelocityCommand(command) }
})

ipcMain.handle('zenoh-telemetry:publish-actuator-reset', () => {
  return { ok: publishZenohActuatorReset() }
})

ipcMain.handle('zenoh-motor-states:start', (_event, options) => {
  startZenohMotorStatesBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-motor-states:stop', () => {
  stopZenohMotorStatesBridge()
  return { ok: true }
})

ipcMain.handle('zenoh-fleet-data:start', (_event, options) => {
  startZenohFleetDataBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-fleet-data:stop', () => {
  stopZenohFleetDataBridge()
  return { ok: true }
})

ipcMain.handle('zenoh-building-map:start', (_event, options) => {
  startZenohBuildingMapBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-building-map:stop', () => {
  stopZenohBuildingMapBridge()
  return { ok: true }
})

ipcMain.handle('zenoh-dido:start', (_event, options) => {
  startZenohDidoBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-dido:stop', () => {
  stopZenohDidoBridge()
  return { ok: true }
})

ipcMain.handle('zenoh-hardware-diagnostics:start', (_event, options) => {
  startZenohHardwareDiagnosticsBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-hardware-diagnostics:stop', () => {
  stopZenohHardwareDiagnosticsBridge()
  return { ok: true }
})

ipcMain.handle('zenoh-command:publish-twist', (_event, options) => {
  return { ok: publishZenohFleetVelocityCommand(options) }
})

ipcMain.handle('zenoh-command:write-coil', (_event, options) => {
  return { ok: publishZenohFleetDigitalOutputCommand(options) }
})

ipcMain.handle('zenoh-command:stop', () => {
  stopZenohCommandBridge()
  return { ok: true }
})

ipcMain.handle('camera-gateway:request', (_event, options) => {
  return requestCameraGateway(options)
})

ipcMain.handle('camera-gateway:fetch-binary', (_event, options) => {
  return fetchCameraGatewayBinary(options)
})

ipcMain.handle('compose-control:request', (_event, options) => {
  return requestComposeControl(options)
})

ipcMain.handle('modbus:shelf-state:read', (_event, options) => {
  return readShelfStateModbus(options)
})

ipcMain.handle('modbus:shelf-state:write', (_event, options) => {
  return writeShelfStateModbus(options)
})

ipcMain.handle('modbus:coil:read', (_event, options) => {
  return readModbusCoil(options)
})

ipcMain.handle('modbus:coil:write', (_event, options) => {
  return writeModbusCoil(options)
})

ipcMain.handle('modbus:coil-sequence:write', (_event, options) => {
  return writeModbusCoilSequence(options)
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
    stopAllZenohBridges()
    if (process.platform !== 'darwin')
      app.quit()
  })

  app.on('before-quit', stopAllZenohBridges)
  app.on('will-quit', stopAllZenohBridges)
}

process.on('exit', stopAllZenohBridges)
