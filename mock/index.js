import http from 'node:http'
import console from 'node:console'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { parse } from 'url'

const host = 'localhost'
const port = 5555
const dirPath = path.join(process.cwd(), 'mock')

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
robotWss.on('connection', (ws) => {
  ws.on('error', console.error);

  const positionData = fs.readFileSync(`${dirPath}/positions.json`).toString()
  const positions = JSON.parse(positionData)
  fs.readFile(`${dirPath}/pose.json`, (_, data) => {
    let obj = JSON.parse(data.toString())

    let index = 0
    setInterval(() => {
      obj.pose.orientation = positions[index]
      ws.send(JSON.stringify(obj))
      index = (index + 1) % positions.length
    }, 500)
  })
})
controlWss.on('connection', (ws) => {
  ws.on('message', (message) => {
    console.log('received: %s', message);
  })
})

server.on('upgrade', function upgrade(request, socket, head) {
  const { pathname } = parse(request.url)

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
