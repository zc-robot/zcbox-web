import ky from 'ky'
import type { CurrentMapData, MapData, MapDataDetail, MapListItem, NavProfile, PointAction, PoseMessage, QuaternionMessage, RobotParams } from '@/types'
import { useBoundStore } from '@/store'

interface Resp<T> {
  code: number
  message: string
  data: T
}

export interface ExecuteWaypointTaskPayload {
  task_uid: string
  is_repeat: boolean
  wps: Array<{
    pose: {
      position: {
        x: number
        y: number
      }
      orientation: QuaternionMessage
    }
    is_dest: boolean
    nav_type: 'auto' | 'manually'
    actions: PointAction[]
    precise_xy: number
    precise_rad: number
    is_reverse: boolean
    inflation_radius: number
    map: string
    uid: string
  }>
}

export interface ShelfState {
  shelf_present: boolean
  stock: number
  lift_enabled: boolean
  coil_804?: boolean
  coil_805?: boolean
  coil_806?: boolean
  coil_807?: boolean
  lift_real_height: number
  lift_target_height: number
  coil_address: number
  holding_register_address: number
  lift_enable_coil_address: number
  coil_804_address?: number
  coil_805_address?: number
  coil_806_address?: number
  coil_807_address?: number
  lift_real_height_register_address: number
  lift_target_height_register_address: number
  source?: 'desktop-modbus' | 'http'
}

export interface RmfBuildingYamlUploadResponse {
  ok: boolean
  returncode: number
  stdout?: string
  stderr?: string
  saved_images?: string[]
  referenced_images?: string[]
  missing_images?: string[]
  [key: string]: unknown
}

export interface RmfBuildingMapImageUpload {
  filename: string
  blob: Blob
}

export interface SavedMapFilesUpdate {
  localizationPng?: Blob
  localizationYaml?: Blob
  navigationPng?: Blob
  navigationYaml?: Blob
}

export interface SavedMapFilesUpdateResponse {
  map_name: string
  updated?: Record<string, unknown>
  database_record?: Partial<MapListItem> & { name?: string }
  [key: string]: unknown
}

export interface FleetReferenceCoordinatesResponse {
  ok?: boolean
  code?: number
  message?: string
  error?: string
  data?: unknown
  [key: string]: unknown
}

interface ZenohNamespaceResponse {
  namespace: string
}

export interface CameraGatewayInfo {
  node?: string
  http_port: number
  rtsp_port: number
  preview_fps?: number
  live_fps?: number
}

export interface CameraSource {
  id: string
  topic: string
  ros_type: string
  adapter: string
  available: boolean
  active: boolean
  subscription_active?: boolean
  viewers?: number
  latest_frame?: {
    seq: number
    width: number
    height: number
    encoding: string
    fps: number
    last_frame_age_ms: number
  }
  paths: {
    snapshot: string
    preview: string
    start: string
    stop: string
    live: string
  }
  outputs?: {
    live?: {
      kind: 'rtsp'
      path: string
      port: number
      url_template?: string
      shared: boolean
      requires_start?: boolean
    }
  }
}

export interface CameraSourcesResponse {
  sources: CameraSource[]
  gateway: CameraGatewayInfo
}

export interface CameraStreamResponse {
  ok: boolean
  source_id: string
  active: boolean
  live?: {
    kind: 'rtsp'
    path: string
    port: number
    url: string
    shared: boolean
  }
  message?: string
  state?: string
}

export interface ComposeMapSite {
  site: string
  file_count: number
  total_bytes: number
  modified_time: number
}

export interface ComposeMapFile {
  path: string
  type: string
  size: number
  modified_time: number
}

export interface ComposeMapSiteWithFiles extends ComposeMapSite {
  files: ComposeMapFile[]
}

export interface FleetConfigResponse {
  ok: boolean
  path: string
  size: number
  modified_time: number
  content: string
  error?: string
}

export interface FleetConfigWriteResponse {
  ok: boolean
  path: string
  size: number
  modified_time: number
  backup_path: string | null
  dry_run?: boolean
  current_modified_time?: number
  error?: string
}

