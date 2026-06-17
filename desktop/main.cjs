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
let zenohRobotPoseKey = null
let zenohPointCloudKey = null
let zenohTelemetryKey = null
let modbusTransactionId = 0

const shelfStateModbusAddresses = Object.freeze({
  shelfPresentCoil: 401,
  stockRegister: 50,
  liftEnableCoil: 7,
  controlCoil804: 804,
  controlCoil805: 805,
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
  modbusTransactionId = (modbusTransactionId + 1) & 0xffff
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
  payload.writeUInt16BE(value ? 0xff00 : 0x0000, 2)

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
  const [controlCoil804, controlCoil805] = await readModbusCoils(connection, addresses.controlCoil804, 2)
  const [stock, liftRealHeight, liftTargetHeight] = await readModbusHoldingRegisters(connection, addresses.stockRegister, 3)

  return {
    ok: true,
    state: {
      shelf_present: shelfPresent,
      stock,
      lift_enabled: liftEnabled,
      coil_804: controlCoil804,
      coil_805: controlCoil805,
      lift_real_height: liftRealHeight,
      lift_target_height: liftTargetHeight,
      coil_address: addresses.shelfPresentCoil,
      holding_register_address: addresses.stockRegister,
      lift_enable_coil_address: addresses.liftEnableCoil,
      coil_804_address: addresses.controlCoil804,
      coil_805_address: addresses.controlCoil805,
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

function sendZenohTelemetryMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-telemetry:message', message)
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
    '--parent-pid',
    String(process.pid),
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

  const python = getPythonCommand()
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

  const bridgeProcess = spawn(python, args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
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

function stopAllZenohBridges() {
  stopZenohRobotPoseBridge()
  stopZenohPointCloudBridge()
  stopZenohTelemetryBridge()
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

ipcMain.handle('camera-gateway:request', (_event, options) => {
  return requestCameraGateway(options)
})

ipcMain.handle('camera-gateway:fetch-binary', (_event, options) => {
  return fetchCameraGatewayBinary(options)
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
