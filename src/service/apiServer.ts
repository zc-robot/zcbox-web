import ky from 'ky'
import type { NavPath, NavPoint, NavTask, OccupancyGridMessage, RobotInfoMessage } from '@/types'

interface Resp<T> {
  code: number
  data: T
}

class ApiServer {
  //domain = 'http://localhost:1234'
  domain = 'http://10.211.55.14:1234'
  client = ky.create({ prefixUrl: this.domain })

  // get_map
  fetchMap = async () => {
    const json = await this.client.get('get_map').json()
    return json as OccupancyGridMessage
  }

  // get_robot_data
  fetchRobotData = async () => {
    const json = await this.client.get('get_robot_data').json()
    return json as RobotInfoMessage
  }

  submitNavgationInfo = async (data: object) => {
    const json = await this.client.post('save_deployment', { json: data }).json()
    return json
  }

  fetchNavigationInfo = async () => {
    const json = await this.client.get('get_deployment').json<Resp<{ points: NavPoint[]; paths: NavPath[] }>>()
    if (json.code === 0)
      return json.data
    return { points: [], paths: [] }
  }

  submitTasks = async (data: object) => {
    const json = await this.client.post('save_tasks', { json: data }).json()
    return json
  }

  fetchTasks = async () => {
    const json = await this.client.get('get_tasks').json<Resp<NavTask[]>>()
    if (json.code === 0)
      return json.data
    return []
  }

  executeTask = async (id: string) => {
    const json = await this.client.post('execute_task', { json: { id } }).json()
    return json
  }

  stopTask = async () => {
    const json = await this.client.get('stop_task').json()
    return json
  }

  sendRobotVelocity = async (line: number, angular: number) => {
    const line_string = line.toFixed(1)
    const angular_string = angular.toFixed(1)
    const json = await this.client.get(`velocity_control/${line_string}/${angular_string}`).json()
    return json
  }
}

export default new ApiServer()
