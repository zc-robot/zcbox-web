import ky from 'ky'
import type { MapData, MapDataDetail, RobotParams } from '@/types'

interface Resp<T> {
  code: number
  data: T
}

class ApiServer {
  domain = import.meta.env.VITE_API_DOMAIN || 'http://localhost:1234'
  client = ky.create({ prefixUrl: this.domain })

  fetchMapList = async () => {
    const json = await this.client.get('getMaps').json<Resp<MapData[]>>()
    return json.data
  }

  mapping = async (resolution: number) => {
    const json = await this.client.get(`mapping/${resolution}/diff`).json()
    return json
  }

  navigation = async (id: number) => {
    const json = await this.client.get(`navigation/${id}/diff`).json()
    return json
  }

  fetchMap = async (id: number) => {
    const json = await this.client.get(`getMapDataWithDetail/${id}`).json<Resp<MapDataDetail>>()
    return json.data
  }

  saveMap = async (name: string) => {
    const json = await this.client.get(`saveMap/${name}`).json()
    return json
  }

  submitProfile = async (data: object) => {
    const json = await this.client.post('save_deployment', { json: data }).json()
    return json
  }

  submitTasks = async (data: object) => {
    const json = await this.client.post('saveTasks', { json: data }).json()
    return json
  }

  executeTask = async (id: string) => {
    const json = await this.client.post('execute_task', { json: { id } }).json()
    return json
  }

  stopTask = async () => {
    const json = await this.client.get('stop_task').json()
    return json
  }

  fetchParams = async () => {
    const json = await this.client.get('get_params').json<Resp<RobotParams>>()
    if (json.code === 0)
      return json.data
    return null
  }

  uploadParams = async (params: RobotParams) => {
    const json = await this.client.post('get_params', { json: params }).json()
    return json
  }
}

export default new ApiServer()
