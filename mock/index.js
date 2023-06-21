import http from 'node:http'
import console from 'node:console'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { parse } from 'url'

const host = 'localhost'
const port = 1234
const dirPath = path.join(process.cwd(), 'mock')

const server = http.createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')
  res.setHeader('Access-Control-Allow-Credentials', true)

  if (req.url.includes('/deploy/getMapDataWithDetail')) {
    res.setHeader('Content-Type', 'application/json')
    fs.readFile(`${dirPath}/grid.json`, (_, data) => {
      res.end(data)
    })
  }
  else if (req.url === '/deploy/getMaps') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      code: 0,
      data: [
        { id: 1, name: '地图1' },
        { id: 2, name: '地图2' }
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
  else if (req.url === '/parameter/params') {
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'GET') {
      fs.readFile(`${dirPath}/params.json`, (_, data) => {
        res.end(data.toString())
      })
    }
    else if (req.method === 'POST') {
    }
  }
  else {
    res.end('Hello World')
  }
})

const mapWss = new WebSocketServer({ noServer: true })
const robotWss = new WebSocketServer({ noServer: true })
mapWss.on('connection', (ws) => {
  ws.on('error', console.error);

  ws.send('some map data')
})
robotWss.on('connection', (ws) => {
  ws.on('error', console.error);

  ws.send('some robot data')
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
  } else {
    socket.destroy()
  }
});

server.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`)
})
