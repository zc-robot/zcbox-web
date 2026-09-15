import ky from 'ky'
import { parseDocument } from 'yaml'
import { extractLatestRobotParameterYaml, normalizeRobotParametersByHeads, parseRobotParameterHeads, serializeRobotParameterUpdateBody } from './robotParameterPayload'
import type { RobotParameterNumericType } from './robotParameterPayload'
import { projectTaskManagerTaskDetail } from './taskManagerTaskDetail.js'
import type { CalculateDockingPoseData, CalculateDockingPoseRequest } from './dockingPose'
import type { CurrentMapData, MapDataDetail, MapListItem, NavProfile, PointAction, PoseMessage, QuaternionMessage, RobotParams, TaskManagerCancelTaskResult, TaskManagerCreateTaskPayload, TaskManagerCreateTaskResult, TaskManagerDeleteTaskResult, TaskManagerListActionsResult, TaskManagerRenameTaskResult, TaskManagerResolveRecoveryPayload, TaskManagerResolveRecoveryResult, TaskManagerRunTaskResult, TaskManagerTaskDetail, TaskManagerTaskInfo, TaskManagerUpdateTaskPayload, TaskManagerUpdateTaskResult } from '@/types'
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

export interface DeleteMapResponse {
  map_id: number
  map_name?: string
  removed_files?: string[]
  deleted_deployments?: number
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
  sha256?: string
  valid?: boolean
  validation_errors?: string[]
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
  sha256?: string
  valid?: boolean
  validation_errors?: string[]
  error?: string
}

export interface FleetConfigNamespaceData {
  path: string
  size: number
  modified_time: number
  key: string
  namespace: string
  site_id: string
  ros_namespace: string
  site_name?: string
  zenoh_namespace?: string
  mode?: string
  identity_revision?: number
  exists?: boolean
  valid?: boolean
  validation_error?: string | null
  backup_path?: string | null
}

export interface FleetConfigNamespaceResponse {
  ok?: boolean
  code?: number
  data: FleetConfigNamespaceData
  msg?: string
  message?: string
  error?: string
}

export type ComposeControlAction = 'up' | 'down' | 'stop' | 'restart'

export interface ComposeControlHealthResponse {
  ok: boolean
  allowed_compose_files: string[]
  error?: string
}

export interface ComposeControlAllowedFilesResponse {
  ok: boolean
  files: string[]
  error?: string
}

export interface ComposeControlCommandRequest {
  file?: string
  project?: string
  detach?: boolean
  build?: boolean
  pull?: boolean
  remove_orphans?: boolean
  volumes?: boolean
  services?: string[]
}

export interface ComposeControlCommandResponse {
  ok: boolean
  command?: string
  returncode?: number
  duration_sec?: number
  stdout?: string
  stderr?: string
  error?: string
}

export interface ComposeControlServiceStatus {
  id: string
  name: string
  project: string
  service: string
  state: string
  health: string
  status: string
  image: string
  exit_code?: unknown
  publishers?: unknown[]
}

export interface ComposeControlStatusResponse extends ComposeControlCommandResponse {
  file: string
  status: string
  running: boolean
  total: number
  running_count: number
  state_counts: Record<string, number>
  health_counts: Record<string, number>
  services: ComposeControlServiceStatus[]
}

export interface ComposeControlLogsRequest {
  file?: string
  project?: string
  service?: string
  tail?: number
  timestamps?: boolean
}

interface SystemControlEnvelope<T> {
  code?: number
  data?: T
  msg?: string
  message?: string
  error?: string
  ok?: boolean
}

interface SystemControlSite {
  name?: string
  site_id?: string
  zenoh_namespace?: string
  mode?: string
  identity_revision?: number
}

interface SystemControlSiteData {
  site?: SystemControlSite
  identity_migrated?: boolean
  profiles_invalidated?: boolean
}

interface SystemControlRawConfigData {
  content?: string
  sha256?: string
  valid?: boolean
  validation_errors?: string[]
  snapshot_path?: string | null
  backup_path?: string | null
}

interface SystemControlContainerService {
  name?: string
  allowed_operations?: string[]
  runtime_impacting?: boolean
  self_protected?: boolean
  state?: string
  health?: string
  detail?: string
  status?: string
  image?: string
}

interface SystemControlContainerDefinition {
  key?: string
  allowed_project_operations?: string[]
  volume_backup_required?: boolean
  services?: SystemControlContainerService[]
}

interface SystemControlContainersData {
  definitions?: SystemControlContainerDefinition[]
}

