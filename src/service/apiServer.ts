import ky from 'ky'
import type { CurrentMapData, MapData, MapDataDetail, MapListItem, NavProfile, PointAction, PoseMessage, RobotParams } from '@/types'
import { useBoundStore } from '@/store'

interface Resp<T> {
  code: number
  message: string
  data: T
}

class ApiServer {
  private get derivedRealtimeHost() {
    const state = useBoundStore.getState()

    if (state.isGetDomainAuto && typeof window !== 'undefined')
      return window.location.hostname

    return new URL(this.wsDomain).hostname
  }

  private get derivedRealtimeWsProtocol() {
    const state = useBoundStore.getState()

    if (state.isGetDomainAuto && typeof window !== 'undefined')
      return window.location.protocol === 'https:' ? 'wss' : 'ws'

    return new URL(this.wsDomain).protocol === 'wss:' ? 'wss' : 'ws'
  }

  get wsDomain() {
    let d = useBoundStore.getState().wsDomain
    if (d === '')
      d = import.meta.env.VITE_WS_DOMAIN || 'ws://localhost:1234'

    if (d.endsWith('/'))
      d = d.slice(0, -1)
    return d
  }

  get robotDataWsUrl() {
    const url = new URL(`${this.wsDomain}/robot_data`)
    url.searchParams.set('mqtt_host', this.derivedRealtimeHost)

    return url.toString()
  }

  get mqttWsUrl() {
    return `${this.derivedRealtimeWsProtocol}://${this.derivedRealtimeHost}:9001`
  }

  get robotPoseMqttWsUrl() {
    return this.mqttWsUrl
  }

  private get robotHttpBaseUrl() {
    return `http://${this.derivedRealtimeHost}:1234`
  }

  private get client() {
    let domain = useBoundStore.getState().apiDomain
    if (domain === '')
      domain = import.meta.env.VITE_API_DOMAIN || 'http://localhost:1234'
    const timeoutDuration = 50000
    return ky.create({
      prefixUrl: domain,
      timeout: timeoutDuration,
      headers: {
        'x-api-key': '1234567890',
      },
    })
  }

  private get robotHttpClient() {
    const timeoutDuration = 50000
    return ky.create({
      prefixUrl: this.robotHttpBaseUrl,
      timeout: timeoutDuration,
      headers: {
        'x-api-key': '1234567890',
      },
    })
  }

  fetchMapListNew = async () => {
    const json = await this.client.get('map/getMapList').json<MapListItem[]>()
    return json
  }

  fetchMapList = async () => {
    const json = await this.client.get('deploy/getMaps').json<Resp<MapData[]>>()
    return json.data
  }

  fetchCurrentMap = async () => {
    const json = await this.client.get('deploy/getCurrentMap').json<Resp<CurrentMapData>>()
    return json.data
  }

  downloadMap = async (filepath: string) => {
    const url = `map/download?filename=${filepath}`
    const response = await this.client.get(url).blob()
    return response
  }

  fetchMapDeployment = async (mapId: number) => {
    const url = `deploy/getAllDeploymentOfMap/${mapId}`
    const json = await this.client.get(url).json<Resp<NavProfile[]>>()
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
    const timeoutDuration = 30 * 60 * 1000
    const json = await this.client.get(`deploy/getMapDataWithDetail/${id}`, {
      timeout: timeoutDuration,
    }).json<Resp<MapDataDetail>>()
    return json.data
  }

  saveMap = async (name: string) => {
    const json = await this.client.post('slam/saveMap', {
      json: {
        map_name: name,
      },
    }).json<Resp<{ map_name: string }>>()
    return json
  }

  deleteMap = async (id: number) => {
    const json = await this.client.get(`deploy/deleteMap/${id}`).json<Resp<null>>()
    return json
  }

  submitProfile = async (data: object) => {
    const json = await this.client.post('deploy/saveDeploymentProfile', { json: data }).json()
    return json
  }

  deleteProfile = async (id: string) => {
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

  deleteTask = async (id: string) => {
    const json = await this.client.get(`deploy/deleteTask/${id}`).json()
    return json
  }

  executeTask = async (id: string, repeat: boolean, use_path_map: boolean) => {
    const json = await this.client.post('deploy/executeTask', { json: { uid: id, repeat, use_path_map } }).json()
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

  setPose = async (pose: PoseMessage) => {
    const json = await this.robotHttpClient.post('set_pose', {
      json: {
        position: {
          x: pose.position.x,
          y: pose.position.y,
        },
        use_pyr: true,
        pyr: {
          yaw: pose.pyr.yaw,
        },
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
