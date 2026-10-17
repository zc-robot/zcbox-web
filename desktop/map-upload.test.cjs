const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

test('desktop map upload and RMF restart use native HTTP and preserve their request contracts', async (t) => {
  const requests = []
  let restartReady = true
  const server = http.createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request)
      chunks.push(chunk)
    requests.push({ url: request.url, headers: request.headers, body: Buffer.concat(chunks) })
    response.setHeader('content-type', 'application/json')
    const data = request.url === '/api/v1/rmf/restart'
      ? { container: 'rmf', restarted: true, running: restartReady, pose_subscriptions_ready: true, proxy: { running: true } }
      : { operation: { status: 'succeeded' } }
    response.end(JSON.stringify({ code: 0, data }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())

  const mainSource = readFileSync(path.join(__dirname, 'main.cjs'), 'utf8')
  const native = vm.createContext({ URL, Buffer, Uint8Array, AbortSignal, net: { fetch } })
  vm.runInContext(mainSource.slice(mainSource.indexOf('function normalizeGatewayHost'), mainSource.indexOf('async function fetchCameraGatewayBinary')), native)

  const source = readFileSync(path.join(__dirname, '../src/service/apiServer.ts'), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/import\.meta\.env/g, '{}')
  const renderer = vm.createContext({
    exports: {}, URL, URLSearchParams, Blob, Uint8Array,
    window: {
      localStorage: { getItem: () => 'test-upload-key' },
      zcDesktop: { requestComposeControl: native.requestComposeControl },
    },
    ky: { post: () => { throw new TypeError('Failed to fetch (renderer CORS)') } },
  })
  vm.runInContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, renderer)

  const image = Buffer.from([137, 80, 78, 71, 0, 255])
  const yaml = 'name: Test\nlevels: {}\n'
  const result = await renderer.exports.default.uploadRmfBuildingYaml(
    `http://127.0.0.1:${server.address().port}`,
    yaml,
    [{ filename: 'level.png', blob: new Blob([image], { type: 'image/png' }) }],
  )
  assert.equal(result.ok, true)
  assert.equal(requests.length, 3)
  assert.equal(requests[0].url, '/api/v1/maps/files?filename=level.png')
  assert.deepEqual(requests[0].body, image)
  assert.equal(requests[0].headers['content-type'], 'image/png')
  assert.equal(requests[1].url, '/api/v1/maps/files?filename=map.building.yaml')
  assert.equal(requests[1].body.toString(), yaml)
  assert.equal(requests[2].url, '/api/v1/maps/generate')
  assert.deepEqual(JSON.parse(requests[2].body), { source_filename: 'map.building.yaml' })
  for (const request of requests)
    assert.equal(request.headers['x-api-key'], 'test-upload-key')

  const restarted = await renderer.exports.default.restartRmf(`http://127.0.0.1:${server.address().port}`)
  assert.equal(restarted.running, true)
  assert.equal(requests[3].url, '/api/v1/rmf/restart')
  assert.equal(requests[3].body.length, 0)
  assert.equal(requests[3].headers['content-type'], undefined)
  assert.equal(requests[3].headers['x-api-key'], 'test-upload-key')
  restartReady = false
  await assert.rejects(renderer.exports.default.restartRmf(`http://127.0.0.1:${server.address().port}`), /启动状态尚未确认/)

  await assert.rejects(native.requestComposeControl({
    host: '127.0.0.1', port: server.address().port, method: 'POST',
    path: '/api/v1/maps/generate', body: new Uint8Array(image),
  }), /only allowed for map file uploads/)
})
