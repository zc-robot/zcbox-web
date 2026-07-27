const { Buffer } = require('node:buffer')
const nodeNet = require('node:net')

function normalizeRequest(value) {
  const host = typeof value?.host === 'string' ? value.host.trim() : ''
  const port = Number(value?.port)
  const timeoutMs = Number(value?.timeoutMs)
  const frameHex = typeof value?.frameHex === 'string' ? value.frameHex.trim() : ''

  if (!host)
    throw new Error('Modbus transport requires host')
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Modbus transport requires a valid port')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000)
    throw new Error('Modbus transport requires a timeout from 100 to 30000ms')
  if (!/^(?:[0-9a-fA-F]{2}){8,}$/.test(frameHex))
    throw new Error('Modbus transport requires a valid frame')

  return {
    host,
    port,
    timeoutMs,
    frame: Buffer.from(frameHex, 'hex'),
  }
}

function exchangeFrame(request) {
  const { host, port, timeoutMs, frame } = normalizeRequest(request)

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
      const error = new Error(`Modbus request timed out after ${timeoutMs}ms`)
      error.code = 'ETIMEDOUT'
      finish(error)
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

      const frameLength = 6 + buffer.readUInt16BE(4)
      if (buffer.length >= frameLength)
        finish(null, buffer.subarray(0, frameLength))
    })

    socket.connect(port, host, () => {
      socket.write(frame)
    })
  })
}

if (process.parentPort) {
  process.parentPort.on('message', async (event) => {
    try {
      const response = await exchangeFrame(event.data)
      process.parentPort.postMessage({
        ok: true,
        responseHex: response.toString('hex'),
      })
    }
    catch (error) {
      process.parentPort.postMessage({
        ok: false,
        code: error?.code,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })
}

module.exports = {
  exchangeFrame,
  normalizeRequest,
}
