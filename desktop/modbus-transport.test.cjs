const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const nodeNet = require('node:net')
const test = require('node:test')
const { exchangeFrame, normalizeRequest } = require('./modbus-transport.cjs')

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve(server.address())
    })
  })
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error)
        reject(error)
      else
        resolve()
    })
  })
}

test('exchanges one complete Modbus TCP frame', async (t) => {
  const requestFrame = Buffer.from('000100000006010103240001', 'hex')
  const responseFrame = Buffer.from('00010000000401010100', 'hex')
  const server = nodeNet.createServer((socket) => {
    socket.once('data', (data) => {
      assert.deepEqual(data, requestFrame)
      socket.end(responseFrame)
    })
  })
  t.after(() => close(server))

  const address = await listen(server)
  const response = await exchangeFrame({
    host: '127.0.0.1',
    port: address.port,
    timeoutMs: 1000,
    frameHex: requestFrame.toString('hex'),
  })

  assert.deepEqual(response, responseFrame)
})

test('rejects malformed requests before opening a socket', () => {
  assert.throws(
    () => normalizeRequest({
      host: '127.0.0.1',
      port: 502,
      timeoutMs: 1000,
      frameHex: 'not-hex',
    }),
    /valid frame/,
  )
})