interface SystemControlOperation {
  id?: string
  kind?: string
  status?: string
  request?: unknown
  error?: unknown
  required_decision?: unknown
  progress?: unknown
  result?: unknown
}

interface SystemControlOperationData {
  operation?: SystemControlOperation
}

interface SystemControlMapFile {
  name?: string
  filename?: string
  path?: string
  content_type?: string
  size?: number
  size_bytes?: number
  modified_time?: number
  modified_at?: string
  updated_at?: string
  source_filename?: string
  sha256?: string
}

interface SystemControlMapFilesData {
  files?: SystemControlMapFile[]
}

interface SystemControlLogServicesData {
  definitions?: Array<{
    key?: string
    services?: string[]
  }>
}

interface SystemControlLogHistoryData {
  definition?: string
  service?: string
  tail?: number
  returned?: number
  lines?: string[]
}

interface SystemControlHealthData {
  service?: string
  status?: string
  setup_required?: boolean
  default_admin_key_active?: boolean
}

const siteConfigRawPath = '/api/v1/site/config/raw'
const defaultContainerDefinition = 'fleet-server'
const defaultRmfBuildingYamlFilename = 'map.building.yaml'

interface ZenohTaskServiceOptions {
  servicePath?: string
  timeoutMs?: number
}

interface ZenohTaskListRequestOptions extends ZenohTaskServiceOptions {
  robotNameFilter?: string
}

function normalizeZenohTaskListOptions(options: string | ZenohTaskListRequestOptions = ''): ZenohTaskListRequestOptions {
  return typeof options === 'string' ? { robotNameFilter: options } : options
}

function composeControlPath(path: string, params: Record<string, string | number | boolean | null | undefined> = {}) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '')
      return

    searchParams.set(key, String(value))
  })

  const query = searchParams.toString()
  return query ? `${path}?${query}` : path
}

function systemControlError(json: unknown, fallback: string) {
  if (json && typeof json === 'object') {
    const value = json as SystemControlEnvelope<unknown>
    return value.error || value.message || value.msg || fallback
  }

  return fallback
}

function unwrapSystemControl<T>(json: SystemControlEnvelope<T> | T, fallback: string): T {
  if (json && typeof json === 'object') {
    const value = json as SystemControlEnvelope<T>
    if (value.ok === false)
      throw new Error(systemControlError(value, fallback))
    if (typeof value.code === 'number') {
      if (value.code !== 0)
        throw new Error(systemControlError(value, fallback))

      if (value.data !== undefined)
        return value.data
    }
  }

  return json as T
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}

function revisionTimestamp() {
  return Date.now() / 1000
}

