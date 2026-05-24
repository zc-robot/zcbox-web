const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const devServerUrl = 'http://127.0.0.1:5173'
const isWindows = process.platform === 'win32'
const pnpm = isWindows ? 'pnpm.cmd' : 'pnpm'
const electronBin = path.join(rootDir, 'node_modules', '.bin', isWindows ? 'electron.cmd' : 'electron')

let electronProcess = null
let shuttingDown = false

function waitForUrl(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const poll = () => {
      const request = http.get(url, (response) => {
        response.resume()
        resolve()
      })

      request.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${url}`))
          return
        }

        setTimeout(poll, 250)
      })
    }

    poll()
  })
}

const viteProcess = spawn(pnpm, ['dev', '--', '--host', '127.0.0.1', '--strictPort'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    BROWSER: 'none',
  },
})

function shutdown(code = 0) {
  if (shuttingDown)
    return

  shuttingDown = true

  if (electronProcess && !electronProcess.killed)
    electronProcess.kill()
  if (!viteProcess.killed)
    viteProcess.kill()

  process.exit(code)
}

viteProcess.on('exit', (code) => {
  if (!electronProcess)
    shutdown(code ?? 1)
})

waitForUrl(devServerUrl)
  .then(() => {
    electronProcess = spawn(electronBin, ['.'], {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: devServerUrl,
      },
    })

    electronProcess.on('exit', code => shutdown(code ?? 0))
  })
  .catch((error) => {
    console.error(error.message)
    shutdown(1)
  })

process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())
