const path = require('node:path')
const { Buffer } = require('node:buffer')
const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const nodeNet = require('node:net')
const { app, BrowserWindow, ipcMain, net, shell, utilityProcess } = require('electron')
const { serializeRobotParameterUpdateBody } = require('./robot-parameter-request.cjs')

const appId = 'com.zcbox.desktop'
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'

let mainWindow = null
let zenohRobotPoseProcess = null
let zenohPointCloudProcess = null
let zenohTelemetryProcess = null
let zenohMotorStatesProcess = null
let zenohWheelStatesProcess = null
let zenohFleetDataProcess = null
let zenohBuildingMapProcess = null
let zenohRmfStateProcess = null
let zenohDidoProcess = null
let zenohHardwareDiagnosticsProcess = null
let zenohBondsProcess = null
let zenohLifecycleTransitionProcess = null
let zenohCommandProcess = null
let zenohRobotPoseKey = null
let zenohPointCloudKey = null
let zenohTelemetryKey = null
let zenohMotorStatesKey = null
let zenohWheelStatesKey = null
let zenohFleetDataKey = null
let zenohBuildingMapKey = null
let zenohRmfStateKey = null
let zenohDidoKey = null
let zenohHardwareDiagnosticsKey = null
let zenohBondsKey = null
let zenohLifecycleTransitionKey = null
let zenohCommandKey = null
let modbusTransactionId = 0
let zenohCommandRequestId = 0
const pendingZenohCommandRequests = new Map()
const modbusRetryableConnectErrorCodes = new Set([
  'EADDRNOTAVAIL',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
])
// Virtual-network peer discovery can outlast a sub-second retry window.
const modbusRetryDelaysMs = [500, 1500, 3000]

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
    || pathname === '/api/compose/allowed-files'
    || pathname === '/api/compose/ps'
    || pathname === '/api/compose/status'
    || pathname === '/api/compose/config'
    || pathname === '/api/compose/logs'
    || pathname === '/api/compose/logs/stream'
    || /^\/api\/compose\/(?:up|down|stop|restart)$/.test(pathname)
    || pathname === '/api/fleet-config'
    || pathname === '/api/fleet-config/namespace'
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