function parseServerTimestamp(value: string | undefined) {
  if (!value)
    return revisionTimestamp()

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp / 1000 : revisionTimestamp()
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = value || 'unknown'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function normalizeSystemControlMapFileType(file: SystemControlMapFile) {
  const contentType = file.content_type?.trim()
  if (contentType)
    return contentType

  const name = file.name || file.filename || file.path || ''
  const extension = name.split('.').pop()?.toLowerCase()
  return extension || 'file'
}

function normalizeSystemControlMapFile(file: SystemControlMapFile): ComposeMapFile {
  const path = file.name || file.filename || file.path || ''
  const modifiedTime = typeof file.modified_time === 'number'
    ? file.modified_time
    : parseServerTimestamp(file.modified_at || file.updated_at)

  return {
    path,
    type: normalizeSystemControlMapFileType(file),
    size: file.size_bytes ?? file.size ?? 0,
    modified_time: modifiedTime,
  }
}

function validateYamlContent(content: string) {
  const document = parseDocument(content)
  if (document.errors.length > 0)
    throw new Error(document.errors.map(error => error.message).join('; '))
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

  private async requestComposeControl<T>(path: string, options: { method?: 'GET' | 'PUT' | 'POST'; json?: unknown; timeout?: number } = {}) {
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
      headers['x-api-key'] = token

    return ky(url.toString(), {
      method,
      timeout: options.timeout ?? 10000,
      headers,
      json: options.json,
    }).json<T>()
  }

  private async fetchSystemControlContainers() {
    const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlContainersData>>('/api/v1/containers', {
      timeout: 30000,
    })
    return unwrapSystemControl(json, 'Failed to fetch container definitions')
  }

  private findSystemControlContainerDefinition(
    data: SystemControlContainersData,
    file = '',
    project = '',
  ) {
    const definitions = data.definitions ?? []
    const requested = [file, project]
      .map(value => value.trim())
      .filter(Boolean)

    return requested
      .map(key => definitions.find(definition => definition.key === key))
      .find(Boolean)
      ?? definitions.find(definition => definition.key === defaultContainerDefinition)
      ?? definitions[0]
  }

  private async fetchSystemControlLogServices() {
    const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlLogServicesData>>('/api/v1/logs/services', {
      timeout: 30000,
    })
    return unwrapSystemControl(json, 'Failed to fetch log services')
  }

  private async fetchSystemControlMapFiles() {
    const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlMapFilesData>>('/api/v1/maps/files', {
      timeout: 30000,
    })
    const data = unwrapSystemControl(json, 'Failed to fetch map files')
    return data.files ?? []
  }

  private normalizeSystemControlSiteData(data: SystemControlSiteData): FleetConfigNamespaceResponse {
    const site = data.site ?? {}
    const name = site.name || ''
    const siteId = site.site_id || name
    const zenohNamespace = site.zenoh_namespace || siteId || name

    return {
      ok: true,
      code: 0,
      data: {
        path: siteConfigRawPath,
        size: 0,
        modified_time: revisionTimestamp(),
        key: 'site.name',
        namespace: zenohNamespace,
        site_id: siteId,
        ros_namespace: zenohNamespace,
        site_name: name,
        zenoh_namespace: zenohNamespace,
        mode: site.mode,
        identity_revision: site.identity_revision,
        exists: Boolean(name || siteId),
        valid: Boolean(name || siteId),
        validation_error: null,
        backup_path: null,
      },
      msg: 'ok',
    }
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
    const files = await this.fetchSystemControlMapFiles()
    const normalizedFiles = files.map(normalizeSystemControlMapFile).filter(file => file.path)
    if (normalizedFiles.length === 0)
      return []

    let site = 'site'
    try {
      const response = await this.fetchFleetConfigNamespace()
      site = response.data.site_name || response.data.site_id || response.data.namespace || site
    }
    catch {}

    return [{
      site,
      file_count: normalizedFiles.length,
      total_bytes: normalizedFiles.reduce((sum, file) => sum + file.size, 0),
      modified_time: Math.max(...normalizedFiles.map(file => file.modified_time)),
    }]
  }

  fetchComposeMapFiles = async (_site: string) => {
    const files = await this.fetchSystemControlMapFiles()
    return files.map(normalizeSystemControlMapFile).filter(file => file.path)
  }

  fetchComposeMapSitesWithFiles = async () => {
    const sites = await this.fetchComposeMapSites()
    return Promise.all(sites.map(async site => ({
      ...site,
      files: await this.fetchComposeMapFiles(site.site),
    } satisfies ComposeMapSiteWithFiles)))
  }

  fetchComposeControlHealth = async () => {
    const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlHealthData>>('/health')
    const data = unwrapSystemControl(json, 'Failed to fetch system control health')

    return {
      ok: data.status === 'ok',
      allowed_compose_files: [],
      ...data,
    }
  }

  fetchComposeAllowedFiles = async () => {
    const data = await this.fetchSystemControlContainers()

    return (data.definitions ?? [])
      .map(definition => definition.key)
      .filter((key): key is string => Boolean(key))
  }

  fetchComposeStatus = async (file = '', project = '') => {
    const data = await this.fetchSystemControlContainers()
    const definition = this.findSystemControlContainerDefinition(data, file, project)
    const definitionKey = definition?.key || file || project || defaultContainerDefinition
    const services = (definition?.services ?? []).map((service) => {
      const serviceName = service.name || '--'
      return {
        id: `${definitionKey}:${serviceName}`,
        name: serviceName,
        project: definitionKey,
        service: serviceName,
        state: service.state || 'unknown',
        health: service.health || 'unknown',
        status: service.detail || service.status || service.state || '',
        image: service.image || '',
      } satisfies ComposeControlServiceStatus
    })
    const states = services.map(service => service.state || 'unknown')
    const health = services.map(service => service.health || 'unknown')
    const stateCounts = countBy(states)
    const healthCounts = countBy(health)
    const runningCount = services.filter(service => service.state === 'running').length
    const total = services.length
    const status = total === 0
      ? 'empty'
      : runningCount === total
        ? 'running'
        : runningCount > 0
          ? 'partial'
          : stateCounts.stopped === total
            ? 'stopped'
            : stateCounts.unavailable
              ? 'unavailable'
              : 'stopped'

    return {
      ok: true,
      command: 'GET /api/v1/containers',
      returncode: 0,
      stdout: JSON.stringify(definition ?? data, null, 2),
      stderr: '',
      file: definitionKey,
      status,
      running: runningCount > 0,
      total,
      running_count: runningCount,
      state_counts: stateCounts,
      health_counts: healthCounts,
      services,
    } satisfies ComposeControlStatusResponse
  }

  fetchComposeConfig = async (file = '', project = '') => {
    const data = await this.fetchSystemControlContainers()
    const definition = this.findSystemControlContainerDefinition(data, file, project)

    return {
      ok: true,
      command: 'GET /api/v1/containers',
      returncode: 0,
      stdout: JSON.stringify(definition ?? data, null, 2),
      stderr: '',
    } satisfies ComposeControlCommandResponse
  }

  fetchComposeLogs = async ({ file = '', project = '', service = '', tail = 200, timestamps = false }: ComposeControlLogsRequest = {}) => {
    const logs = await this.fetchSystemControlLogServices()
    const definitions = logs.definitions ?? []
    const requestedDefinition = [file, project].map(value => value.trim()).filter(Boolean)
    const definition = requestedDefinition
      .map(key => definitions.find(candidate => candidate.key === key))
      .find(Boolean)
      ?? definitions.find(candidate => candidate.key === defaultContainerDefinition)
      ?? definitions[0]
    const definitionKey = definition?.key || file || project || defaultContainerDefinition
    const availableServices = definition?.services ?? []
    const selectedServices = service.trim()
      ? [service.trim()]
      : availableServices

    if (selectedServices.length === 0)
      throw new Error(`No log services are available for ${definitionKey}`)

    const safeTail = Math.min(1000, Math.max(1, Math.floor(tail)))
    const histories = await Promise.all(selectedServices.map(async (serviceName) => {
      const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlLogHistoryData>>(
        composeControlPath('/api/v1/logs/history', {
          definition: definitionKey,
          service: serviceName,
          tail: safeTail,
        }),
        { timeout: 70000 },
      )
      return unwrapSystemControl(json, `Failed to fetch logs for ${serviceName}`)
    }))

    const stdout = histories
      .map(history => (history.lines ?? []).join('\n'))
      .filter(Boolean)
      .join('\n')

    return {
      ok: true,
      command: `GET /api/v1/logs/history definition=${definitionKey} services=${selectedServices.join(',')}`,
      returncode: 0,
      stdout,
      stderr: timestamps ? 'Timestamps are controlled by the server log format.' : '',
    } satisfies ComposeControlCommandResponse
  }

  runComposeCommand = async (action: ComposeControlAction, request: ComposeControlCommandRequest = {}) => {
    const containers = await this.fetchSystemControlContainers()
    const definition = this.findSystemControlContainerDefinition(containers, request.file, request.project)
    const definitionKey = definition?.key || request.file || request.project || defaultContainerDefinition
    const operation = action === 'up' ? 'start' : action
    const services = operation === 'down'
      ? undefined
      : request.services && request.services.length > 0
        ? request.services
        : (definition?.services ?? [])
            .filter(service => service.allowed_operations?.includes(operation))
            .map(service => service.name)
            .filter((name): name is string => Boolean(name))

    const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlOperationData>>('/api/v1/containers/operations', {
      method: 'POST',
      timeout: 120000,
      json: {
        definition: definitionKey,
        operation,
        services,
        remove_volumes: Boolean(request.volumes),
        confirm_volume_deletion: Boolean(request.volumes),
      },
    })
    const data = unwrapSystemControl(json, `Failed to run container ${operation}`)

    return {
      ok: true,
      command: `POST /api/v1/containers/operations ${definitionKey}:${operation}`,
      returncode: 0,
      stdout: JSON.stringify(data.operation ?? data, null, 2),
      stderr: '',
    } satisfies ComposeControlCommandResponse
  }

  fetchFleetConfig = async () => {
    const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlRawConfigData>>(siteConfigRawPath)
    const data = unwrapSystemControl(json, 'Failed to fetch site config')
    const content = data.content ?? ''

    return {
      ok: true,
      path: siteConfigRawPath,
      size: byteLength(content),
      modified_time: revisionTimestamp(),
      content,
      sha256: data.sha256,
      valid: data.valid,
      validation_errors: data.validation_errors,
    } satisfies FleetConfigResponse
  }

  updateFleetConfig = async (content: string, expectedRevision?: number | string, dryRun = false) => {
    validateYamlContent(content)
    if (dryRun) {
      return {
        ok: true,
        path: siteConfigRawPath,
        size: byteLength(content),
        modified_time: revisionTimestamp(),
        backup_path: null,
        dry_run: true,
        sha256: typeof expectedRevision === 'string' ? expectedRevision : undefined,
        valid: true,
        validation_errors: [],
      } satisfies FleetConfigWriteResponse
    }

    const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlRawConfigData>>(siteConfigRawPath, {
      method: 'PUT',
      json: {
        content,
        expected_sha256: typeof expectedRevision === 'string' ? expectedRevision : undefined,
        force: false,
        reason: null,
        confirm_identity_migration: true,
      },
    })
    const data = unwrapSystemControl(json, 'Failed to save site config')

    return {
      ok: true,
      path: siteConfigRawPath,
      size: byteLength(data.content ?? content),
      modified_time: revisionTimestamp(),
      backup_path: data.backup_path ?? data.snapshot_path ?? null,
      sha256: data.sha256,
      valid: data.valid,
      validation_errors: data.validation_errors,
    } satisfies FleetConfigWriteResponse
  }

  fetchFleetConfigNamespace = async () => {
    const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlSiteData>>('/api/v1/site')
    const data = unwrapSystemControl(json, 'Failed to fetch site')

    return this.normalizeSystemControlSiteData(data)
  }

  updateFleetConfigNamespace = async (namespace: string, _expectedModifiedTime?: number, dryRun = false) => {
    const name = namespace.trim()
    if (!name)
      throw new Error('Site name is required')

    const current = await this.fetchFleetConfigNamespace()
    if (dryRun) {
      return {
        ...current,
        data: {
          ...current.data,
          site_name: name,
          valid: true,
          validation_error: null,
        },
      } satisfies FleetConfigNamespaceResponse
    }

    const json = await this.requestComposeControl<SystemControlEnvelope<SystemControlSiteData>>('/api/v1/site', {
      method: 'PUT',
      json: {
        name,
        mode: current.data.mode || 'local',
        confirm_identity_migration: true,
      },
    })
    const data = unwrapSystemControl(json, 'Failed to save site name')

    return this.normalizeSystemControlSiteData(data)
  }

  updateFleetReferenceCoordinates = async (maps: string[], backup = false) => {
    return {
      ok: true,
      code: 0,
      message: 'System Control Server v1 map APIs do not mutate live fleet configuration. Reference coordinates must be changed through site config and apply.',
      data: {
        maps,
        backup,
        skipped: true,
      },
    } satisfies FleetReferenceCoordinatesResponse
  }

  fetchMapListNew = async () => {
    const json = await this.client.get('map/v2/getMapList').json<Resp<RawMapListItem[]> | RawMapListItem[]>()
    const maps = Array.isArray(json) ? json : json.data
    return maps.map(map => ({
      ...map,
      id: map.id ?? map.map_id,
    })) as MapListItem[]
  }

  fetchCurrentMap = async () => {
    const json = await this.client.get('map/getCurrentMap').json<Resp<CurrentMapData>>()
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
    const json = await this.client.delete(`map/v2/deleteMap/${id}`).json<Resp<DeleteMapResponse>>()
    return json
  }

  submitProfile = async (data: object) => {
    const json = await this.client.post('deploy/saveDeploymentProfile', { json: data }).json()
    return json
  }

  calculateDockingPose = async (request: CalculateDockingPoseRequest) => {
    let json: Resp<CalculateDockingPoseData>
    try {
      json = await this.client.post('deploy/calculateDockingPose', {
        json: request,
      }).json<Resp<CalculateDockingPoseData>>()
    }
    catch (error) {
      const response = typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: Response }).response
        : undefined
      if (response) {
        const body = await response.clone().json().catch(() => null) as { message?: unknown } | null
        if (typeof body?.message === 'string' && body.message.trim())
          throw new Error(body.message)
      }
      throw error
    }

    if (json.code !== 0 || !json.data)
      throw new Error(json.message || 'Failed to calculate the docking-start pose')

    return json.data
  }

  changeMap = async (mapId: number) => {
    const json = await this.client.post('map/changeMap', {
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

  listTasks = async (options: string | ZenohTaskListRequestOptions = ''): Promise<TaskManagerTaskInfo[]> => {
    if (!window.zcDesktop?.listZenohTasks)
      throw new Error('任务列表仅支持桌面应用')

    const requestOptions = normalizeZenohTaskListOptions(options)
    const response = await window.zcDesktop.listZenohTasks({
      host: this.controllerHost,
      robotNameFilter: requestOptions.robotNameFilter || '',
      servicePath: requestOptions.servicePath,
      timeoutMs: requestOptions.timeoutMs,
    })
    if (!response.success)
      throw new Error(response.message || '获取任务列表失败')

    return response.tasks
  }

  listActions = async (options: ZenohTaskServiceOptions = {}): Promise<TaskManagerListActionsResult> => {
    if (!window.zcDesktop?.listZenohActions)
      throw new Error('动作列表仅支持桌面应用')

    const response = await window.zcDesktop.listZenohActions({
      host: this.controllerHost,
      servicePath: options.servicePath,
      timeoutMs: options.timeoutMs,
    })
    if (!response.success)
      throw new Error(response.message || '获取动作列表失败')
    if (!response.ok)
      throw new Error(response.message || '任务管理器拒绝获取动作列表')

    return {
      ok: response.ok,
      actions: response.actions,
      message: response.message,
    }
  }

  getTask = async (taskId: string, options: ZenohTaskServiceOptions = {}): Promise<TaskManagerTaskDetail> => {
    if (!window.zcDesktop?.getZenohTask)
      throw new Error('任务详情仅支持桌面应用')

    const response = await window.zcDesktop.getZenohTask({
      host: this.controllerHost,
      servicePath: options.servicePath,
      taskId,
      timeoutMs: options.timeoutMs,
    })
    if (!response.success)
      throw new Error(response.message || '获取任务详情失败')

    return projectTaskManagerTaskDetail(response)
  }

  createTask = async (task: TaskManagerCreateTaskPayload, options: ZenohTaskServiceOptions = {}): Promise<TaskManagerCreateTaskResult> => {
    if (!window.zcDesktop?.createZenohTask)
      throw new Error('任务创建仅支持桌面应用')

    const response = await window.zcDesktop.createZenohTask({
      host: this.controllerHost,
      servicePath: options.servicePath,
      task,
      timeoutMs: options.timeoutMs,
    })
    if (!response.success)
      throw new Error(response.message || '创建任务失败')
    if (!response.ok)
      throw new Error(response.message || '任务管理器拒绝创建任务')

    return {
      ok: response.ok,
      task_id: response.task_id,
      task_definition_id: response.task_definition_id,
      message: response.message,
    }
  }

  updateTask = async (task: TaskManagerUpdateTaskPayload, options: ZenohTaskServiceOptions = {}): Promise<TaskManagerUpdateTaskResult> => {
    if (!window.zcDesktop?.updateZenohTask)
      throw new Error('Task updating is unavailable. Restart the Fleet Operations Console and try again.')

    const response = await window.zcDesktop.updateZenohTask({
      host: this.controllerHost,
      servicePath: options.servicePath,
      task,
      timeoutMs: options.timeoutMs,
    })
    if (!response.success) {
      console.error('Task configuration update did not complete', response.message)
      throw new Error('Task configuration could not be saved. Check the connection and try again.')
    }
    if (!response.ok) {
      console.warn('Task configuration update was rejected', response.message)
      throw new Error('Task configuration was rejected. Review the Unit Tasks and try again.')
    }

    return {
      ok: response.ok,
      message: '',
    }
  }

  runTask = async (taskId: string, options: ZenohTaskServiceOptions = {}): Promise<TaskManagerRunTaskResult> => {
    if (!window.zcDesktop?.runZenohTask)
      throw new Error('任务运行仅支持桌面应用')

    const response = await window.zcDesktop.runZenohTask({
      host: this.controllerHost,
      servicePath: options.servicePath,
      taskId,
      timeoutMs: options.timeoutMs,
    })
    if (!response.success)
      throw new Error(response.message || '运行任务失败')
    if (!response.accepted)
      throw new Error(response.message || '任务管理器拒绝运行任务')

    return {
      accepted: response.accepted,
      task_execution_id: response.task_execution_id,
      message: response.message,
    }
  }

  cancelTaskExecution = async (taskExecutionId: string, options: ZenohTaskServiceOptions = {}): Promise<TaskManagerCancelTaskResult> => {
    if (!window.zcDesktop?.cancelZenohTask)
      throw new Error('任务取消仅支持桌面应用')

    const response = await window.zcDesktop.cancelZenohTask({
      host: this.controllerHost,
      servicePath: options.servicePath,
      taskExecutionId,
      timeoutMs: options.timeoutMs,
    })
    if (!response.success)
      throw new Error(response.message || '取消任务失败')
    if (!response.accepted)
      throw new Error(response.message || '任务管理器拒绝取消任务')

    return {
      accepted: response.accepted,
      transition_id: response.transition_id,
      error_code: response.error_code,
      message: response.message,
    }
  }

  resolveTaskRecovery = async (resolution: TaskManagerResolveRecoveryPayload, options: ZenohTaskServiceOptions = {}): Promise<TaskManagerResolveRecoveryResult> => {
    if (!window.zcDesktop?.resolveZenohTaskRecovery)
      throw new Error('Task recovery resolution is unavailable. Restart the Fleet Operations Console and try again.')

    const response = await window.zcDesktop.resolveZenohTaskRecovery({
      host: this.controllerHost,
      servicePath: options.servicePath,
      resolution,
      timeoutMs: options.timeoutMs,
    })
    if (!response.success)
      throw new Error(response.message || 'Task recovery resolution did not complete')
    if (!response.ok)
      throw new Error(response.message || 'Task Manager rejected the recovery resolution')

    return {
      ok: response.ok,
      task_execution_id: response.task_execution_id,
      message: response.message,
    }
  }

  renameTask = async (taskId: string, newName: string, options: ZenohTaskServiceOptions = {}): Promise<TaskManagerRenameTaskResult> => {
    if (!window.zcDesktop?.renameZenohTask)
      throw new Error('Task renaming is unavailable. Restart the Fleet Operations Console and try again.')

    let response: ZenohTaskRenameResult
    try {
      response = await window.zcDesktop.renameZenohTask({
        host: this.controllerHost,
        servicePath: options.servicePath,
        taskId,
        newName,
        timeoutMs: options.timeoutMs,
      })
    }
    catch (error) {
      console.error('Task rename request failed', error)
      throw new Error('Task Manager did not complete the rename. Check the connection and try again.')
    }
    if (!response.success) {
      console.error('Task rename request failed', response.message)
      throw new Error('Task Manager did not complete the rename. Check the connection and try again.')
    }
    if (!response.ok)
      throw new Error(response.message || 'Task Manager rejected the new name')

    return {
      ok: response.ok,
      message: response.message,
    }
  }

  deleteTaskDefinition = async (taskId: string, force = false, options: ZenohTaskServiceOptions = {}): Promise<TaskManagerDeleteTaskResult> => {
    if (!window.zcDesktop?.deleteZenohTask)
      throw new Error('任务删除仅支持桌面应用')

    const response = await window.zcDesktop.deleteZenohTask({
      host: this.controllerHost,
      servicePath: options.servicePath,
      taskId,
      force,
      timeoutMs: options.timeoutMs,
    })
    if (!response.success)
      throw new Error(response.message || '删除任务失败')
    if (!response.ok)
      throw new Error(response.message || '任务管理器拒绝删除任务')

    return {
      ok: response.ok,
      message: response.message,
    }
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

  setPose = async (pose: PoseMessage, useAbsolute = false) => {
    const json = await this.robotHttpClient.post('set_pose', {
      json: {
        position: {
          x: pose.position.x,
          y: pose.position.y,
        },
        use_pyr: true,
        use_absolute: useAbsolute,
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

  private buildSystemControlUrl(targetHost: string, path: string, params: Record<string, string> = {}) {
    const trimmedHost = targetHost.trim()
    if (!trimmedHost)
      throw new Error('上传目标 IP不能为空')

    const url = new URL(/^https?:\/\//i.test(trimmedHost) ? trimmedHost : `http://${trimmedHost}`)
    if (!url.port)
      url.port = '4999'
    url.pathname = path
    url.search = ''
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    url.hash = ''
    return url.toString()
  }

  private async uploadSystemControlMapFile(targetHost: string, filename: string, body: Blob | string, contentType: string) {
    const token = this.composeControlToken
    const headers: Record<string, string> = {
      'accept': 'application/json',
      'content-type': contentType,
    }
    if (token)
      headers['x-api-key'] = token

    const json = await ky.post(this.buildSystemControlUrl(targetHost, '/api/v1/maps/files', { filename }), {
      body,
      headers,
      timeout: 30 * 60 * 1000,
    }).json<SystemControlEnvelope<{ file?: SystemControlMapFile }>>()

    return unwrapSystemControl(json, `Failed to upload ${filename}`)
  }

  uploadRmfBuildingYaml = async (targetHost: string, content: string, mapImages: RmfBuildingMapImageUpload[] = []) => {
    const savedImages: string[] = []
    for (const image of mapImages) {
      await this.uploadSystemControlMapFile(
        targetHost,
        image.filename,
        image.blob,
        image.blob.type || 'application/octet-stream',
      )
      savedImages.push(image.filename)
    }

    await this.uploadSystemControlMapFile(
      targetHost,
      defaultRmfBuildingYamlFilename,
      new Blob([content], { type: 'application/x-yaml;charset=utf-8' }),
      'application/x-yaml;charset=utf-8',
    )

    const token = this.composeControlToken
    const headers: Record<string, string> = {
      accept: 'application/json',
    }
    if (token)
      headers['x-api-key'] = token

    const json = await ky.post(this.buildSystemControlUrl(targetHost, '/api/v1/maps/generate'), {
      json: {
        source_filename: defaultRmfBuildingYamlFilename,
      },
      headers,
      timeout: 30 * 60 * 1000,
    }).json<SystemControlEnvelope<SystemControlOperationData>>()
    const data = unwrapSystemControl(json, 'Failed to generate RMF map')

    return {
      ok: true,
      returncode: 0,
      stdout: JSON.stringify({
        uploaded: [defaultRmfBuildingYamlFilename, ...savedImages],
        operation: data.operation,
      }, null, 2),
      stderr: '',
      saved_images: savedImages,
      referenced_images: mapImages.map(image => image.filename),
    } satisfies RmfBuildingYamlUploadResponse
  }

  fetchParams = async () => {
    const json = await this.client.get('parameter/get_params').json<Resp<RobotParams>>()
    if (json.code === 0)
      return json.data
    return null
  }

  fetchAllRobotParameters = async () => {
    const domain = useBoundStore.getState().apiDomain || import.meta.env.VITE_API_DOMAIN || 'http://localhost:1234'
    let content: string

    if (window.zcDesktop?.fetchRobotParameters) {
      const url = new URL(domain)
      const response = await window.zcDesktop.fetchRobotParameters({
        host: url.hostname,
        port: url.port ? Number(url.port) : 5000,
      })
      content = response.body
    }
    else {
      const response = await this.client.get('param_handler/yamlGetAll', { retry: 0 })
      content = await response.text()
    }

    return extractLatestRobotParameterYaml(content)
  }

  fetchRobotParameterHeads = async () => {
    const domain = useBoundStore.getState().apiDomain || import.meta.env.VITE_API_DOMAIN || 'http://localhost:1234'
    let content: string

    if (window.zcDesktop?.fetchRobotParameterHeads) {
      const url = new URL(domain)
      const response = await window.zcDesktop.fetchRobotParameterHeads({
        host: url.hostname,
        port: url.port ? Number(url.port) : 5000,
      })
      content = response.body
    }
    else {
      const response = await this.client.get('param_handler/yamlGetHeads', { retry: 0 })
      content = await response.text()
    }

    return parseRobotParameterHeads(content)
  }

  fetchRobotParametersByHeads = async (heads: string[]) => {
    const normalizedHeads = heads.map(head => head.trim()).filter(Boolean)
    if (normalizedHeads.length === 0)
      throw new Error('At least one robot parameter head is required.')

    const domain = useBoundStore.getState().apiDomain || import.meta.env.VITE_API_DOMAIN || 'http://localhost:1234'
    let content: string

    if (window.zcDesktop?.fetchRobotParametersByHeads) {
      const url = new URL(domain)
      const response = await window.zcDesktop.fetchRobotParametersByHeads({
        host: url.hostname,
        port: url.port ? Number(url.port) : 5000,
        heads: normalizedHeads,
      })
      content = response.body
    }
    else {
      const response = await this.client.post('param_handler/yamlGetParamsByHeads', {
        json: { heads: normalizedHeads },
        retry: 0,
      })
      content = await response.text()
    }

    return normalizeRobotParametersByHeads(content, normalizedHeads)
  }

  updateRobotParameter = async (keyPath: string, newValue: unknown, numericType?: RobotParameterNumericType) => {
    const domain = useBoundStore.getState().apiDomain || import.meta.env.VITE_API_DOMAIN || 'http://localhost:1234'

    if (window.zcDesktop?.updateRobotParameter) {
      const url = new URL(domain)
      return window.zcDesktop.updateRobotParameter({
        host: url.hostname,
        port: url.port ? Number(url.port) : 5000,
        keyPath,
        newValue,
        numericType,
      })
    }

    const response = await this.client.post('param_handler/yamlUpdateValue', {
      body: serializeRobotParameterUpdateBody(keyPath, newValue, numericType),
      headers: {
        'content-type': 'application/json',
      },
      retry: 0,
    })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
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
