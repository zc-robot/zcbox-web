import ky from 'ky'
import type { MapData, MapDataDetail, RobotParams } from '@/types'
import { useBoundStore } from '@/store'

interface Resp<T> {
  code: number
  data: T
}

class ApiServer {
  get wsDomain() {
    let d = useBoundStore.getState().wsDomain
    if (d === '')
      d = import.meta.env.VITE_WS_DOMAIN || 'ws://localhost:1234'

    if (d.endsWith('/'))
      d = d.slice(0, -1)
    return d
  }

  private get client() {
    let domain = useBoundStore.getState().apiDomain
    if (domain === '')
      domain = import.meta.env.VITE_API_DOMAIN || 'http://localhost:1234'
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

  confirmStatus = async () => {
    const json = await this.client.get('deploy/confirmStatus').json()
    return json
  }

  submitTask = async (data: object) => {
    const json = await this.client.post('deploy/saveTask', { json: data }).json()
    return json
  }

  executeTask = async (id: string, repeat: boolean) => {
    const json = await this.client.post('deploy/executeTask', { json: { uid: id, repeat } }).json()
    return json
  }

  stopTask = async () => {
    const json = await this.client.get('deploy/stopTask').json()
    return json
  }

  fetchParams = async () => {
    const json = await this.client.get('parameter/get_params').json<Resp<RobotParams>>()
    if (json.code === 0)
      return json.data
    return null
  }

  uploadParams = async (params: RobotParams) => {
    const json = await this.client.post('parameter/get_params', { json: params }).json()
    return json
  }
}

export default new ApiServer()