interface ComposeMapSitesResponse {
  ok: boolean
  root: string
  sites: ComposeMapSite[]
  error?: string
}

interface ComposeMapFilesResponse {
  ok: boolean
  site: string
  path: string
  files: ComposeMapFile[]
  error?: string
}

type RawMapListItem = MapListItem & {
  map_id?: number
}

class ApiServer {
  private get fallbackRealtimeUrl() {
    try {
      return new URL(this.wsDomain)
    }
    catch {
      return null
    }
  }

  private get derivedRealtimeHost() {
    const state = useBoundStore.getState()

    if (state.isGetDomainAuto && typeof window !== 'undefined') {
      if (window.location.hostname)
        return window.location.hostname

      return import.meta.env.VITE_DESKTOP_HOST || this.fallbackRealtimeUrl?.hostname || '127.0.0.1'
    }

    return this.fallbackRealtimeUrl?.hostname || '127.0.0.1'
  }

  get wsDomain() {
    let d = useBoundStore.getState().wsDomain
    if (d === '')
      d = import.meta.env.VITE_WS_DOMAIN || 'ws://localhost:1234'

    if (d.endsWith('/'))
      d = d.slice(0, -1)
    return d
  }

  get robotFsmWsUrl() {
    return `${this.wsDomain}/robot_fsm`
  }

  get localizationQualityWsUrl() {
    return `${this.wsDomain}/localization_quality`
  }

  get defaultRmfWebVizHost() {
    return this.derivedRealtimeHost
  }

  private get robotHttpBaseUrl() {
    return `http://${this.derivedRealtimeHost}:1234`
  }

  private get cameraGatewayHost() {
    return this.derivedRealtimeHost
  }

  private get cameraGatewayPort() {
    return 8083
  }

  private get cameraGatewayBaseUrl() {
    return `http://${this.cameraGatewayHost}:${this.cameraGatewayPort}`
  }

  private get composeControlHost() {
    return this.controllerHost
  }

  private get composeControlPort() {
    return 4999
  }

  private get composeControlBaseUrl() {
    return `http://${this.composeControlHost}:${this.composeControlPort}`
  }

  private get composeControlToken() {
    if (typeof window !== 'undefined') {
      const savedToken = window.localStorage.getItem('zcbox.composeControlToken')?.trim()
      if (savedToken)
        return savedToken
    }

    return import.meta.env.VITE_COMPOSE_CONTROL_TOKEN || '1234567890'
  }

