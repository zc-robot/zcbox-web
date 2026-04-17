import http from 'node:http'
import console from 'node:console'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { createRobotPoseBridge } from './mqttRobotPose.js'

const host = 'localhost'
const port = 1234
const dirPath = path.join(process.cwd(), 'mock')
const robotDataSource = process.env.ROBOT_DATA_SOURCE || 'mqtt'

const server = http.createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')
  res.setHeader('Access-Control-Allow-Credentials', true)

  if (req.url.includes('/deploy/getMapDataWithDetail')) {
    // Get request latest segment
    const segments = req.url.split('/')
    const segment = segments[segments.length - 1]
    res.setHeader('Content-Type', 'application/json')
    fs.readFile(`${dirPath}/grid${segment}.json`, (_, data) => {
      res.end(data)
    })
  }
  else if (req.url === '/deploy/getMaps') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      code: 0,
      data: [
        { id: 3, name: '地图3' },
        { id: 4, name: '地图4' },
      ]
    }))
  }
  else if (req.url === '/deploy/get_robot_data') {
    res.setHeader('Content-Type', 'application/json')
    fs.readFile(`${dirPath}/pose.json`, (_, data) => {
      res.end(JSON.stringify({
        robot_pose: JSON.parse(data.toString()),
      }))
    })
  }
  else if (req.url === '/parameter/get_params') {
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'GET') {
      fs.readFile(`${dirPath}/params.json`, (_, data) => {
        res.end(data.toString())
      })
    }
    else if (req.method === 'POST') {
    }
  }
  else if (req.url === '/deploy/getAllActions') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      code: 0,
      data: [
        { id: 1, name: '动作1' },
        { id: 2, name: '动作2' }
      ]
    }))
  }
  else {
    res.end('{"code": 0}')
  }
})

const mapWss = new WebSocketServer({ noServer: true })
const robotWss = new WebSocketServer({ noServer: true })
const controlWss = new WebSocketServer({ noServer: true })

function startMockRobotStream(ws) {
  const positionData = fs.readFileSync(`${dirPath}/positions.json`).toString()
  const positions = JSON.parse(positionData)
  const basePose = JSON.parse(fs.readFileSync(`${dirPath}/pose.json`).toString())
  let index = 0

  const timer = setInterval(() => {
    const obj = {
      ...basePose,
      pose: {
        ...basePose.pose,
        orientation: positions[index],
      },
    }
    ws.send(JSON.stringify(obj))
    index = (index + 1) % positions.length
  }, 500)

  const stop = () => clearInterval(timer)
  ws.once('close', stop)
  ws.once('error', stop)
  return stop
}

mapWss.on('connection', (ws) => {
  ws.on('error', console.error);

  fs.readFile(`${dirPath}/grid3.json`, (_, data) => {
    const obj = JSON.parse(data.toString())
    const objData = JSON.stringify(obj.data.data)
    setInterval(() => {
      ws.send(objData)
    }, 500)
  })
})
robotWss.on('connection', (ws, request) => {
  ws.on('error', console.error);

  if (robotDataSource === 'mock') {
    startMockRobotStream(ws)
    return
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host}`)
  const requestedHost = requestUrl.searchParams.get('mqtt_host')
  const fallbackHost = request.headers.host?.split(':')[0]
  const mqttHost = requestedHost || fallbackHost || host

  const bridge = createRobotPoseBridge({
    host: mqttHost,
    onPose: (robotInfo) => {
      if (ws.readyState === 1)
        ws.send(JSON.stringify(robotInfo))
    },
    onError: (error) => {
      console.error(`MQTT robot pose bridge failed for ${mqttHost}:`, error)
      if (ws.readyState === 1)
        ws.close(1011, 'MQTT bridge unavailable')
    },
  })

  const closeBridge = () => bridge.close()
  ws.once('close', closeBridge)
  ws.once('error', closeBridge)
})
controlWss.on('connection', (ws) => {
  ws.on('message', (message) => {
    console.log('received: %s', message);
  })
})

server.on('upgrade', function upgrade(request, socket, head) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`)
  const { pathname } = requestUrl

  if (pathname === '/map') {
    mapWss.handleUpgrade(request, socket, head, function done(ws) {
      mapWss.emit('connection', ws, request)
    })
  } else if (pathname === '/robot_data') {
    robotWss.handleUpgrade(request, socket, head, function done(ws) {
      robotWss.emit('connection', ws, request)
    })
  } else if (pathname === '/velocity_control') {
    controlWss.handleUpgrade(request, socket, head, function done(ws) {
      controlWss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
});

server.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`)
})
