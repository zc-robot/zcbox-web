import ky from 'ky'
import type { MapData, MapDataDetail, PointAction, RobotParams } from '@/types'
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

  startMapping = async () => {
    const params = useBoundStore.getState().mapParams
    const json = await this.client.get(`mapping/${params.resolution}/${params.model}`).json()
    return json
  }

  stopMapping = async () => {
    const json = await this.client.get('stop').json()
    return json
  }

  navigation = async (id: number) => {
    const params = useBoundStore.getState().mapParams
    const json = await this.client.get(`navigation/${id}/${params.model}`).json()
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

  deleteMap = async (id: number) => {
    const json = await this.client.get(`deploy/deleteMap/${id}`).json()
    return json
  }

  submitProfile = async (data: object) => {
    const json = await this.client.post('deploy/saveDeploymentProfile', { json: data }).json()
    return json
  }

  deleteProfile = async (id: number) => {
    const json = await this.client.get(`deploy/deleteDeployment/${id}`).json()
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

  deleteTask = async (id: number) => {
    const json = await this.client.get(`deploy/deleteTask/${id}`).json()
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

  relocate = async (profile: string, point: string) => {
    const json = await this.client.post('deploy/relocateWithWP', {
      json: {
        deploy_uid: profile,
        wp_uid: point,
      },
    }).json()
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

  fetchActions = async () => {
    const json = await this.client.get('deploy/getAllActions').json<Resp<PointAction[]>>()
    if (json.code === 0)
      return json.data
    return null
  }
}

export default new ApiServer()