  private get controllerHost() {
    const state = useBoundStore.getState()
    if (state.nestControllerIp)
      return state.nestControllerIp

    if (state.apiDomain) {
      try {
        return new URL(state.apiDomain).hostname
      }
      catch {}
    }

    return this.derivedRealtimeHost
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

  private async requestCameraGateway<T>(path: string, method: 'GET' | 'POST' = 'GET') {
    const requestPath = path.startsWith('/') ? path : `/${path}`
    if (window.zcDesktop?.requestCameraGateway) {
      const response = await window.zcDesktop.requestCameraGateway<T>({
        host: this.cameraGatewayHost,
        port: this.cameraGatewayPort,
        path: requestPath,
        method,
      })
      return response.body
    }

    const url = new URL(requestPath, this.cameraGatewayBaseUrl)
    return ky(url.toString(), {
      method,
      timeout: 10000,
    }).json<T>()
  }

  private async fetchCameraGatewayDataUrl(path: string) {
    const requestPath = path.startsWith('/') ? path : `/${path}`
    const url = new URL(requestPath, this.cameraGatewayBaseUrl)
    url.searchParams.set('ts', String(Date.now()))

    if (window.zcDesktop?.fetchCameraGatewayBinary) {
      const response = await window.zcDesktop.fetchCameraGatewayBinary({
        host: this.cameraGatewayHost,
        port: this.cameraGatewayPort,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
      })
      return `data:${response.contentType};base64,${response.data}`
    }

    const response = await ky(url.toString(), {
      timeout: 10000,
    }).blob()

    return URL.createObjectURL(response)
  }

  private async requestComposeControl<T>(path: string, options: { method?: 'GET' | 'PUT' | 'POST'; json?: unknown } = {}) {
    const requestPath = path.startsWith('/') ? path : `/${path}`
    const token = this.composeControlToken
    const method = options.method ?? 'GET'
    if (window.zcDesktop?.requestComposeControl) {
      const response = await window.zcDesktop.requestComposeControl<T>({
        host: this.composeControlHost,
        port: this.composeControlPort,
        path: requestPath,
        method,
        token,
        json: options.json,
      })
      return response.body
    }

    const url = new URL(requestPath, this.composeControlBaseUrl)
    const headers: Record<string, string> = {
      accept: 'application/json',
    }
    if (token)
      headers.authorization = `Bearer ${token}`

    return ky(url.toString(), {
      method,
      timeout: 10000,
      headers,
      json: options.json,
    }).json<T>()
  }

  cameraGatewayUrl = (path: string, cacheBust = false) => {
    const url = new URL(path, this.cameraGatewayBaseUrl)
    if (cacheBust)
      url.searchParams.set('ts', String(Date.now()))

    return url.toString()
  }

  fetchCameraSources = async () => {
    return this.requestCameraGateway<CameraSourcesResponse>('/api/v1/sources')
  }

  startCameraStream = async (source: CameraSource) => {
    return this.requestCameraGateway<CameraStreamResponse>(source.paths.start, 'POST')
  }

  stopCameraStream = async (source: CameraSource) => {
    return this.requestCameraGateway<CameraStreamResponse>(source.paths.stop, 'POST')
  }

  fetchCameraSnapshotDataUrl = async (source: CameraSource) => {
    return this.fetchCameraGatewayDataUrl(source.paths.snapshot)
  }

  fetchComposeMapSites = async () => {
    const json = await this.requestComposeControl<ComposeMapSitesResponse>('/api/maps/sites')
    if (!json.ok)
      throw new Error(json.error || 'Failed to fetch map sites')

    return json.sites
  }

  fetchComposeMapFiles = async (site: string) => {
    const encodedSite = encodeURIComponent(site)
    const json = await this.requestComposeControl<ComposeMapFilesResponse>(`/api/maps/${encodedSite}/files`)
    if (!json.ok)
      throw new Error(json.error || `Failed to fetch map files for ${site}`)

    return json.files
  }

  fetchComposeMapSitesWithFiles = async () => {
    const sites = await this.fetchComposeMapSites()
    return Promise.all(sites.map(async site => ({
      ...site,
      files: await this.fetchComposeMapFiles(site.site),
    } satisfies ComposeMapSiteWithFiles)))
  }

  fetchFleetConfig = async () => {
    const json = await this.requestComposeControl<FleetConfigResponse>('/api/fleet-config')
    if (!json.ok)
      throw new Error(json.error || 'Failed to fetch rmf.yaml')

    return json
  }

  updateFleetConfig = async (content: string, expectedModifiedTime?: number, dryRun = false) => {
    const json = await this.requestComposeControl<FleetConfigWriteResponse>('/api/fleet-config', {
      method: 'PUT',
      json: {
        content,
        expected_modified_time: expectedModifiedTime,
        backup: true,
        dry_run: dryRun,
      },
    })
    if (!json.ok)
      throw new Error(json.error || 'Failed to save rmf.yaml')

    return json
  }

  updateFleetReferenceCoordinates = async (maps: string[], backup = false) => {
    const json = await this.requestComposeControl<FleetReferenceCoordinatesResponse>('/api/fleet-config/reference-coordinates', {
      method: 'PUT',
      json: {
        maps,
        backup,
      },
    })

    if (json.ok === false)
      throw new Error(json.error || json.message || 'Failed to update reference coordinates')
    if (typeof json.code === 'number' && json.code !== 0)
      throw new Error(json.message || json.error || 'Failed to update reference coordinates')

    return json
  }

  fetchMapListNew = async () => {
    const json = await this.client.get('map/v2/getMapList').json<Resp<RawMapListItem[]> | RawMapListItem[]>()
    const maps = Array.isArray(json) ? json : json.data
    return maps.map(map => ({
      ...map,
      id: map.id ?? map.map_id,
    })) as MapListItem[]
  }

  fetchMapList = async () => {
    const json = await this.client.get('deploy/getMaps').json<Resp<MapData[]>>()
    return json.data
  }

  fetchCurrentMap = async () => {
    const json = await this.client.get('deploy/getCurrentMap').json<Resp<CurrentMapData>>()
    return json.data
  }

  fetchRunningState = async () => {
    const json = await this.client.get('isRunning').json<Resp<string>>()
    return json
  }

  fetchZenohNamespace = async () => {
    const json = await this.client.get('zenoh/zenoh').json<Resp<ZenohNamespaceResponse>>()
    return json.data.namespace
  }

  downloadMap = async (filepath: string) => {
    const url = `map/download?filename=${filepath}`
    const response = await this.client.get(url).blob()
    return response
  }

  updateSavedMapFiles = async (mapName: string, files: SavedMapFilesUpdate) => {
    const formData = new FormData()
    const safeBaseName = mapName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'map'
    formData.append('map_name', mapName)

    if (files.localizationPng)
      formData.append('localization_png', files.localizationPng, `${safeBaseName}.png`)
    if (files.localizationYaml)
      formData.append('localization_yaml', files.localizationYaml, `${safeBaseName}.yaml`)
    if (files.navigationPng)
      formData.append('navigation_png', files.navigationPng, `${safeBaseName}.png`)
    if (files.navigationYaml)
      formData.append('navigation_yaml', files.navigationYaml, `${safeBaseName}.yaml`)

    const json = await this.client.post('slam/updateMapFiles', {
      body: formData,
      timeout: 30 * 60 * 1000,
    }).json<Resp<SavedMapFilesUpdateResponse>>()

    if (json.code !== 0)
      throw new Error(json.message || `更新 ${mapName} 地图文件失败`)

    return json.data
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

  navigation = async (id: number, model?: string) => {
    const params = useBoundStore.getState().mapParams
    const json = await this.client.get(`navigation/${id}/${model ?? params.model}`).json<Resp<unknown>>()
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

  changeMap = async (mapId: number) => {
    const json = await this.client.post('deploy/changeMap', {
      json: {
        map_id: mapId,
      },
    }).json<Resp<unknown>>()
    return json
  }

  renameMapName = async (mapId: number, newName: string) => {
    const maps = await this.fetchMapListNew()
    const targetMap = maps.find(map => map.id === mapId)
    if (!targetMap)
      throw new Error(`map ${mapId} not found`)

    const json = await this.client.get('map/changeMapName', {
      searchParams: {
        map_id: targetMap.id,
        new_name: newName,
      },
    }).json<Resp<{ map_id: number; new_name: string }>>()

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

  executeWaypointTask = async (payload: ExecuteWaypointTaskPayload) => {
    const json = await this.robotHttpClient.post('execute_task', {
      json: payload,
    }).json<Resp<null | string>>()
    return json
  }

  fetchShelfState = async () => {
    if (window.zcDesktop?.readShelfStateModbus) {
      try {
        const response = await window.zcDesktop.readShelfStateModbus({
          host: this.controllerHost,
          port: 502,
        })

        if (response.ok && response.state) {
          return {
            code: 0,
            message: 'success',
            data: response.state,
          }
        }
      }
      catch (error) {
        console.warn('Desktop Modbus shelf state read failed; falling back to HTTP API.', error)
      }
    }

    const json = await this.client.get('robot/shelf_state').json<Resp<ShelfState>>()
    if (json.data)
      json.data.source = 'http'
    return json
  }

  updateShelfState = async (payload: Pick<ShelfState, 'shelf_present' | 'stock' | 'lift_enabled' | 'lift_target_height'>) => {
    if (window.zcDesktop?.writeShelfStateModbus) {
      try {
        const response = await window.zcDesktop.writeShelfStateModbus({
          host: this.controllerHost,
          port: 502,
          state: payload,
        })

        if (response.ok && response.state) {
          return {
            code: 0,
            message: 'success',
            data: response.state,
          }
        }
      }
      catch (error) {
        console.warn('Desktop Modbus shelf state write failed; falling back to HTTP API.', error)
      }
    }

    const json = await this.client.post('robot/shelf_state', {
      json: payload,
    }).json<Resp<ShelfState>>()
    if (json.data)
      json.data.source = 'http'
    return json
  }

  updateModbusCoil = async (address: number, value: boolean) => {
    if (!window.zcDesktop?.writeModbusCoil) {
      return {
        code: 1,
        message: 'Modbus 线圈控制仅支持桌面应用',
        data: null,
      }
    }

    const response = await window.zcDesktop.writeModbusCoil({
      host: this.controllerHost,
      port: 502,
      address,
      value,
    })

    return {
      code: response.ok ? 0 : 1,
      message: response.ok ? 'success' : '写入线圈失败',
      data: {
        address: response.address,
        value: response.value,
      },
    }
  }

  updateModbusCoilSequence = async (steps: Array<{ address: number; value: boolean }>) => {
    if (!window.zcDesktop?.writeModbusCoilSequence) {
      return {
        code: 1,
        message: 'Modbus 线圈动作仅支持桌面应用',
        data: null,
      }
    }

    const response = await window.zcDesktop.writeModbusCoilSequence({
      host: this.controllerHost,
      port: 502,
      steps,
    })

    return {
      code: response.ok ? 0 : 1,
      message: response.ok ? 'success' : '写入线圈动作失败',
      data: response.state,
    }
  }

  publishActuatorReset = async () => {
    if (!window.zcDesktop?.publishZenohActuatorReset) {
      return {
        code: 1,
        message: '/actuators/reset 仅支持桌面应用',
        data: null,
      }
    }

    const response = await window.zcDesktop.publishZenohActuatorReset()
    return {
      code: response.ok ? 0 : 1,
      message: response.ok ? 'success' : 'Zenoh 未连接，无法发布 /actuators/reset',
      data: null,
    }
  }

  private buildRmfBuildingYamlUploadUrl(targetHost: string) {
    const trimmedHost = targetHost.trim()
    if (!trimmedHost)
      throw new Error('上传目标 IP不能为空')

    const url = new URL(/^https?:\/\//i.test(trimmedHost) ? trimmedHost : `http://${trimmedHost}`)
    if (!url.port)
      url.port = '6080'
    url.pathname = '/api/map/building_yaml'
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  uploadRmfBuildingYaml = async (targetHost: string, content: string, mapImages: RmfBuildingMapImageUpload[] = []) => {
    const formData = new FormData()
    formData.append(
      'file',
      new Blob([content], { type: 'application/x-yaml;charset=utf-8' }),
      'map.building.yaml',
    )
    for (const image of mapImages)
      formData.append('maps', image.blob, image.filename)

    const json = await ky.post(this.buildRmfBuildingYamlUploadUrl(targetHost), {
      body: formData,
      timeout: 30 * 60 * 1000,
    }).json<RmfBuildingYamlUploadResponse>()
    return json
  }

  fetchParams = async () => {
    const json = await this.client.get('parameter/get_params').json<Resp<RobotParams>>()
    if (json.code === 0)
      return json.data
    return null
  }

  fetchAllRobotParameters = async () => {
    const response = await this.client.get('param_handler/yamlGetAll', { retry: 0 })
    const contentType = response.headers.get('content-type')?.toLowerCase() || ''
    const content = await response.text()
    const normalizedContent = content.trim().toLowerCase()

    if (contentType.includes('text/html') || normalizedContent.startsWith('<!doctype html') || normalizedContent.startsWith('<html'))
      throw new Error('The robot controller returned a web page instead of parameter data. Check the connection and sign-in state.')
    if (!content.trim())
      throw new Error('The robot controller returned an empty parameter file.')

    return content
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