async function fetchRobotParameters(options) {
  const host = normalizeGatewayHost(options?.host)
  const port = Number.isFinite(options?.port) ? Math.floor(options.port) : 5000
  if (port < 1 || port > 65535)
    throw new Error(`Robot parameter request port is invalid: ${port}`)

  const url = new URL('/param_handler/yamlGetAll', `http://${host}:${port}`)
  let response
  try {
    response = await net.fetch(url.toString(), {
      method: 'GET',
      headers: {
        'accept': 'application/json, application/yaml, text/yaml, text/plain, */*',
        'x-api-key': '1234567890',
      },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Robot parameter request failed: GET ${url.toString()}: ${message}`)
  }

  const body = await response.text()
  if (!response.ok)
    throw new Error(`Robot parameter request failed: ${response.status} ${response.statusText}`)

  return {
    ok: true,
    status: response.status,
    body,
  }
}

async function fetchRobotParameterHeads(options) {
  const host = normalizeGatewayHost(options?.host)
  const port = Number.isFinite(options?.port) ? Math.floor(options.port) : 5000
  if (port < 1 || port > 65535)
    throw new Error(`Robot parameter request port is invalid: ${port}`)

  const url = new URL('/param_handler/yamlGetHeads', `http://${host}:${port}`)
  let response
  try {
    response = await net.fetch(url.toString(), {
      method: 'GET',
      headers: {
        'accept': 'application/json, */*',
        'x-api-key': '1234567890',
      },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Robot parameter heads request failed: GET ${url.toString()}: ${message}`)
  }

  const body = await response.text()
  if (!response.ok)
    throw new Error(body.trim() || `Robot parameter heads request failed: ${response.status} ${response.statusText}`)

  return {
    ok: true,
    status: response.status,
    body,
  }
}

async function fetchRobotParametersByHeads(options) {
  const host = normalizeGatewayHost(options?.host)
  const port = Number.isFinite(options?.port) ? Math.floor(options.port) : 5000
  if (port < 1 || port > 65535)
    throw new Error(`Robot parameter request port is invalid: ${port}`)

  const heads = Array.isArray(options?.heads)
    ? options.heads.filter(head => typeof head === 'string').map(head => head.trim()).filter(Boolean)
    : []
  if (heads.length === 0)
    throw new Error('Robot parameters by head request requires at least one head')

  const url = new URL('/param_handler/yamlGetParamsByHeads', `http://${host}:${port}`)
  let response
  try {
    response = await net.fetch(url.toString(), {
      method: 'POST',
      headers: {
        'accept': 'application/json, */*',
        'content-type': 'application/json',
        'x-api-key': '1234567890',
      },
      body: JSON.stringify({ heads }),
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Robot parameters by head request failed: POST ${url.toString()}: ${message}`)
  }

  const body = await response.text()
  if (!response.ok)
    throw new Error(body.trim() || `Robot parameters by head request failed: ${response.status} ${response.statusText}`)

  return {
    ok: true,
    status: response.status,
    body,
  }
}

async function updateRobotParameter(options) {
  const host = normalizeGatewayHost(options?.host)
  const port = Number.isFinite(options?.port) ? Math.floor(options.port) : 5000
  if (port < 1 || port > 65535)
    throw new Error(`Robot parameter request port is invalid: ${port}`)

  const keyPath = typeof options?.keyPath === 'string' ? options.keyPath.trim() : ''
  if (!keyPath)
    throw new Error('Robot parameter update requires a key path')
  if (options?.newValue === undefined)
    throw new Error('Robot parameter update requires a value')

  const url = new URL('/param_handler/yamlUpdateValue', `http://${host}:${port}`)
  let response
  try {
    response = await net.fetch(url.toString(), {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'x-api-key': '1234567890',
      },
      body: serializeRobotParameterUpdateBody({
        keyPath,
        newValue: options.newValue,
        numericType: options.numericType,
      }),
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Robot parameter update failed: POST ${url.toString()}: ${message}`)
  }

  const body = await response.text()
  if (!response.ok)
    throw new Error(body.trim() || `Robot parameter update failed: ${response.status} ${response.statusText}`)

  return {
    ok: true,
    status: response.status,
    body,
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableModbusConnectError(error) {
  return modbusRetryableConnectErrorCodes.has(error?.code)
}

function wrapModbusRetryError(error, connection, attempts, elapsedMs) {
  const wrappedError = new Error(`Modbus TCP ${connection.host}:${connection.port} failed after ${attempts} attempts over ${elapsedMs}ms: ${error.message}`)
  wrappedError.code = error.code
  wrappedError.cause = error
  return wrappedError
}

async function requestModbusPdu(options) {
  const startedAt = Date.now()
  let lastError = null

  for (let attemptIndex = 0; attemptIndex <= modbusRetryDelaysMs.length; attemptIndex += 1) {
    try {
      return await requestModbusPduOnce(options)
    }
    catch (error) {
      lastError = error
      if (!isRetryableModbusConnectError(error) || attemptIndex === modbusRetryDelaysMs.length) {
        if (attemptIndex > 0)
          throw wrapModbusRetryError(error, options, attemptIndex + 1, Date.now() - startedAt)

        throw error
      }

      await wait(modbusRetryDelaysMs[attemptIndex])
    }
  }

  throw lastError
}

function getModbusTransportPath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'modbus-transport.cjs')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'modbus-transport.cjs')
}

function exchangeModbusFrameDirect({ host, port, timeoutMs, frame }) {
  return new Promise((resolve, reject) => {
    const socket = new nodeNet.Socket()
    let buffer = Buffer.alloc(0)
    let done = false

    function finish(error, response) {
      if (done)
        return

      done = true
      socket.removeAllListeners()
      socket.destroy()

      if (error)
        reject(error)
      else
        resolve(response)
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

      finish(null, buffer.subarray(0, frameLength))
    })

    socket.connect(port, host, () => {
      socket.write(frame)
    })
  })
}

function exchangeModbusFrameViaUtility({ host, port, timeoutMs, frame }) {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(getModbusTransportPath(), [], {
      disclaim: true,
      stdio: 'pipe',
    })
    let done = false
    let stderr = ''
    let killTimeout = null

    function finish(error, response) {
      if (done)
        return

      done = true
      if (killTimeout)
        clearTimeout(killTimeout)
      child.kill()

      if (error)
        reject(error)
      else
        resolve(response)
    }

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('message', (result) => {
      if (!result?.ok) {
        const error = new Error(result?.message || stderr.trim() || 'Modbus transport utility failed')
        error.code = result?.code
        finish(error)
        return
      }

      if (typeof result.responseHex !== 'string' || !/^(?:[0-9a-fA-F]{2})+$/.test(result.responseHex)) {
        finish(new Error('Modbus transport utility returned an invalid response frame'))
        return
      }

      finish(null, Buffer.from(result.responseHex, 'hex'))
    })

    child.on('error', (type, location, report) => {
      finish(new Error(`Modbus transport utility error: ${type} at ${location}${report ? `: ${report}` : ''}`))
    })

    child.on('exit', (code) => {
      if (!done)
        finish(new Error(stderr.trim() || `Modbus transport utility exited with code ${code}`))
    })

    killTimeout = setTimeout(() => {
      const error = new Error(`Modbus transport utility timed out after ${timeoutMs + 2000}ms`)
      error.code = 'ETIMEDOUT'
      finish(error)
    }, timeoutMs + 2000)

    child.postMessage({
      host,
      port,
      timeoutMs,
      frameHex: frame.toString('hex'),
    })
  })
}

async function requestModbusPduOnce({ host, port, unitId, functionCode, payload, timeoutMs }) {
  const { transactionId, frame } = buildModbusFrame(unitId, functionCode, payload)
  const exchangeFrame = process.platform === 'darwin'
    ? exchangeModbusFrameViaUtility
    : exchangeModbusFrameDirect
  const response = await exchangeFrame({ host, port, timeoutMs, frame })

  if (response.readUInt16BE(0) !== transactionId)
    throw new Error('Modbus transaction id mismatch')

  if (response.readUInt16BE(2) !== 0)
    throw new Error('Modbus protocol id mismatch')

  const responseUnitId = response.readUInt8(6)
  if (responseUnitId !== unitId)
    throw new Error(`Modbus unit id mismatch: expected ${unitId}, got ${responseUnitId}`)

  const responsePdu = response.subarray(7)
  if (responsePdu.length < 1)
    throw new Error('Modbus response PDU is empty')

  if (responsePdu[0] === (functionCode | 0x80)) {
    const exceptionCode = responsePdu[1] ?? 0
    throw new Error(`Modbus ${describeModbusException(exceptionCode)}`)
  }

  if (responsePdu[0] !== functionCode)
    throw new Error(`Unexpected Modbus function ${responsePdu[0]}`)

  return responsePdu
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

function getZenohRmfStateBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-rmf-state-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-rmf-state-bridge.py')
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

function getZenohBondsBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-bond-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-bond-bridge.py')
}

function getZenohLifecycleTransitionBridgePath() {
  if (!app.isPackaged)
    return path.join(__dirname, 'zenoh-lifecycle-transition-bridge.py')

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'zenoh-lifecycle-transition-bridge.py')
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

function sendZenohWheelStatesMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-wheel-states:message', message)
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

function sendZenohRmfStateMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-rmf-state:message', message)
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

function sendZenohBondsMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-bonds:message', message)
}

function sendZenohLifecycleTransitionMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-lifecycle-transition:message', message)
}

function sendZenohCommandMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  mainWindow.webContents.send('zenoh-command:message', message)
}

function handleZenohCommandMessage(message) {
  sendZenohCommandMessage(message)

  if (message?.type !== 'service-response' || typeof message.requestId !== 'string')
    return

  const pending = pendingZenohCommandRequests.get(message.requestId)
  if (!pending)
    return

  pendingZenohCommandRequests.delete(message.requestId)
  clearTimeout(pending.timeout)
  pending.resolve(message)
}

function rejectPendingZenohCommandRequests(error) {
  for (const [requestId, pending] of pendingZenohCommandRequests) {
    pendingZenohCommandRequests.delete(requestId)
    clearTimeout(pending.timeout)
    pending.reject(error)
  }
}

function nextZenohCommandRequestId(prefix) {
  zenohCommandRequestId += 1
  return `${prefix}:${Date.now()}:${zenohCommandRequestId}`
}

function waitForZenohCommandResponse(requestId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingZenohCommandRequests.delete(requestId)
      reject(new Error(`Zenoh service request timed out: ${requestId}`))
    }, timeoutMs)

    pendingZenohCommandRequests.set(requestId, {
      resolve,
      reject,
      timeout,
    })
  })
}

function cancelPendingZenohCommandRequest(requestId, error) {
  const pending = pendingZenohCommandRequests.get(requestId)
  if (!pending)
    return

  pendingZenohCommandRequests.delete(requestId)
  clearTimeout(pending.timeout)
  pending.reject(error)
}

function isBridgeRunning(bridgeProcess) {
  return bridgeProcess != null
    && bridgeProcess.exitCode == null
    && bridgeProcess.signalCode == null
    && !bridgeProcess.killed
}

function normalizeNamespacedZenohTopics(namespace, topics) {
  const normalizedNamespace = typeof namespace === 'string' ? namespace.trim().replace(/^\/+/, '').replace(/\/+$/, '') : ''
  const normalized = []
  for (const rawTopic of topics) {
    const topic = typeof rawTopic === 'string' ? rawTopic.trim().replace(/^\/+/, '').replace(/\/+$/, '') : ''
    if (!topic)
      continue

    const key = normalizedNamespace && !topic.startsWith(`${normalizedNamespace}/`)
      ? `${normalizedNamespace}/${topic}`
      : topic
    if (!normalized.includes(key))
      normalized.push(key)
  }

  return normalized
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

function stopZenohWheelStatesBridge() {
  if (!zenohWheelStatesProcess)
    return

  zenohWheelStatesProcess.kill()
  zenohWheelStatesProcess = null
  zenohWheelStatesKey = null
}

function startZenohWheelStatesBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []
  const normalizedTopics = Array.from(new Set(topics.map(topic => topic.trim().replace(/^\/+/, '').replace(/\/+$/, '')).filter(Boolean)))

  if (!host)
    throw new Error('Zenoh wheel states requires host')
  if (normalizedTopics.length === 0)
    throw new Error('Zenoh wheel states requires at least one topic')

  const bridgeKey = JSON.stringify({ host, namespace, topics: normalizedTopics })
  if (zenohWheelStatesKey === bridgeKey && isBridgeRunning(zenohWheelStatesProcess)) {
    sendZenohWheelStatesMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: normalizedTopics,
    })
    return
  }

  stopZenohWheelStatesBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohMotorStateBridgePath(),
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
  zenohWheelStatesProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohWheelStatesMessage(JSON.parse(line))
      }
      catch {
        sendZenohWheelStatesMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohWheelStatesMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohWheelStatesMessage({ type: 'error', message: error.message })
    if (zenohWheelStatesProcess === bridgeProcess) {
      zenohWheelStatesProcess = null
      zenohWheelStatesKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohWheelStatesMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohWheelStatesProcess === bridgeProcess) {
      zenohWheelStatesProcess = null
      zenohWheelStatesKey = null
    }
  })

  zenohWheelStatesKey = bridgeKey
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
  const subscribedKeys = normalizeNamespacedZenohTopics(namespace, normalizedTopics)
  const bridgeKey = JSON.stringify({ host, namespace, topics: normalizedTopics })
  if (zenohFleetDataKey === bridgeKey && isBridgeRunning(zenohFleetDataProcess)) {
    sendZenohFleetDataMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: subscribedKeys,
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
  const subscribedKeys = normalizeNamespacedZenohTopics(namespace, normalizedTopics)
  const bridgeKey = JSON.stringify({ host, namespace, topics: normalizedTopics })
  if (zenohBuildingMapKey === bridgeKey && isBridgeRunning(zenohBuildingMapProcess)) {
    sendZenohBuildingMapMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: subscribedKeys,
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

function stopZenohRmfStateBridge() {
  if (!zenohRmfStateProcess)
    return

  zenohRmfStateProcess.kill()
  zenohRmfStateProcess = null
  zenohRmfStateKey = null
}

function startZenohRmfStateBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []

  if (!host)
    throw new Error('Zenoh RMF state requires host')

  const normalizedTopics = topics.map(topic => topic.trim()).filter(Boolean)
  const subscribedKeys = normalizeNamespacedZenohTopics(namespace, normalizedTopics)
  const bridgeKey = JSON.stringify({ host, namespace, topics: normalizedTopics })
  if (zenohRmfStateKey === bridgeKey && isBridgeRunning(zenohRmfStateProcess)) {
    sendZenohRmfStateMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: subscribedKeys,
    })
    return
  }

  stopZenohRmfStateBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohRmfStateBridgePath(),
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
  zenohRmfStateProcess = bridgeProcess

  let stdoutBuffer = ''

  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohRmfStateMessage(JSON.parse(line))
      }
      catch {
        sendZenohRmfStateMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohRmfStateMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohRmfStateMessage({ type: 'error', message: error.message })
    if (zenohRmfStateProcess === bridgeProcess) {
      zenohRmfStateProcess = null
      zenohRmfStateKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohRmfStateMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohRmfStateProcess === bridgeProcess) {
      zenohRmfStateProcess = null
      zenohRmfStateKey = null
    }
  })

  zenohRmfStateKey = bridgeKey
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

function stopZenohBondsBridge() {
  if (!zenohBondsProcess)
    return

  zenohBondsProcess.kill()
  zenohBondsProcess = null
  zenohBondsKey = null
}

function startZenohBondsBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []
  const normalizedTopics = Array.from(new Set(topics.map(topic => topic.trim().replace(/^\/+/, '').replace(/\/+$/, '')).filter(Boolean)))

  if (!host)
    throw new Error('Zenoh bonds requires host')
  if (normalizedTopics.length === 0)
    throw new Error('Zenoh bonds requires at least one topic')

  const bridgeKey = JSON.stringify({ host, topics: normalizedTopics })
  if (zenohBondsKey === bridgeKey && isBridgeRunning(zenohBondsProcess)) {
    sendZenohBondsMessage({
      type: 'status',
      state: 'subscribed',
      reused: true,
      keys: normalizedTopics,
    })
    return
  }

  stopZenohBondsBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohBondsBridgePath(),
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
  zenohBondsProcess = bridgeProcess

  let stdoutBuffer = ''
  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim())
        continue

      try {
        sendZenohBondsMessage(JSON.parse(line))
      }
      catch {
        sendZenohBondsMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohBondsMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohBondsMessage({ type: 'error', message: error.message })
    if (zenohBondsProcess === bridgeProcess) {
      zenohBondsProcess = null
      zenohBondsKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohBondsMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohBondsProcess === bridgeProcess) {
      zenohBondsProcess = null
      zenohBondsKey = null
    }
  })

  zenohBondsKey = bridgeKey
}

function stopZenohLifecycleTransitionBridge() {
  if (!zenohLifecycleTransitionProcess)
    return

  zenohLifecycleTransitionProcess.kill()
  zenohLifecycleTransitionProcess = null
  zenohLifecycleTransitionKey = null
}

function startZenohLifecycleTransitionBridge(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim().replace(/^\/+/, '').replace(/\/+$/, '') : ''
  const topics = Array.isArray(options?.topics) ? options.topics.filter(topic => typeof topic === 'string' && topic.trim()) : []
  const normalizedTopics = Array.from(new Set(topics.map(topic => topic.trim().replace(/^\/+/, '').replace(/\/+$/, '')).filter(Boolean)))

  if (!host)
    throw new Error('Zenoh lifecycle transition bridge requires host')
  if (normalizedTopics.length === 0)
    throw new Error('Zenoh lifecycle transition bridge requires at least one topic')

  const bridgeKey = JSON.stringify({ host, namespace, topics: normalizedTopics })
  if (zenohLifecycleTransitionKey === bridgeKey && isBridgeRunning(zenohLifecycleTransitionProcess)) {
    sendZenohLifecycleTransitionMessage({ type: 'status', state: 'subscribed', reused: true })
    return
  }

  stopZenohLifecycleTransitionBridge()

  const python = getPythonInvocation()
  const pythonPath = process.env.ZCBOX_ZENOH_PYTHONPATH || getBundledZenohPythonPath()
  const env = { ...process.env }
  if (pythonPath)
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath

  const args = [
    getZenohLifecycleTransitionBridgePath(),
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
  zenohLifecycleTransitionProcess = bridgeProcess

  let stdoutBuffer = ''
  bridgeProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim())
        continue
      try {
        sendZenohLifecycleTransitionMessage(JSON.parse(line))
      }
      catch {
        sendZenohLifecycleTransitionMessage({ type: 'log', message: line })
      }
    }
  })

  bridgeProcess.stderr.on('data', (chunk) => {
    sendZenohLifecycleTransitionMessage({ type: 'error', message: chunk.toString() })
  })

  bridgeProcess.on('error', (error) => {
    sendZenohLifecycleTransitionMessage({ type: 'error', message: error.message })
    if (zenohLifecycleTransitionProcess === bridgeProcess) {
      zenohLifecycleTransitionProcess = null
      zenohLifecycleTransitionKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohLifecycleTransitionMessage({ type: 'status', state: 'stopped', code, signal })
    if (zenohLifecycleTransitionProcess === bridgeProcess) {
      zenohLifecycleTransitionProcess = null
      zenohLifecycleTransitionKey = null
    }
  })

  zenohLifecycleTransitionKey = bridgeKey
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
  rejectPendingZenohCommandRequests(new Error('Zenoh command bridge stopped'))
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
        handleZenohCommandMessage(JSON.parse(line))
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
    rejectPendingZenohCommandRequests(error)
    if (zenohCommandProcess === bridgeProcess) {
      zenohCommandProcess = null
      zenohCommandKey = null
    }
  })

  bridgeProcess.on('exit', (code, signal) => {
    sendZenohCommandMessage({ type: 'status', state: 'stopped', code, signal })
    rejectPendingZenohCommandRequests(new Error(`Zenoh command bridge stopped: ${code ?? signal ?? 'unknown'}`))
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

function normalizeZenohTaskServicePath(value, fallback) {
  const rawPath = typeof value === 'string' && value.trim() ? value : fallback
  return rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function normalizeZenohServiceTimeout(value) {
  const timeoutMs = Number.isFinite(value) ? Math.floor(value) : 8000
  if (timeoutMs < 500 || timeoutMs > 60000)
    return 8000
  return timeoutMs
}

async function requestZenohTaskList(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, '')
  const robotNameFilter = typeof options?.robotNameFilter === 'string' ? options.robotNameFilter : ''
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs)

  if (!host || !servicePath)
    throw new Error('Task list request requires host and service path')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('list_tasks')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'list_tasks',
      key: servicePath,
      requestId,
      robotNameFilter,
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (!response.success)
    throw new Error(response.message || 'Failed to list tasks')

  return {
    ok: true,
    ...response,
  }
}

async function requestZenohActionList(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, '')
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs)

  if (!host || !servicePath)
    throw new Error('Action list request requires host and service path')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('list_actions')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'list_actions',
      key: servicePath,
      requestId,
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (!response.success)
    throw new Error(response.message || 'Failed to list actions')

  return response
}

async function requestZenohTaskDetail(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, '')
  const taskId = typeof options?.taskId === 'string' ? options.taskId.trim() : ''
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs)

  if (!host || !servicePath)
    throw new Error('Task detail request requires host and service path')
  if (!taskId)
    throw new Error('Task detail request requires task id')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('get_task')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'get_task',
      key: servicePath,
      requestId,
      taskId,
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (!response.success)
    throw new Error(response.message || 'Failed to get task')

  return {
    ok: true,
    ...response,
  }
}

function normalizeTaskJsonObject(value, fieldName) {
  const json = typeof value === 'string' && value.trim() ? value.trim() : '{}'
  try {
    const parsed = JSON.parse(json)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error(`${fieldName} must be an object`)
  }
  catch {
    throw new Error(`${fieldName} must be a JSON object`)
  }
  return json
}

function normalizeRecoveryLifecycleActions(value, fieldName) {
  const actions = Array.isArray(value) ? value : []
  return actions.map((action, index) => {
    const actionName = typeof action?.action_name === 'string' ? action.action_name.trim() : ''
    if (!actionName)
      throw new Error(`${fieldName}[${index}] requires action_name`)

    return {
      action_name: actionName,
      parameters_json: normalizeTaskJsonObject(action?.parameters_json, `${fieldName}[${index}].parameters_json`),
      failure_policy: action?.failure_policy === 'best_effort' ? 'best_effort' : 'required',
    }
  })
}

function normalizeCreateTaskUnitTasks(value) {
  const unitTasks = Array.isArray(value) ? value : []
  return unitTasks.map((unitTask, index) => {
    const seq = Number.isFinite(unitTask?.seq) ? Math.floor(unitTask.seq) : index
    const waypoint = typeof unitTask?.waypoint === 'string' ? unitTask.waypoint.trim() : ''
    const actionName = typeof unitTask?.action_name === 'string' ? unitTask.action_name.trim() : ''
    const actionParamsJson = normalizeTaskJsonObject(unitTask?.action_params_json, `unit_tasks[${index}].action_params_json`)
    const requestedResumeMode = typeof unitTask?.recovery_resume_mode === 'string'
      ? unitTask.recovery_resume_mode.trim()
      : ''
    const recoveryResumeMode = [
      'redispatch',
      'via_waypoint',
      'via_pause_pose',
      'via_waypoint_and_pause_pose',
      'operator_required',
    ].includes(requestedResumeMode)
      ? requestedResumeMode
      : 'operator_required'
    const recoveryApproachWaypoint = typeof unitTask?.recovery_approach_waypoint === 'string'
      ? unitTask.recovery_approach_waypoint.trim()
      : ''
    const recoveryPositionToleranceM = Number.isFinite(unitTask?.recovery_position_tolerance_m)
      ? Number(unitTask.recovery_position_tolerance_m)
      : 0.1
    const recoveryYawToleranceRad = Number.isFinite(unitTask?.recovery_yaw_tolerance_rad)
      ? Number(unitTask.recovery_yaw_tolerance_rad)
      : 0
    const recoveryMaxAttempts = Number.isFinite(unitTask?.recovery_max_attempts)
      ? Math.floor(unitTask.recovery_max_attempts)
      : 3
    const recoveryClearTimeoutSec = Number.isFinite(unitTask?.recovery_clear_timeout_sec)
      ? Number(unitTask.recovery_clear_timeout_sec)
      : 300

    return {
      seq,
      waypoint,
      action_name: actionName,
      action_params_json: actionParamsJson,
      recovery_resume_mode: recoveryResumeMode,
      recovery_approach_waypoint: recoveryApproachWaypoint,
      recovery_position_tolerance_m: recoveryPositionToleranceM,
      recovery_yaw_tolerance_enabled: Boolean(unitTask?.recovery_yaw_tolerance_enabled),
      recovery_yaw_tolerance_rad: recoveryYawToleranceRad,
      recovery_max_attempts: recoveryMaxAttempts,
      recovery_clear_timeout_sec: recoveryClearTimeoutSec,
      on_suspend_actions: normalizeRecoveryLifecycleActions(
        unitTask?.on_suspend_actions,
        `unit_tasks[${index}].on_suspend_actions`,
      ),
      before_redispatch_actions: normalizeRecoveryLifecycleActions(
        unitTask?.before_redispatch_actions,
        `unit_tasks[${index}].before_redispatch_actions`,
      ),
    }
  })
}

function normalizeRecoveryTaskMappings(value) {
  const mappings = Array.isArray(value) ? value : []
  const seenIndices = new Set()
  return mappings.map((mapping, index) => {
    const recoveryTaskIndex = Number.isFinite(mapping?.recovery_task_index)
      ? Math.floor(mapping.recovery_task_index)
      : 0
    const recoveryTaskDefinitionId = typeof mapping?.recovery_task_definition_id === 'string'
      ? mapping.recovery_task_definition_id.trim()
      : ''
    if (recoveryTaskIndex < 1 || recoveryTaskIndex > 255)
      throw new Error(`recovery_task_mappings[${index}].recovery_task_index must be between 1 and 255`)
    if (!recoveryTaskDefinitionId)
      throw new Error(`recovery_task_mappings[${index}] requires recovery_task_definition_id`)
    if (seenIndices.has(recoveryTaskIndex))
      throw new Error(`recovery_task_mappings contains duplicate index ${recoveryTaskIndex}`)
    seenIndices.add(recoveryTaskIndex)

    return {
      recovery_task_index: recoveryTaskIndex,
      recovery_task_definition_id: recoveryTaskDefinitionId,
    }
  })
}

async function requestZenohTaskCreate(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, '')
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs)
  const task = options?.task && typeof options.task === 'object' ? options.task : {}
  const name = typeof task.name === 'string' ? task.name.trim() : ''
  const description = typeof task.description === 'string' ? task.description.trim() : ''
  const robotName = typeof task.robot_name === 'string' ? task.robot_name.trim() : ''
  const fleetName = typeof task.fleet_name === 'string' ? task.fleet_name.trim() : ''
  const waypoint = typeof task.waypoint === 'string' ? task.waypoint.trim() : ''
  const actionName = typeof task.action_name === 'string' ? task.action_name.trim() : ''
  const parametersJson = normalizeTaskJsonObject(task.parameters_json, 'parameters_json')
  const unitTasks = normalizeCreateTaskUnitTasks(task.unit_tasks)
  const recoveryTaskMappings = normalizeRecoveryTaskMappings(task.recovery_task_mappings)

  if (!host || !servicePath)
    throw new Error('Task creation request requires host and service path')
  if (!robotName)
    throw new Error('Task creation request requires robot name')
  if (!fleetName)
    throw new Error('Task creation request requires fleet name')
  if (!waypoint && !actionName && unitTasks.length === 0)
    throw new Error('Task creation request requires waypoint, action, or unit tasks')
  if (unitTasks.some(unitTask => !unitTask.waypoint && !unitTask.action_name))
    throw new Error('Task creation request requires waypoint or action for every unit task')
  const parsedParameters = JSON.parse(parametersJson)
  if (unitTasks.length > 0 && (waypoint || actionName || Object.keys(parsedParameters).length > 0))
    throw new Error('Task creation request cannot combine unit tasks with simple waypoint or action fields')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('create_task')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'create_task',
      key: servicePath,
      requestId,
      task: {
        name,
        description,
        robot_name: robotName,
        fleet_name: fleetName,
        waypoint,
        action_name: actionName,
        parameters_json: parametersJson,
        unit_tasks: unitTasks,
        recovery_task_mappings: recoveryTaskMappings,
      },
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (!response.success)
    throw new Error(response.message || 'Failed to create task')

  return response
}

async function requestZenohTaskRun(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, '')
  const taskId = typeof options?.taskId === 'string' ? options.taskId.trim() : ''
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs)

  if (!host || !servicePath)
    throw new Error('Task run request requires host and service path')
  if (!taskId)
    throw new Error('Task run request requires task id')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('run_task')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'run_task',
      key: servicePath,
      requestId,
      taskId,
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (!response.success)
    throw new Error(response.message || 'Failed to run task')

  return response
}

async function requestZenohTaskCancel(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, '')
  const taskId = typeof options?.taskId === 'string' ? options.taskId.trim() : ''
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs)

  if (!host || !servicePath)
    throw new Error('Task cancel request requires host and service path')
  if (!taskId)
    throw new Error('Task cancel request requires task id')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('cancel_task')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'cancel_task',
      key: servicePath,
      requestId,
      taskId,
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (!response.success)
    throw new Error(response.message || 'Failed to cancel task')

  return response
}

async function requestZenohTaskDelete(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, '')
  const taskId = typeof options?.taskId === 'string' ? options.taskId.trim() : ''
  const force = options?.force === true
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs)

  if (!host || !servicePath)
    throw new Error('Task delete request requires host and service path')
  if (!taskId)
    throw new Error('Task delete request requires task id')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('delete_task')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'delete_task',
      key: servicePath,
      requestId,
      taskId,
      force,
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (!response.success)
    throw new Error(response.message || 'Failed to delete task')

  return response
}

function normalizeStorageReinitShelf(value) {
  const shelf = value && typeof value === 'object' ? value : {}
  const shelfIndex = Number.isFinite(shelf.shelf_index) ? Math.floor(shelf.shelf_index) : 0
  const columns = Number.isFinite(shelf.columns) ? Math.floor(shelf.columns) : 0
  const rows = Number.isFinite(shelf.rows) ? Math.floor(shelf.rows) : 0
  const shelfSide = typeof shelf.shelf_side === 'string' ? shelf.shelf_side.trim() : ''

  return {
    shelf_index: shelfIndex,
    columns,
    rows,
    shelf_side: shelfSide,
  }
}

function normalizeStorageReinitArea(value) {
  const area = value && typeof value === 'object' ? value : {}
  const areaIndex = Number.isFinite(area.area_index) ? Math.floor(area.area_index) : 0
  const displayName = typeof area.display_name === 'string' ? area.display_name.trim() : ''
  const shelves = Array.isArray(area.shelves) ? area.shelves.map(normalizeStorageReinitShelf) : []

  return {
    area_index: areaIndex,
    display_name: displayName,
    shelves,
  }
}

async function requestZenohStorageAreaDisplayName(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, '')
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs ?? 10000)
  const areaIndex = Number.isFinite(options?.areaIndex) ? Math.floor(options.areaIndex) : 0
  const displayName = typeof options?.displayName === 'string' ? options.displayName.trim() : ''

  if (!host || !servicePath)
    throw new Error('Storage display name request requires host and service path')
  if (areaIndex <= 0)
    throw new Error('Storage display name request requires area index')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('set_area_display_name')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'set_area_display_name',
      key: servicePath,
      requestId,
      areaIndex,
      displayName,
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (response.received === false)
    throw new Error(response.message || 'Failed to update storage display name')

  return {
    ok: true,
    ...response,
  }
}

async function requestZenohStorageReinit(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, '')
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs ?? 15000)
  const request = options?.request && typeof options.request === 'object' ? options.request : {}
  const layout = request.layout && typeof request.layout === 'object' ? request.layout : {}
  const areas = Array.isArray(layout.areas) ? layout.areas.map(normalizeStorageReinitArea) : []
  const normalizedRequest = {
    request_id: typeof request.request_id === 'string' ? request.request_id.trim() : '',
    confirm_reinitialize: request.confirm_reinitialize === true,
    caller_id: typeof request.caller_id === 'string' ? request.caller_id.trim() : '',
    reason: typeof request.reason === 'string' ? request.reason.trim() : '',
    layout: {
      areas,
    },
  }

  if (!host || !servicePath)
    throw new Error('Storage reinit request requires host and service path')
  if (!normalizedRequest.request_id)
    throw new Error('Storage reinit request requires request id')
  if (!normalizedRequest.confirm_reinitialize)
    throw new Error('Storage reinit request requires confirmation')
  if (areas.length === 0)
    throw new Error('Storage reinit request requires at least one area')
  if (areas.some(area => area.area_index <= 0 || area.shelves.length === 0))
    throw new Error('Storage reinit request requires valid areas and shelves')
  if (areas.some(area => area.shelves.some(shelf => shelf.shelf_index <= 0 || shelf.columns <= 0 || shelf.rows <= 0)))
    throw new Error('Storage reinit request requires valid shelf dimensions')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('reinit_storage')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'reinit_storage',
      key: servicePath,
      requestId,
      request: normalizedRequest,
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (response.received === false)
    throw new Error(response.message || 'Failed to reinitialize storage')

  return {
    ok: true,
    ...response,
  }
}

function normalizePointCloudRoiNumber(value, fallback) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function normalizePointCloudRoiRequest(request) {
  const payload = request && typeof request === 'object' ? request : {}
  const normalized = {
    min_x: normalizePointCloudRoiNumber(payload.min_x, 0),
    max_x: normalizePointCloudRoiNumber(payload.max_x, 3),
    min_y: normalizePointCloudRoiNumber(payload.min_y, -0.5),
    max_y: normalizePointCloudRoiNumber(payload.max_y, 0.5),
    min_z: normalizePointCloudRoiNumber(payload.min_z, -0.2),
    max_z: normalizePointCloudRoiNumber(payload.max_z, 1),
    remove_ground: payload.remove_ground === true,
    ground_plane_a: normalizePointCloudRoiNumber(payload.ground_plane_a, 0),
    ground_plane_b: normalizePointCloudRoiNumber(payload.ground_plane_b, 0),
    ground_plane_c: normalizePointCloudRoiNumber(payload.ground_plane_c, 1),
    ground_plane_d: normalizePointCloudRoiNumber(payload.ground_plane_d, 0),
    ground_distance_threshold: normalizePointCloudRoiNumber(payload.ground_distance_threshold, 0.06),
  }

  if (normalized.min_x >= normalized.max_x)
    throw new Error('Point cloud ROI requires min_x < max_x')
  if (normalized.min_y >= normalized.max_y)
    throw new Error('Point cloud ROI requires min_y < max_y')
  if (normalized.min_z >= normalized.max_z)
    throw new Error('Point cloud ROI requires min_z < max_z')
  if (normalized.ground_distance_threshold < 0)
    throw new Error('Point cloud ROI ground threshold must be non-negative')

  return normalized
}

function normalizePointCloudRoiMaxPoints(value) {
  const maxPoints = Number.isFinite(value) ? Math.floor(value) : 3500
  return Math.min(50000, Math.max(100, maxPoints))
}

async function requestZenohPointCloudRoi(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const namespace = typeof options?.namespace === 'string' ? options.namespace.trim().replace(/^\/+/, '').replace(/\/+$/, '') : ''
  const cameraName = typeof options?.cameraName === 'string' ? options.cameraName.trim().replace(/^\/+/, '').replace(/\/+$/, '') : ''
  const fallbackServicePath = namespace && cameraName ? `${namespace}/${cameraName}/get_point_cloud_roi` : ''
  const servicePath = normalizeZenohTaskServicePath(options?.servicePath, fallbackServicePath)
  const timeoutMs = normalizeZenohServiceTimeout(options?.timeoutMs ?? 10000)
  const request = normalizePointCloudRoiRequest(options?.request)
  const maxPoints = normalizePointCloudRoiMaxPoints(options?.maxPoints)

  if (!host || !servicePath)
    throw new Error('Point cloud ROI request requires host and camera')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    throw new Error('Zenoh command bridge is not writable')

  const requestId = nextZenohCommandRequestId('get_point_cloud_roi')
  const responsePromise = waitForZenohCommandResponse(requestId, timeoutMs)
  try {
    zenohCommandProcess.stdin.write(`${JSON.stringify({
      type: 'get_point_cloud_roi',
      key: servicePath,
      requestId,
      request,
      maxPoints,
      timeoutSec: timeoutMs / 1000,
    })}\n`)
  }
  catch (error) {
    cancelPendingZenohCommandRequest(requestId, error)
    throw error
  }

  const response = await responsePromise
  if (!response.success)
    throw new Error(response.message || 'Failed to get point cloud')
  if (!response.pointCloud)
    throw new Error(response.message || 'Point cloud response was empty')

  return {
    ok: true,
    ...response,
  }
}

function publishZenohFleetLiftRequest(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const topic = typeof options?.topic === 'string'
    ? options.topic.trim().replace(/^\/+/, '').replace(/\/+$/, '')
    : ''
  const request = options?.request && typeof options.request === 'object' ? options.request : {}
  const liftName = typeof request.liftName === 'string' ? request.liftName.trim() : ''
  const sessionId = typeof request.sessionId === 'string' ? request.sessionId.trim() : ''
  const destinationFloor = typeof request.destinationFloor === 'string' ? request.destinationFloor.trim() : ''
  const requestType = Number.isFinite(request.requestType) ? Math.floor(request.requestType) : 1
  const doorState = Number.isFinite(request.doorState) ? Math.floor(request.doorState) : 2

  if (!host || !topic)
    throw new Error('Lift request requires host and topic')
  if (!liftName)
    throw new Error('Lift request requires lift name')
  if (!sessionId)
    throw new Error('Lift request requires session id')
  if (requestType < 0 || requestType > 255)
    throw new Error('Lift request type must be uint8')
  if (!destinationFloor && requestType !== 0)
    throw new Error('Lift request requires destination floor')
  if (doorState < 0 || doorState > 255)
    throw new Error('Lift door state must be uint8')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    return false

  zenohCommandProcess.stdin.write(`${JSON.stringify({
    type: 'lift_request',
    key: topic,
    request: {
      liftName,
      sessionId,
      requestType,
      destinationFloor,
      doorState,
    },
  })}\n`)

  return true
}

function publishZenohFleetDoorRequest(options) {
  const host = typeof options?.host === 'string' ? options.host.trim() : ''
  const topic = typeof options?.topic === 'string'
    ? options.topic.trim().replace(/^\/+/, '').replace(/\/+$/, '')
    : ''
  const request = options?.request && typeof options.request === 'object' ? options.request : {}
  const requesterId = typeof request.requesterId === 'string' ? request.requesterId.trim() : ''
  const doorName = typeof request.doorName === 'string' ? request.doorName.trim() : ''
  const requestedMode = request.requestedMode && typeof request.requestedMode === 'object' ? request.requestedMode : {}
  const requestedModeValue = Number.isFinite(requestedMode.value) ? Math.floor(requestedMode.value) : 0

  if (!host || !topic)
    throw new Error('Door request requires host and topic')
  if (!requesterId)
    throw new Error('Door request requires requester id')
  if (!doorName)
    throw new Error('Door request requires door name')
  if (requestedModeValue < 0 || requestedModeValue > 0xFFFFFFFF)
    throw new Error('Door requested mode must be uint32')

  startZenohCommandBridge(host)

  if (!zenohCommandProcess?.stdin?.writable)
    return false

  zenohCommandProcess.stdin.write(`${JSON.stringify({
    type: 'door_request',
    key: topic,
    request: {
      requesterId,
      doorName,
      requestedMode: {
        value: requestedModeValue,
      },
    },
  })}\n`)

  return true
}

function stopAllZenohBridges() {
  stopZenohRobotPoseBridge()
  stopZenohPointCloudBridge()
  stopZenohTelemetryBridge()
  stopZenohMotorStatesBridge()
  stopZenohWheelStatesBridge()
  stopZenohFleetDataBridge()
  stopZenohBuildingMapBridge()
  stopZenohRmfStateBridge()
  stopZenohDidoBridge()
  stopZenohHardwareDiagnosticsBridge()
  stopZenohBondsBridge()
  stopZenohLifecycleTransitionBridge()
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

ipcMain.handle('zenoh-wheel-states:start', (_event, options) => {
  startZenohWheelStatesBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-wheel-states:stop', () => {
  stopZenohWheelStatesBridge()
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

ipcMain.handle('zenoh-rmf-state:start', (_event, options) => {
  startZenohRmfStateBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-rmf-state:stop', () => {
  stopZenohRmfStateBridge()
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

ipcMain.handle('zenoh-bonds:start', (_event, options) => {
  startZenohBondsBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-bonds:stop', () => {
  stopZenohBondsBridge()
  return { ok: true }
})

ipcMain.handle('zenoh-lifecycle-transition:start', (_event, options) => {
  startZenohLifecycleTransitionBridge(options)
  return { ok: true }
})

ipcMain.handle('zenoh-lifecycle-transition:stop', () => {
  stopZenohLifecycleTransitionBridge()
  return { ok: true }
})

ipcMain.handle('zenoh-command:publish-twist', (_event, options) => {
  return { ok: publishZenohFleetVelocityCommand(options) }
})

ipcMain.handle('zenoh-command:write-coil', (_event, options) => {
  return { ok: publishZenohFleetDigitalOutputCommand(options) }
})

ipcMain.handle('zenoh-command:list-tasks', (_event, options) => {
  return requestZenohTaskList(options)
})

ipcMain.handle('zenoh-command:list-actions', (_event, options) => {
  return requestZenohActionList(options)
})

ipcMain.handle('zenoh-command:get-task', (_event, options) => {
  return requestZenohTaskDetail(options)
})

ipcMain.handle('zenoh-command:create-task', (_event, options) => {
  return requestZenohTaskCreate(options)
})

ipcMain.handle('zenoh-command:run-task', (_event, options) => {
  return requestZenohTaskRun(options)
})

ipcMain.handle('zenoh-command:cancel-task', (_event, options) => {
  return requestZenohTaskCancel(options)
})

ipcMain.handle('zenoh-command:delete-task', (_event, options) => {
  return requestZenohTaskDelete(options)
})

ipcMain.handle('zenoh-command:set-area-display-name', (_event, options) => {
  return requestZenohStorageAreaDisplayName(options)
})

ipcMain.handle('zenoh-command:reinit-storage', (_event, options) => {
  return requestZenohStorageReinit(options)
})

ipcMain.handle('zenoh-command:get-point-cloud-roi', (_event, options) => {
  return requestZenohPointCloudRoi(options)
})

ipcMain.handle('zenoh-command:publish-lift-request', (_event, options) => {
  return { ok: publishZenohFleetLiftRequest(options) }
})

ipcMain.handle('zenoh-command:publish-door-request', (_event, options) => {
  return { ok: publishZenohFleetDoorRequest(options) }
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

ipcMain.handle('robot-parameters:fetch', (_event, options) => {
  return fetchRobotParameters(options)
})

ipcMain.handle('robot-parameters:fetch-heads', (_event, options) => {
  return fetchRobotParameterHeads(options)
})

ipcMain.handle('robot-parameters:fetch-by-heads', (_event, options) => {
  return fetchRobotParametersByHeads(options)
})

ipcMain.handle('robot-parameters:update', (_event, options) => {
  return updateRobotParameter(options)
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
