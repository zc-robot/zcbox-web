import http from 'node:http'
import console from 'node:console'
import fs from 'node:fs'
import path from 'node:path'

const host = 'localhost'
const port = 1234
const dirPath = path.join(process.cwd(), 'mock')

const server = http.createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')
  res.setHeader('Access-Control-Allow-Credentials', true)

  if (req.url === '/get_map') {
    res.setHeader('Content-Type', 'application/json')
    fs.readFile(`${dirPath}/grid.json`, (_, data) => {
      res.end(data)
    })
  }
  else if (req.url === '/get_robot_data') {
    res.setHeader('Content-Type', 'application/json')
    fs.readFile(`${dirPath}/pose.json`, (_, data) => {
      res.end(JSON.stringify({
        robot_pose: JSON.parse(data.toString()),
      }))
    })
  }
  else {
    res.end('Hello World')
  }
})

server.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`)
})
