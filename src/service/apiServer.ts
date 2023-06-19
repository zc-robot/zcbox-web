import ky from 'ky'
import type { MapData, MapDataDetail, RobotParams } from '@/types'
import { useBoundStore } from '@/store'

interface Resp<T> {
  code: number
  data: T
}

class ApiServer {
  private get client() {
    const domain = useBoundStore.getState().apiDomain
    return ky.create({ prefixUrl: domain })
  }

  fetchMapList = async () => {
    const json = await this.client.get('deploy/getMaps').json<Resp<MapData[]>>()
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
    const json = await this.client.get(`deploy/getMapDataWithDetail/${id}`).json<Resp<MapDataDetail>>()
    return json.data
  }

  saveMap = async (name: string) => {
    const json = await this.client.get(`deploy/saveMap/${name}`).json()
    return json
  }

  submitProfile = async (data: object) => {
    const json = await this.client.post('deploy/saveDeploymentProfile', { json: data }).json()
    return json
  }

  submitTasks = async (data: object) => {
    const json = await this.client.post('deploy/saveTasks', { json: data }).json()
    return json
  }

  executeTask = async (id: string) => {
    const json = await this.client.post('deploy/execute_task', { json: { id } }).json()
    return json
  }

  stopTask = async () => {
    const json = await this.client.get('deploy/stop_task').json()
    return json
  }

  fetchParams = async () => {
    const json = await this.client.get('parameter/params').json<Resp<RobotParams>>()
    if (json.code === 0)
      return json.data
    return null
  }

  uploadParams = async (params: RobotParams) => {
    const json = await this.client.post('parameter/params', { json: params }).json()
    return json
  }
}

export default new ApiServer()
