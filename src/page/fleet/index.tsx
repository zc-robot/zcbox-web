import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { buildRobotHardwareDiagnosticsView } from './runtimeModel'
import { buildMultiGoToPoseUnitTasks } from './taskModel'
import type { FleetHardwareDiagnosticState, FleetRobotHardwareDiagnosticsState } from './runtimeModel'
import { notifyFleetSiteNamespaceUpdated, prefixFleetSiteTopic, useBuildingMapZenoh, useFleetBondsZenoh, useFleetDataZenoh, useFleetDidoZenoh, useFleetHardwareDiagnosticsZenoh, useFleetRmfStatesZenoh, useFleetSiteNamespace, useFleetWheelStatesZenoh, useInterval } from '@/hooks'
import apiServer from '@/service/apiServer'
import { useParamsStore } from '@/store'
import type { BuildingMapGraphMessage, BuildingMapImageMessage, BuildingMapLevelMessage, BuildingMapMessage, FleetRobotDataMessage, RmfDoorRequestMessage, RmfLiftRequestMessage, StorageAreaLayoutMessage, StorageCellStockMessage, StorageReinitLayoutSpec, StorageShelfMessage, TaskManagerTaskDetail, TaskManagerTaskInfo, TaskManagerUnitTaskInfo, TwistCommand } from '@/types'
import type { ComposeControlAction, ComposeControlCommandResponse, ComposeControlServiceStatus, ComposeControlStatusResponse, ComposeMapSiteWithFiles, FleetConfigNamespaceData, FleetConfigResponse, FleetConfigWriteResponse } from '@/service/apiServer'
import type { DidoValue, FleetDidoZenohState, RobotDidoValues } from '@/hooks/useFleetDidoZenoh'
import type { FleetHardwareDiagnosticsZenohState, HardwareDiagnosticsValue } from '@/hooks/useFleetHardwareDiagnosticsZenoh'
import type { FleetRmfStatesZenohState, RmfDoorStateValue, RmfLiftStateValue, RmfScheduleMarkerValue, StorageStateValue } from '@/hooks/useFleetRmfStatesZenoh'
import type { FleetWheelStatesZenohState, WheelStateValue } from '@/hooks/useFleetWheelStatesZenoh'
import type { FleetBondsZenohState } from '@/hooks/useFleetBondsZenoh'
import type { FleetBondValue } from '@/hooks/fleetBondModel'
import { FLEET_BOND_STALE_MS, getFleetBondHealth } from '@/hooks/fleetBondModel'

type FleetPage = 'dashboard' | 'robots' | 'tasks' | 'storage' | 'sites' | 'compose'
type FleetTaskStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'done'
type FleetTaskPriority = 'low' | 'normal' | 'high'
type StorageStatus = 'available' | 'reserved' | 'occupied' | 'blocked'
type ManagedSiteStatus = 'active' | 'standby' | 'archived'
type FleetJoystickAction =
  | 'forward-left'
  | 'forward'
  | 'forward-right'
  | 'rotate-left'
  | 'rotate-right'
  | 'backward-left'
  | 'backward'
  | 'backward-right'

interface FleetJoystickOption {
  id: string
  robot: FleetRobotDataMessage
  namespace: string
}

type DigitalOutputCommandStatus = 'idle' | 'pending' | 'sent' | 'failed'
type LiftRequestCommandStatus = 'idle' | 'pending' | 'sent' | 'failed'
type DoorRequestCommandStatus = 'idle' | 'pending' | 'sent' | 'failed'

interface DigitalOutputControl {
  id: string
  label: string
  outputIndex: number
  address: number
}

interface DigitalOutputCommandFeedback {
  status: DigitalOutputCommandStatus
  value: boolean
  message: string
  updatedAt: number
}

interface DoorRequestDraft {
  requesterId: string
}

interface DoorRequestCommandFeedback {
  status: DoorRequestCommandStatus
  mode: number
  message: string
  updatedAt: number
}

interface LiftRequestDraft {
  sessionId: string
  requestType: number
  destinationFloor: string
  doorState: number
}

interface LiftRequestCommandFeedback {
  status: LiftRequestCommandStatus
  message: string
  updatedAt: number
}

interface FleetTask {
  id: string
  title: string
  robot: string
  map: string
  scheduleAt: string
  priority: FleetTaskPriority
  status: FleetTaskStatus
  createdAt: number
}

interface TaskDraft {
  title: string
  robot: string
  map: string
  scheduleAt: string
  priority: FleetTaskPriority
}

interface GoToChargerTaskDraft {
  robot: string
  chargerWaypoint: string
}

interface GoToWaypointTaskDraft {
  robot: string
  waypoint: string
}

interface MultiGoToPoseStop {
  id: string
  waypoint: string
}

interface MultiGoToPoseTaskDraft {
  robot: string
  stops: MultiGoToPoseStop[]
}

interface TaskWaypointOption {
  name: string
  levelName: string
  graphName: string
}

interface GoToChargerFeedback {
  tone: 'success' | 'error'
  message: string
}

interface StorageArea {
  id: string
  name: string
  map: string
  capacity: number
  occupied: number
  status: StorageStatus
}

interface StorageDraft {
  name: string
  map: string
  capacity: number
}

interface ManagedSiteFile {
  id: string
  name: string
  site: string
  path: string
  fileType: string
  size: number
  status: ManagedSiteStatus
  robotCount: number
  source: 'compose_control' | 'local'
  updatedAt: number
}

interface ManagedSite {
  site: string
  files: ManagedSiteFile[]
  fileCount: number
  totalBytes: number
  modifiedTime: number
  robotCount: number
}

const fleetPages: Array<{ id: FleetPage, label: string, icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'i-material-symbols-dashboard-rounded' },
  { id: 'robots', label: 'Robots', icon: 'i-material-symbols-smart-toy-outline-rounded' },
  { id: 'tasks', label: 'Tasks', icon: 'i-material-symbols-task-alt-rounded' },
  { id: 'storage', label: 'Storage', icon: 'i-material-symbols-inventory-2-outline-rounded' },
  { id: 'sites', label: 'Sites', icon: 'i-material-symbols-domain-rounded' },
  { id: 'compose', label: 'Compose', icon: 'i-material-symbols-deployed-code-outline-rounded' },
]

const defaultStorageAreas: StorageArea[] = []
const digitalOutputAddressBase = 800
const goToChargerTaskName = 'go_to_charger'
const goToChargerActionName = 'reflector_docking'
const goToWaypointTaskName = 'go_to_waypoint'
const multiGoToPoseTaskName = 'go_to_waypoints'

function digitalBitLabel(prefix: 'I' | 'O', index: number) {
  return `${prefix}${index}`
}

function digitalOutputIndexForAddress(address: number) {
  return address - digitalOutputAddressBase
}

const predefinedDigitalOutputControls: DigitalOutputControl[] = [
  { id: 'fork-extend', label: 'Fork extend', outputIndex: digitalOutputIndexForAddress(805), address: 805 },
  { id: 'fork-retract', label: 'Fork retract', outputIndex: digitalOutputIndexForAddress(806), address: 806 },
  { id: 'fork-power', label: 'Fork power', outputIndex: digitalOutputIndexForAddress(807), address: 807 },
]

const minimumDigitalOutputCount = predefinedDigitalOutputControls.reduce(
  (highestIndex, control) => Math.max(highestIndex, control.outputIndex + 1),
  0,
)

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`
}

function formatNumber(value: number, fractionDigits = 2) {
  if (!Number.isFinite(value))
    return '--'

  return value.toFixed(fractionDigits)
}

function formatInteger(value: number) {
  if (!Number.isFinite(value))
    return '--'

  return `${value}`
}

function formatBoolean(value: boolean) {
  return value ? '是' : '否'
}

function formatOutputState(value: boolean | null) {
  if (value == null)
    return 'Unknown'

  return value ? 'On' : 'Off'
}

function formatTime(value: number | null) {
  return value ? new Date(value).toLocaleTimeString() : '--'
}

function formatAge(value: number | null, now = Date.now()) {
  if (!value)
    return '--'

  const seconds = Math.max(0, Math.round((now - value) / 1000))
  if (seconds < 60)
    return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes}m ${rest}s ago` : `${minutes}m ago`
}

function formatDateTimeInput(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDateTime(value: string) {
  if (!value)
    return '--'

  const time = new Date(value)
  if (!Number.isFinite(time.getTime()))
    return '--'

  return time.toLocaleString()
}

function formatTimer(value: string, status: FleetTaskStatus) {
  if (status === 'done')
    return 'Done'
  if (!value)
    return '--'

  const diff = new Date(value).getTime() - Date.now()
  if (!Number.isFinite(diff))
    return '--'
  if (diff <= 0)
    return 'Ready'

  const minutes = Math.ceil(diff / 60000)
  if (minutes < 60)
    return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`
}

function formatStatus(status: string, connected: boolean) {
  if (connected)
    return '已订阅'

  const labels: Record<string, string> = {
    idle: '未启动',
    starting: '连接中...',
    connecting: '连接中...',
    subscribed: '已订阅',
    stopped: '已停止',
    error: '连接错误',
    'decode-error': '解析错误',
    'missing-controller': '未选择控制器',
    'desktop-only': '仅桌面应用支持',
    'waiting-robots': '等待机器人',
  }

  return labels[status] || status || '--'
}

function getRobotName(robot: FleetRobotDataMessage) {
  return robot.name || robot.robot || '--'
}

function getRobotDidoNamespace(robot: FleetRobotDataMessage) {
  return (robot.zenohNamespace || '').trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function getRobotDidoValues(robot: FleetRobotDataMessage, dido: FleetDidoZenohState, allRobots: FleetRobotDataMessage[]) {
  const namespace = getRobotDidoNamespace(robot)
  if (namespace)
    return dido.values[namespace]

  if (dido.fallbackNamespace && dido.values[dido.fallbackNamespace])
    return dido.values[dido.fallbackNamespace]

  const candidates = [robot.robot, robot.name].map(value => value.trim()).filter(Boolean)
  const matched = Object.entries(dido.values).find(([didoNamespace]) => (
    candidates.some(candidate => didoNamespace.includes(candidate))
  ))
  if (matched)
    return matched[1]

  const discoveredValues = Object.values(dido.values)
  if (allRobots.length === 1 && discoveredValues.length === 1)
    return discoveredValues[0]

  return undefined
}

function getRobotHardwareDiagnosticsValue(
  robot: FleetRobotDataMessage,
  diagnostics: FleetHardwareDiagnosticsZenohState,
  allRobots: FleetRobotDataMessage[],
) {
  const namespace = getRobotDidoNamespace(robot)
  if (namespace)
    return diagnostics.values[namespace]

  if (diagnostics.fallbackNamespace && diagnostics.values[diagnostics.fallbackNamespace])
    return diagnostics.values[diagnostics.fallbackNamespace]

  const candidates = [robot.robot, robot.name].map(value => value.trim()).filter(Boolean)
  const matched = Object.entries(diagnostics.values).find(([diagnosticNamespace]) => (
    candidates.some(candidate => diagnosticNamespace.includes(candidate))
  ))
  if (matched)
    return matched[1]

  const discoveredValues = Object.values(diagnostics.values)
  if (allRobots.length === 1 && discoveredValues.length === 1)
    return discoveredValues[0]

  return undefined
}

function getRobotWheelStateValue(
  robot: FleetRobotDataMessage,
  wheelStates: FleetWheelStatesZenohState,
  allRobots: FleetRobotDataMessage[],
) {
  const namespace = getRobotDidoNamespace(robot)
  if (namespace)
    return wheelStates.values[namespace]

  if (wheelStates.fallbackNamespace && wheelStates.values[wheelStates.fallbackNamespace])
    return wheelStates.values[wheelStates.fallbackNamespace]

  const candidates = [robot.robot, robot.name].map(value => value.trim()).filter(Boolean)
  const matched = Object.entries(wheelStates.values).find(([wheelNamespace]) => (
    candidates.some(candidate => wheelNamespace.includes(candidate))
  ))
  if (matched)
    return matched[1]

  const discoveredValues = Object.values(wheelStates.values)
  if (allRobots.length === 1 && discoveredValues.length === 1)
    return discoveredValues[0]

  return undefined
}

function getRobotBondValues(
  robot: FleetRobotDataMessage,
  bonds: FleetBondsZenohState,
  allRobots: FleetRobotDataMessage[],
) {
  const namespace = getRobotDidoNamespace(robot)
  if (namespace)
    return bonds.values[namespace]

  if (bonds.fallbackNamespace && bonds.values[bonds.fallbackNamespace])
    return bonds.values[bonds.fallbackNamespace]

  const candidates = [robot.robot, robot.name].map(value => value.trim()).filter(Boolean)
  const matched = Object.entries(bonds.values).find(([bondNamespace]) => (
    candidates.some(candidate => bondNamespace.includes(candidate))
  ))
  if (matched)
    return matched[1]

  const discoveredValues = Object.values(bonds.values)
  if (allRobots.length === 1 && discoveredValues.length === 1)
    return discoveredValues[0]

  return undefined
}

function getRobotCommandNamespace(robot: FleetRobotDataMessage, dido: FleetDidoZenohState, allRobots: FleetRobotDataMessage[]) {
  const namespace = getRobotDidoNamespace(robot)
  if (namespace)
    return namespace

  if (allRobots.length === 1 && dido.fallbackNamespace)
    return dido.fallbackNamespace

  const candidates = [robot.robot, robot.name].map(value => value.trim()).filter(Boolean)
  const matched = Object.keys(dido.values).find(didoNamespace => (
    candidates.some(candidate => didoNamespace.includes(candidate))
  ))

  return matched || ''
}

function didoBitValue(message: DidoValue | undefined, index: number): boolean | null {
  if (!message)
    return null

  const bit = message.bits.find(candidate => candidate.index === index)
  if (bit)
    return bit.value

  const byteIndex = Math.floor(index / 8)
  const bitIndex = index % 8
  const byte = message.data[byteIndex]
  if (byte == null)
    return null

  return (byte & (1 << bitIndex)) !== 0
}

function didoBits(message: DidoValue | undefined) {
  if (!message)
    return []

  if (message.bits.length > 0)
    return message.bits

  return message.data.flatMap((byte, byteIndex) => (
    Array.from({ length: 8 }, (_, bitIndex) => ({
      index: byteIndex * 8 + bitIndex,
      byteIndex,
      bitIndex,
      value: (byte & (1 << bitIndex)) !== 0,
    }))
  ))
}

function getRobotStatusClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized.includes('error') || normalized.includes('fault') || normalized.includes('failed'))
    return 'text-red-700'
  if (normalized.includes('moving') || normalized.includes('active') || normalized.includes('executing'))
    return 'text-blue-700'
  if (normalized.includes('idle') || normalized.includes('ready') || normalized.includes('succeeded') || normalized.includes('connected'))
    return 'text-emerald-700'
  return 'text-gray-700'
}

function getWheelSummary(robot: FleetRobotDataMessage) {
  if (!robot.hasWheelState)
    return '无'

  const motors = robot.wheels.motors
  if (motors.length === 0)
    return '0'

  const faulted = motors.filter(motor => motor.isFaulted).length
  const connected = motors.filter(motor => motor.isConnected).length
  return faulted > 0
    ? `${connected}/${motors.length} 连接, ${faulted} 故障`
    : `${connected}/${motors.length} 连接`
}

function getWheelStateToneClass(wheelState?: WheelStateValue) {
  if (!wheelState)
    return 'bg-gray-100 text-gray-700'

  const motors = wheelState.motorStates
  if (motors.some(motor => motor.isFaulted))
    return 'bg-red-50 text-red-700'
  if (motors.some(motor => !motor.isConnected))
    return 'bg-amber-50 text-amber-700'
  if (motors.length > 0)
    return 'bg-emerald-50 text-emerald-700'

  return 'bg-gray-100 text-gray-700'
}

function getWheelStateSummary(wheelState?: WheelStateValue) {
  if (!wheelState)
    return 'Unknown'

  const motors = wheelState.motorStates
  if (motors.length === 0)
    return '0 motors'

  const faulted = motors.filter(motor => motor.isFaulted).length
  const disconnected = motors.filter(motor => !motor.isConnected).length
  const powered = motors.filter(motor => motor.isPowered).length
  if (faulted > 0)
    return `${faulted} fault`
  if (disconnected > 0)
    return `${disconnected} disconnected`
  return `${powered}/${motors.length} powered`
}

function getDiagnosticsSummary(robot: FleetRobotDataMessage) {
  if (!robot.hasDiagnostics)
    return '无'

  const statuses = robot.diagnostics.status
  if (statuses.length === 0)
    return '0'

  const errors = statuses.filter(status => status.level >= 2).length
  const warnings = statuses.filter(status => status.level === 1).length
  if (errors > 0)
    return `${errors} 错误`
  if (warnings > 0)
    return `${warnings} 警告`
  return `${statuses.length} 正常`
}

function getHardwareDiagnosticsToneClass(state: FleetHardwareDiagnosticState) {
  const classes: Record<FleetHardwareDiagnosticState, string> = {
    normal: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    fault: 'bg-red-50 text-red-700',
    unknown: 'bg-gray-100 text-gray-700',
    stale: 'bg-zinc-100 text-zinc-600',
  }
  return classes[state]
}

function getHardwareDiagnosticsLabel(state: FleetHardwareDiagnosticState) {
  const labels: Record<FleetHardwareDiagnosticState, string> = {
    normal: 'Normal',
    warning: 'Warning',
    fault: 'Fault',
    unknown: 'Unknown',
    stale: 'Stale',
  }
  return labels[state]
}

function getHardwareDiagnosticsSummaryLabel(diagnostics: FleetRobotHardwareDiagnosticsState) {
  if (diagnostics.summary.state === 'normal')
    return `${diagnostics.summary.totalCount} normal`
  if (diagnostics.summary.state === 'unknown')
    return 'Unknown'
  if (diagnostics.summary.state === 'stale')
    return 'Stale'

  return `${diagnostics.summary.abnormalCount} ${getHardwareDiagnosticsLabel(diagnostics.summary.state).toLowerCase()}`
}

function getRobotHardwareDiagnosticsSummary(value: HardwareDiagnosticsValue | undefined, now: number) {
  const view = buildRobotHardwareDiagnosticsView(value, value?.updatedAt ?? null, false, now)
  return {
    label: getHardwareDiagnosticsSummaryLabel(view),
    state: view.summary.state,
  }
}

function getTaskStatusClass(status: FleetTaskStatus) {
  const classes: Record<FleetTaskStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    scheduled: 'bg-blue-50 text-blue-700',
    active: 'bg-emerald-50 text-emerald-700',
    paused: 'bg-amber-50 text-amber-700',
    done: 'bg-zinc-100 text-zinc-600',
  }
  return classes[status]
}

function getPriorityClass(priority: FleetTaskPriority) {
  const classes: Record<FleetTaskPriority, string> = {
    low: 'bg-gray-100 text-gray-600',
    normal: 'bg-sky-50 text-sky-700',
    high: 'bg-red-50 text-red-700',
  }
  return classes[priority]
}

const taskManagerStatusClass: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-amber-50 text-amber-700',
  RUNNING: 'bg-emerald-50 text-emerald-700',
  SUCCEEDED: 'bg-blue-50 text-blue-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELED: 'bg-zinc-100 text-zinc-600',
  PAUSED: 'bg-purple-50 text-purple-700',
  ARCHIVED: 'bg-gray-100 text-gray-700',
}

const taskManagerExecutingStatuses = new Set(['PENDING', 'RUNNING'])

const composeControlActionLabels: Record<ComposeControlAction, string> = {
  up: 'Start',
  stop: 'Stop',
  restart: 'Restart',
  down: 'Down',
}

function getTaskManagerStatusClass(status: string) {
  return taskManagerStatusClass[status] || 'bg-gray-100 text-gray-700'
}

function getTaskManagerTaskName(task: TaskManagerTaskInfo) {
  return task.name || task.task_definition_id || task.task_id || 'Unnamed task'
}

function getTaskManagerDefinitionId(task: TaskManagerTaskInfo) {
  return task.task_definition_id || task.task_id
}

function isTaskManagerTaskExecuting(task: TaskManagerTaskInfo) {
  return taskManagerExecutingStatuses.has(task.status)
}

function getComposeStatusClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'running')
    return 'bg-emerald-50 text-emerald-700'
  if (normalized === 'partial' || normalized === 'starting' || normalized === 'restarting' || normalized === 'created')
    return 'bg-amber-50 text-amber-700'
  if (normalized === 'unhealthy')
    return 'bg-red-50 text-red-700'
  if (normalized === 'stopped' || normalized === 'empty')
    return 'bg-gray-100 text-gray-700'

  return 'bg-zinc-100 text-zinc-700'
}

function getComposeServiceName(service: ComposeControlServiceStatus) {
  return service.service || service.name || service.id || '--'
}

function parseComposeServices(value: string) {
  return Array.from(new Set(value.split(/[,\s]+/).map(item => item.trim()).filter(Boolean)))
}

function composeOutputText(response: ComposeControlCommandResponse | null) {
  if (!response)
    return ''

  const parts = [response.stdout, response.stderr]
    .map(value => value?.trim())
    .filter(Boolean)

  return parts.length > 0 ? parts.join('\n\n') : ''
}

function normalizeFleetSiteName(value: string) {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function formatRosNamespace(value: string) {
  const namespace = normalizeFleetSiteName(value)
  return namespace ? `/${namespace}` : '--'
}

function formatUnixMilliseconds(value: number) {
  if (!value)
    return '--'

  return new Date(value).toLocaleString()
}

function shortIdentifier(value: string) {
  if (!value)
    return '--'
  if (value.length <= 12)
    return value
  return `${value.slice(0, 8)}...`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : `${error}`
}

function TaskManagerSummaryField({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-[8rem] flex-1">
      <div className="text-[11px] font-700 uppercase text-gray-400">{label}</div>
      <div className="mt-0.5 min-w-0 break-words text-xs font-700 leading-4 text-gray-700" title={title || value}>
        {value || '--'}
      </div>
    </div>
  )
}

function getStorageStatusClass(status: StorageStatus) {
  const classes: Record<StorageStatus, string> = {
    available: 'bg-emerald-50 text-emerald-700',
    reserved: 'bg-blue-50 text-blue-700',
    occupied: 'bg-amber-50 text-amber-700',
    blocked: 'bg-red-50 text-red-700',
  }
  return classes[status]
}

function getStorageCellStatus(stock: number): StorageStatus {
  if (stock < 0)
    return 'blocked'
  if (stock > 0)
    return 'occupied'

  return 'available'
}

function getStorageCellClass(status: StorageStatus) {
  const classes: Record<StorageStatus, string> = {
    available: 'border-emerald-100 bg-emerald-50/70 text-emerald-800',
    reserved: 'border-blue-100 bg-blue-50/70 text-blue-800',
    occupied: 'border-amber-100 bg-amber-50/80 text-amber-800',
    blocked: 'border-red-100 bg-red-50/80 text-red-800',
  }
  return classes[status]
}

function getStorageCellId(areaIndex: number, shelfIndex: number, columnIndex: number, rowIndex: number) {
  return `area_${areaIndex}_shelf_${shelfIndex}_column_${columnIndex}_row_${rowIndex}`
}

function formatStorageCellStock(cell: StorageCellStockMessage | undefined) {
  if (!cell)
    return 'missing'
  if (cell.stock < 0)
    return 'disabled'

  return `stock ${cell.stock}`
}

const storageWaypointPattern = /^area_(\d+)_shelf_(\d+)_column_(\d+)$/i

interface ParsedStorageWaypoint {
  name: string
  areaIndex: number
  shelfIndex: number
  columnIndex: number
}

interface GeneratedStorageLayout {
  layout: StorageReinitLayoutSpec
  waypointCount: number
  shelfCount: number
}

interface StorageWaypointShelfSummary {
  areaIndex: number
  shelfIndex: number
  columns: number
}

interface StorageReinitLayerDraft {
  areaIndex: number
  displayName: string
  shelfIndex: number
  columns: number
  shelfSide: string
  rows: string
}

interface StorageFeedback {
  tone: 'success' | 'error'
  message: string
}

interface StorageReinitAreaDraftGroup {
  displayName: string
  shelves: StorageReinitLayoutSpec['areas'][number]['shelves']
}

function parseStorageWaypointName(name: string): ParsedStorageWaypoint | null {
  const match = name.trim().match(storageWaypointPattern)
  if (!match)
    return null

  const areaIndex = Number(match[1])
  const shelfIndex = Number(match[2])
  const columnIndex = Number(match[3])
  if (!Number.isInteger(areaIndex) || !Number.isInteger(shelfIndex) || !Number.isInteger(columnIndex))
    return null
  if (areaIndex <= 0 || shelfIndex <= 0 || columnIndex <= 0)
    return null

  return {
    name,
    areaIndex,
    shelfIndex,
    columnIndex,
  }
}

function getStorageShelfDefaults(storageState: StorageStateValue | null, areaIndex: number, shelfIndex: number) {
  const area = storageState?.layout.areas.find(candidate => candidate.areaIndex === areaIndex)
  const shelf = area?.shelves.find(candidate => candidate.shelfIndex === shelfIndex)
  return {
    rows: 1,
    shelf_side: shelf?.shelfSide || '',
  }
}

function buildStorageReinitLayout(buildingMap: BuildingMapMessage | null, storageState: StorageStateValue | null): GeneratedStorageLayout {
  const shelvesByKey = new Map<string, StorageWaypointShelfSummary>()
  const waypointNames = new Set<string>()

  for (const level of buildingMap?.levels ?? []) {
    for (const graph of level.graphs) {
      if (graph.type !== 'nav')
        continue

      for (const vertex of graph.vertices) {
        const parsed = parseStorageWaypointName(vertex.name)
        if (!parsed)
          continue

        waypointNames.add(parsed.name)
        const key = `${parsed.areaIndex}:${parsed.shelfIndex}`
        const current = shelvesByKey.get(key)
        shelvesByKey.set(key, {
          areaIndex: parsed.areaIndex,
          shelfIndex: parsed.shelfIndex,
          columns: Math.max(current?.columns ?? 0, parsed.columnIndex),
        })
      }
    }
  }

  const areas = new Map<number, StorageWaypointShelfSummary[]>()
  for (const shelf of shelvesByKey.values()) {
    const shelves = areas.get(shelf.areaIndex) ?? []
    shelves.push(shelf)
    areas.set(shelf.areaIndex, shelves)
  }

  return {
    layout: {
      areas: Array.from(areas.entries())
        .sort(([left], [right]) => left - right)
        .map(([areaIndex, shelves]) => ({
          area_index: areaIndex,
          display_name: storageState?.layout.areas.find(candidate => candidate.areaIndex === areaIndex)?.displayName || '',
          shelves: shelves
            .sort((left, right) => left.shelfIndex - right.shelfIndex)
            .map((shelf) => {
              const defaults = getStorageShelfDefaults(storageState, shelf.areaIndex, shelf.shelfIndex)
              return {
                shelf_index: shelf.shelfIndex,
                columns: shelf.columns,
                rows: defaults.rows,
                shelf_side: defaults.shelf_side,
              }
            }),
        })),
    },
    waypointCount: waypointNames.size,
    shelfCount: shelvesByKey.size,
  }
}

function buildStorageReinitLayerDrafts(layout: StorageReinitLayoutSpec): StorageReinitLayerDraft[] {
  return layout.areas.flatMap(area => area.shelves.map(shelf => ({
    areaIndex: area.area_index,
    displayName: area.display_name,
    shelfIndex: shelf.shelf_index,
    columns: shelf.columns,
    shelfSide: shelf.shelf_side,
    rows: '1',
  })))
}

function buildStorageReinitLayoutFromLayerDrafts(drafts: StorageReinitLayerDraft[]): StorageReinitLayoutSpec {
  const areas = new Map<number, StorageReinitAreaDraftGroup>()

  for (const draft of drafts) {
    const area = areas.get(draft.areaIndex) ?? { displayName: draft.displayName, shelves: [] }
    area.shelves.push({
      shelf_index: draft.shelfIndex,
      columns: draft.columns,
      rows: Number(draft.rows.trim() || '1'),
      shelf_side: draft.shelfSide,
    })
    areas.set(draft.areaIndex, area)
  }

  return {
    areas: Array.from(areas.entries())
      .sort(([left], [right]) => left - right)
      .map(([areaIndex, area]) => ({
        area_index: areaIndex,
        display_name: area.displayName,
        shelves: area.shelves.sort((left, right) => left.shelf_index - right.shelf_index),
      })),
  }
}

function getSiteStatusClass(status: ManagedSiteStatus) {
  const classes: Record<ManagedSiteStatus, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    standby: 'bg-blue-50 text-blue-700',
    archived: 'bg-gray-100 text-gray-600',
  }
  return classes[status]
}

function stripKnownMapExtension(value: string) {
  return value.replace(/\.(building\.)?ya?ml$/i, '').replace(/\.(png|pgm)$/i, '')
}

function getSiteFileDisplayName(file: ManagedSiteFile) {
  if (file.source === 'local')
    return file.name

  return `${file.site}/${file.path}`
}

function getSiteFileOptionName(file: ManagedSiteFile) {
  if (file.source === 'local')
    return file.name

  return stripKnownMapExtension(file.path) || file.site
}

function countRobotsForManagedSiteFile(file: ManagedSiteFile, robots: FleetRobotDataMessage[]) {
  const candidates = new Set([
    file.name,
    file.site,
    file.path,
    stripKnownMapExtension(file.path),
    getSiteFileDisplayName(file),
  ].filter(Boolean))

  return robots.filter((robot) => {
    const robotMap = robot.map || robot.location.map
    return robotMap ? candidates.has(robotMap) : false
  }).length
}

function formatBytes(value: number) {
  if (!Number.isFinite(value))
    return '--'
  if (value < 1024)
    return `${value} B`
  if (value < 1024 * 1024)
    return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getLineIndent(line: string) {
  const match = line.match(/^ */)
  return match ? match[0].length : 0
}

function findYamlBlockEnd(lines: string[], startIndex: number, indent: number) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim())
      continue

    const lineIndent = getLineIndent(line)
    if (lineIndent <= indent && !line.trimStart().startsWith('- '))
      return index
  }

  return lines.length
}

function findYamlKeyLine(lines: string[], path: string[]) {
  let start = 0
  let end = lines.length
  let indent = 0

  for (const key of path) {
    const pattern = new RegExp(`^ {${indent}}${escapeRegExp(key)}:\\s*(.*)$`)
    let foundIndex = -1
    for (let index = start; index < end; index += 1) {
      if (pattern.test(lines[index])) {
        foundIndex = index
        break
      }
    }

    if (foundIndex < 0)
      return null

    if (key === path[path.length - 1])
      return { index: foundIndex, indent }

    start = foundIndex + 1
    end = findYamlBlockEnd(lines, foundIndex, indent)
    indent += 2
  }

  return null
}

function unquoteYamlScalar(value: string) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\'')))
    return trimmed.slice(1, -1)

  return trimmed
}

function formatYamlScalar(value: string | boolean | number) {
  if (typeof value === 'boolean')
    return value ? 'true' : 'false'
  if (typeof value === 'number')
    return Number.isFinite(value) ? `${value}` : '0'

  const text = value.trim()
  if (!text)
    return '""'
  if (/^-?\d+(?:\.\d+)?$/.test(text))
    return text
  if (/^(true|false|null)$/i.test(text))
    return text.toLowerCase()
  if (/^[A-Za-z0-9_./-]+$/.test(text))
    return text

  return JSON.stringify(text)
}

function getYamlScalar(content: string, path: string[]) {
  const lines = content.split(/\r?\n/)
  const found = findYamlKeyLine(lines, path)
  if (!found)
    return ''

  const line = lines[found.index]
  const keyPart = `${path[path.length - 1]}:`
  const keyIndex = line.indexOf(keyPart)
  if (keyIndex < 0)
    return ''

  return unquoteYamlScalar(line.slice(keyIndex + keyPart.length))
}

function setYamlScalar(content: string, path: string[], value: string | boolean | number) {
  const lines = content.split(/\r?\n/)
  const found = findYamlKeyLine(lines, path)
  const key = path[path.length - 1]
  if (found) {
    lines[found.index] = `${' '.repeat(found.indent)}${key}: ${formatYamlScalar(value)}`
    return lines.join('\n')
  }

  const parentPath = path.slice(0, -1)
  const parent = parentPath.length > 0 ? findYamlKeyLine(lines, parentPath) : { index: -1, indent: -2 }
  if (!parent)
    return content

  const insertIndex = parent.index >= 0 ? findYamlBlockEnd(lines, parent.index, parent.indent) : lines.length
  lines.splice(insertIndex, 0, `${' '.repeat(parent.indent + 2)}${key}: ${formatYamlScalar(value)}`)
  return lines.join('\n')
}

function getYamlSequence(content: string, path: string[]) {
  const lines = content.split(/\r?\n/)
  const found = findYamlKeyLine(lines, path)
  if (!found)
    return []

  const values: string[] = []
  for (let index = found.index + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim())
      continue

    const indent = getLineIndent(line)
    const trimmed = line.trim()
    if (trimmed.startsWith('- ')) {
      values.push(unquoteYamlScalar(trimmed.slice(2)))
      continue
    }
    if (indent <= found.indent)
      break
    if (indent === found.indent && /^[A-Za-z0-9_.-]+:/.test(trimmed))
      break
    if (indent <= found.indent + 2 && /^[A-Za-z0-9_.-]+:/.test(trimmed))
      break
  }

  return values
}

function setYamlSequenceItem(content: string, path: string[], itemIndex: number, value: string | boolean | number) {
  const lines = content.split(/\r?\n/)
  const found = findYamlKeyLine(lines, path)
  if (!found)
    return content

  const dashLines: Array<{ index: number, indent: number }> = []
  for (let index = found.index + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim())
      continue

    const indent = getLineIndent(line)
    const trimmed = line.trim()
    if (trimmed.startsWith('- ')) {
      dashLines.push({ index, indent })
      continue
    }
    if (indent <= found.indent)
      break
    if (indent <= found.indent + 2 && /^[A-Za-z0-9_.-]+:/.test(trimmed))
      break
  }

  if (!dashLines[itemIndex])
    return content

  lines[dashLines[itemIndex].index] = `${' '.repeat(dashLines[itemIndex].indent)}- ${formatYamlScalar(value)}`
  return lines.join('\n')
}

function getYamlChildKeys(content: string, path: string[]) {
  const lines = content.split(/\r?\n/)
  const found = findYamlKeyLine(lines, path)
  if (!found)
    return []

  const end = findYamlBlockEnd(lines, found.index, found.indent)
  const childIndent = found.indent + 2
  const keys: string[] = []
  for (let index = found.index + 1; index < end; index += 1) {
    const line = lines[index]
    if (getLineIndent(line) !== childIndent)
      continue

    const match = line.trim().match(/^([A-Za-z0-9_.-]+):/)
    if (match)
      keys.push(match[1])
  }

  return keys
}

function hasYamlPath(content: string, path: string[]) {
  return findYamlKeyLine(content.split(/\r?\n/), path) != null
}

function getYamlDirectScalarKeys(content: string, path: string[]) {
  const lines = content.split(/\r?\n/)
  const found = findYamlKeyLine(lines, path)
  if (!found)
    return []

  const end = findYamlBlockEnd(lines, found.index, found.indent)
  const childIndent = found.indent + 2
  const keys: string[] = []
  for (let index = found.index + 1; index < end; index += 1) {
    const line = lines[index]
    if (getLineIndent(line) !== childIndent)
      continue

    const match = line.trim().match(/^([A-Za-z0-9_.-]+):\s*(.*)$/)
    if (!match)
      continue

    const rawValue = match[2].trim()
    if (!rawValue || rawValue.startsWith('#'))
      continue

    keys.push(match[1])
  }

  return keys
}

type ConfigFieldKind = 'text' | 'number' | 'boolean'

interface ConfigScalarField {
  key: string
  label: string
  kind?: ConfigFieldKind
  suffix?: string
}

function humanizeConfigKey(key: string) {
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function mergeConfigFields(baseFields: ConfigScalarField[], directKeys: string[], includeMissingBaseFields = true) {
  const directKeySet = new Set(directKeys)
  const visibleBaseFields = includeMissingBaseFields
    ? baseFields
    : baseFields.filter(field => directKeySet.has(field.key))
  const knownKeys = new Set(visibleBaseFields.map(field => field.key))

  return [
    ...visibleBaseFields,
    ...directKeys
      .filter(key => !knownKeys.has(key))
      .map(key => ({ key, label: humanizeConfigKey(key) })),
  ]
}

function inferConfigFieldKind(key: string, value: string, fallback: ConfigFieldKind = 'text') {
  if (/^(true|false)$/i.test(value))
    return 'boolean'
  if (/^-?\d+(?:\.\d+)?$/.test(value))
    return 'number'
  if (/(?:port|coil|register|timeout|period|frequency|current|voltage|capacity|stack|sec|id)$/i.test(key))
    return 'number'

  return fallback
}

const ROBOT_CONFIG_FIELDS: ConfigScalarField[] = [
  { key: 'network_ip', label: 'Network IP' },
  { key: 'charger', label: 'Charger' },
  { key: 'initial_map', label: 'Initial Map' },
  { key: 'map_frame', label: 'Map Frame' },
  { key: 'robot_frame', label: 'Robot Frame' },
  { key: 'navigation_stack', label: 'Navigation Stack', kind: 'number' },
  { key: 'init_timeout_sec', label: 'Init Timeout', kind: 'number', suffix: 's' },
  { key: 'service_call_timeout_sec', label: 'Service Timeout', kind: 'number', suffix: 's' },
  { key: 'nav2_goal_cooldown_sec', label: 'Goal Cooldown', kind: 'number', suffix: 's' },
  { key: 'responsive_wait', label: 'Responsive Wait', kind: 'boolean' },
  { key: 'zenoh_topic_ready_check', label: 'Zenoh Ready Check', kind: 'boolean' },
]

const ADAPTER_SERVER_FIELDS: ConfigScalarField[] = [
  { key: 'type', label: 'Server Type' },
  { key: 'bind_host', label: 'Bind Host' },
  { key: 'host', label: 'Host' },
  { key: 'port', label: 'Port', kind: 'number' },
]

const DOOR_CONFIG_FIELDS: ConfigScalarField[] = [
  { key: 'type', label: 'Type' },
  { key: 'host', label: 'Host' },
  { key: 'port', label: 'Port', kind: 'number' },
  { key: 'unit_id', label: 'Unit ID', kind: 'number' },
  { key: 'client_ip', label: 'Client IP' },
  { key: 'command_coil', label: 'Command Coil', kind: 'number' },
  { key: 'state_coil', label: 'State Coil', kind: 'number' },
  { key: 'open_discrete_input', label: 'Open Discrete Input', kind: 'number' },
  { key: 'poll_period_sec', label: 'Poll Period', kind: 'number', suffix: 's' },
  { key: 'timeout_sec', label: 'Timeout', kind: 'number', suffix: 's' },
  { key: 'moving_timeout_sec', label: 'Moving Timeout', kind: 'number', suffix: 's' },
  { key: 'request_topic', label: 'Request Topic' },
  { key: 'state_topic', label: 'State Topic' },
]

const LIFT_CONFIG_FIELDS: ConfigScalarField[] = [
  { key: 'type', label: 'Type' },
  { key: 'host', label: 'Host' },
  { key: 'port', label: 'Port', kind: 'number' },
  { key: 'unit_id', label: 'Unit ID', kind: 'number' },
  { key: 'client_ip', label: 'Client IP' },
  { key: 'command_coil', label: 'Command Coil', kind: 'number' },
  { key: 'state_coil', label: 'State Coil', kind: 'number' },
  { key: 'command_register', label: 'Command Register', kind: 'number' },
  { key: 'state_register', label: 'State Register', kind: 'number' },
  { key: 'current_floor_register', label: 'Current Floor Register', kind: 'number' },
  { key: 'target_floor_register', label: 'Target Floor Register', kind: 'number' },
  { key: 'door_state_register', label: 'Door State Register', kind: 'number' },
  { key: 'poll_period_sec', label: 'Poll Period', kind: 'number', suffix: 's' },
  { key: 'timeout_sec', label: 'Timeout', kind: 'number', suffix: 's' },
  { key: 'moving_timeout_sec', label: 'Moving Timeout', kind: 'number', suffix: 's' },
  { key: 'request_topic', label: 'Request Topic' },
  { key: 'state_topic', label: 'State Topic' },
]

function normalizeYamlEntityName(value: string) {
  return value.trim().replace(/\s+/g, '_')
}

function validateYamlEntityName(name: string, existingNames: string[], entityLabel: string) {
  if (!name)
    return `${entityLabel} name is required`
  if (!/^[A-Za-z0-9_.-]+$/.test(name))
    return `${entityLabel} name can only use letters, numbers, _, ., and -`
  if (existingNames.includes(name))
    return `${entityLabel} already exists`

  return null
}

function ensureYamlMappingPath(content: string, path: string[]) {
  let lines = content.split(/\r?\n/)

  for (let index = 0; index < path.length; index += 1) {
    const currentPath = path.slice(0, index + 1)
    if (findYamlKeyLine(lines, currentPath))
      continue

    const parentPath = path.slice(0, index)
    const parent = parentPath.length > 0 ? findYamlKeyLine(lines, parentPath) : null
    const indent = index * 2
    const insertIndex = parent ? findYamlBlockEnd(lines, parent.index, parent.indent) : lines.length
    lines.splice(insertIndex, 0, `${' '.repeat(indent)}${path[index]}:`)
  }

  return lines.join('\n')
}

function appendYamlMappingBlock(content: string, parentPath: string[], key: string, bodyLines: string[]) {
  const normalizedKey = normalizeYamlEntityName(key)
  if (!normalizedKey)
    return content

  const contentWithParent = ensureYamlMappingPath(content, parentPath)
  const lines = contentWithParent.split(/\r?\n/)
  const existing = findYamlKeyLine(lines, [...parentPath, normalizedKey])
  if (existing)
    return contentWithParent

  const parent = findYamlKeyLine(lines, parentPath)
  if (!parent)
    return contentWithParent

  const keyIndent = parent.indent + 2
  const childIndent = keyIndent + 2
  const insertIndex = findYamlBlockEnd(lines, parent.index, parent.indent)
  const block = [
    `${' '.repeat(keyIndent)}${normalizedKey}:`,
    ...bodyLines.map(line => `${' '.repeat(childIndent)}${line}`),
  ]
  lines.splice(insertIndex, 0, ...block)
  return lines.join('\n')
}

function Button({
  children,
  icon,
  tone = 'neutral',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string, tone?: 'neutral' | 'primary' | 'danger' }) {
  return (
    <button
      {...props}
      className={classNames(
        'inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-600 transition disabled:cursor-not-allowed disabled:opacity-45',
        tone === 'primary' && 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
        tone === 'danger' && 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
        tone === 'neutral' && 'border-gray-300 bg-white/75 text-gray-800 hover:bg-white',
        className,
      )}>
      {icon && <span className={`${icon} text-5`} />}
      {children}
    </button>
  )
}

function IconButton({
  icon,
  title,
  tone = 'neutral',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: string, title: string, tone?: 'neutral' | 'primary' | 'danger' }) {
  return (
    <button
      {...props}
      title={title}
      aria-label={title}
      className={classNames(
        'h-8 w-8 inline-flex items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-45',
        tone === 'primary' && 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
        tone === 'danger' && 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
        tone === 'neutral' && 'border-gray-300 bg-white/75 text-gray-700 hover:bg-white',
      )}>
      <span className={`${icon} text-5`} />
    </button>
  )
}

function Badge({ children, className }: { children: React.ReactNode, className: string }) {
  return (
    <span className={classNames('inline-flex h-6 items-center rounded-full px-2 text-xs font-700', className)}>
      {children}
    </span>
  )
}

function Surface({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={classNames('rounded-lg border border-white/70 bg-white/72 shadow-sm backdrop-blur-xl', className)}>
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-700 uppercase tracking-wide text-gray-500">{children}</label>
}

function ConfigSection({ title, subtitle, children }: { title: string, subtitle?: string, children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-(solid 1px gray-200) bg-white/75 p-4">
      <div className="mb-3">
        <div className="font-800 text-gray-900">{title}</div>
        {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function ConfigTextField({
  label,
  value,
  onChange,
  type = 'text',
  suffix,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  suffix?: string
}) {
  return (
    <label className="block min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1 flex items-center overflow-hidden rounded-lg border-(solid 1px gray-300) bg-white/85 focus-within:border-emerald-600">
        <input
          className="h-9 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none"
          type={type}
          step={type === 'number' ? 'any' : undefined}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
        {suffix && <span className="border-(l-solid 1px gray-200) px-2 text-xs text-gray-500">{suffix}</span>}
      </div>
    </label>
  )
}

function ConfigBooleanField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: boolean) => void
}) {
  const normalized = value.toLowerCase() === 'true'
  return (
    <label className="block min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <select
        className="mt-1 h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/85 px-3 text-sm outline-none focus:border-emerald-600"
        value={normalized ? 'true' : 'false'}
        onChange={event => onChange(event.target.value === 'true')}>
        <option value="true">Enabled</option>
        <option value="false">Disabled</option>
      </select>
    </label>
  )
}

function ConfigAddForm({
  label,
  value,
  onChange,
  error,
  buttonLabel,
  onSubmit,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error: string | null
  buttonLabel: string
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,18rem)_auto]" onSubmit={onSubmit}>
      <label className="block min-w-0">
        <FieldLabel>{label}</FieldLabel>
        <input
          className={classNames(
            'mt-1 h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/85 px-3 text-sm outline-none focus:border-emerald-600',
            error && 'border-red-300 focus:border-red-500',
          )}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      </label>
      <div className="flex items-end">
        <Button type="submit" tone="primary" icon="i-material-symbols-add-rounded">{buttonLabel}</Button>
      </div>
      {error && <div className="text-xs font-700 text-red-600 md:col-span-2">{error}</div>}
    </form>
  )
}

function RmfYamlStructuredEditor({
  content,
  onChange,
  isLoading,
}: {
  content: string
  onChange: (content: string) => void
  isLoading: boolean
}) {
  const [selectedRobot, setSelectedRobot] = useState('')
  const [selectedDoor, setSelectedDoor] = useState('')
  const [selectedLift, setSelectedLift] = useState('')
  const [robotDraftName, setRobotDraftName] = useState('')
  const [robotDraftError, setRobotDraftError] = useState<string | null>(null)
  const [doorDraftName, setDoorDraftName] = useState('')
  const [doorDraftError, setDoorDraftError] = useState<string | null>(null)
  const robotNames = useMemo(() => getYamlChildKeys(content, ['rmf_fleet', 'robots']), [content])
  const groupedDoorNames = useMemo(() => getYamlChildKeys(content, ['door_adapters', 'doors']), [content])
  const flatDoorNames = useMemo(
    () => getYamlChildKeys(content, ['door_adapters']).filter(key => !['doors', 'server'].includes(key)),
    [content],
  )
  const doorNames = groupedDoorNames.length > 0 ? groupedDoorNames : flatDoorNames
  const groupedLiftNames = useMemo(() => getYamlChildKeys(content, ['lift_adapters', 'lifts']), [content])
  const flatLiftNames = useMemo(
    () => getYamlChildKeys(content, ['lift_adapters']).filter(key => !['lifts', 'server'].includes(key)),
    [content],
  )
  const topLevelLiftNames = useMemo(() => getYamlChildKeys(content, ['lifts']), [content])
  const liftNames = groupedLiftNames.length > 0 ? groupedLiftNames : flatLiftNames.length > 0 ? flatLiftNames : topLevelLiftNames
  const robotMaps = selectedRobot ? getYamlChildKeys(content, ['rmf_fleet', 'robots', selectedRobot, 'maps']) : []
  const robotFields = selectedRobot
    ? mergeConfigFields(
      ROBOT_CONFIG_FIELDS,
      getYamlDirectScalarKeys(content, ['rmf_fleet', 'robots', selectedRobot]),
    )
    : []
  const doorPath = selectedDoor
    ? groupedDoorNames.length > 0
      ? ['door_adapters', 'doors', selectedDoor]
      : ['door_adapters', selectedDoor]
    : []
  const doorFields = selectedDoor
    ? mergeConfigFields(DOOR_CONFIG_FIELDS, getYamlDirectScalarKeys(content, doorPath))
    : []
  const liftPath = selectedLift
    ? groupedLiftNames.length > 0
      ? ['lift_adapters', 'lifts', selectedLift]
      : flatLiftNames.length > 0
        ? ['lift_adapters', selectedLift]
        : ['lifts', selectedLift]
    : []
  const liftFields = selectedLift
    ? mergeConfigFields(LIFT_CONFIG_FIELDS, getYamlDirectScalarKeys(content, liftPath), false)
    : []
  const hasDoorServer = hasYamlPath(content, ['door_adapters', 'server'])
  const hasLiftServer = hasYamlPath(content, ['lift_adapters', 'server'])
  const doorServerFields = hasDoorServer
    ? mergeConfigFields(ADAPTER_SERVER_FIELDS, getYamlDirectScalarKeys(content, ['door_adapters', 'server']))
    : []
  const liftServerFields = hasLiftServer
    ? mergeConfigFields(ADAPTER_SERVER_FIELDS, getYamlDirectScalarKeys(content, ['lift_adapters', 'server']))
    : []

  useEffect(() => {
    if (!selectedRobot && robotNames.length > 0)
      setSelectedRobot(robotNames[0])
    else if (selectedRobot && robotNames.length > 0 && !robotNames.includes(selectedRobot))
      setSelectedRobot(robotNames[0])
  }, [robotNames, selectedRobot])

  useEffect(() => {
    if (!selectedDoor && doorNames.length > 0)
      setSelectedDoor(doorNames[0])
    else if (selectedDoor && doorNames.length > 0 && !doorNames.includes(selectedDoor))
      setSelectedDoor(doorNames[0])
  }, [doorNames, selectedDoor])

  useEffect(() => {
    if (!selectedLift && liftNames.length > 0)
      setSelectedLift(liftNames[0])
    else if (selectedLift && liftNames.length > 0 && !liftNames.includes(selectedLift))
      setSelectedLift(liftNames[0])
  }, [liftNames, selectedLift])

  const scalar = (path: string[]) => getYamlScalar(content, path)
  const updateScalar = (path: string[], value: string | boolean | number) => onChange(setYamlScalar(content, path, value))

  function scalarOr(path: string[], fallback: string) {
    return scalar(path) || fallback
  }

  function createRobot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const robotName = normalizeYamlEntityName(robotDraftName)
    const error = validateYamlEntityName(robotName, robotNames, 'Robot')
    if (error) {
      setRobotDraftError(error)
      return
    }

    const sourceRobot = selectedRobot || robotNames[0] || ''
    const sourcePath = sourceRobot ? ['rmf_fleet', 'robots', sourceRobot] : []
    const sourceMaps = sourceRobot ? getYamlChildKeys(content, [...sourcePath, 'maps']) : []
    const mapName = sourceMaps[0] || (sourcePath.length > 0 ? scalarOr([...sourcePath, 'initial_map'], 'L1') : 'L1')
    const mapUrl = sourcePath.length > 0
      ? scalarOr([...sourcePath, 'maps', mapName, 'map_url'], '/opt/ros/jazzy/share/nav2_bringup/maps/tb3_sandbox.yaml')
      : '/opt/ros/jazzy/share/nav2_bringup/maps/tb3_sandbox.yaml'
    const readRobot = (key: string, fallback: string) => sourcePath.length > 0 ? scalarOr([...sourcePath, key], fallback) : fallback
    const nextContent = appendYamlMappingBlock(content, ['rmf_fleet', 'robots'], robotName, [
      'network_ip: ""',
      `charger: ${formatYamlScalar(readRobot('charger', 'C1'))}`,
      `responsive_wait: ${formatYamlScalar(readRobot('responsive_wait', 'false'))}`,
      `navigation_stack: ${formatYamlScalar(readRobot('navigation_stack', '2'))}`,
      `init_timeout_sec: ${formatYamlScalar(readRobot('init_timeout_sec', '30'))}`,
      `initial_map: ${formatYamlScalar(readRobot('initial_map', mapName))}`,
      `service_call_timeout_sec: ${formatYamlScalar(readRobot('service_call_timeout_sec', '50.0'))}`,
      `nav2_goal_cooldown_sec: ${formatYamlScalar(readRobot('nav2_goal_cooldown_sec', '0.5'))}`,
      `map_frame: ${formatYamlScalar(readRobot('map_frame', 'map'))}`,
      `robot_frame: ${formatYamlScalar(readRobot('robot_frame', 'base_footprint'))}`,
      'maps:',
      `  ${mapName}:`,
      `    map_url: ${formatYamlScalar(mapUrl)}`,
    ])

    onChange(nextContent)
    setSelectedRobot(robotName)
    setRobotDraftName('')
    setRobotDraftError(null)
  }

  function createDoor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const doorName = normalizeYamlEntityName(doorDraftName)
    const error = validateYamlEntityName(doorName, doorNames, 'Door')
    if (error) {
      setDoorDraftError(error)
      return
    }

    const useGroupedDoorConfig = groupedDoorNames.length > 0 || hasDoorServer || flatDoorNames.length === 0
    const readDoor = (key: string, fallback: string) => selectedDoor && doorPath.length > 0 ? scalarOr([...doorPath, key], fallback) : fallback
    let nextContent = content

    if (useGroupedDoorConfig) {
      if (!hasDoorServer) {
        nextContent = appendYamlMappingBlock(nextContent, ['door_adapters'], 'server', [
          'type: modbus_rtu_tcp_server',
          'bind_host: 0.0.0.0',
          'port: 6081',
        ])
      }
      nextContent = appendYamlMappingBlock(nextContent, ['door_adapters', 'doors'], doorName, [
        'client_ip: ""',
        `unit_id: ${formatYamlScalar(readDoor('unit_id', '1'))}`,
        `command_coil: ${formatYamlScalar(readDoor('command_coil', '0'))}`,
        `state_coil: ${formatYamlScalar(readDoor('state_coil', '0'))}`,
        `open_discrete_input: ${formatYamlScalar(readDoor('open_discrete_input', '0'))}`,
        `poll_period_sec: ${formatYamlScalar(readDoor('poll_period_sec', '0.5'))}`,
        `timeout_sec: ${formatYamlScalar(readDoor('timeout_sec', '1.0'))}`,
        `moving_timeout_sec: ${formatYamlScalar(readDoor('moving_timeout_sec', '10.0'))}`,
      ])
    }
    else {
      nextContent = appendYamlMappingBlock(nextContent, ['door_adapters'], doorName, [
        `type: ${formatYamlScalar(readDoor('type', 'modbus_tcp_wifi_io'))}`,
        'host: ""',
        `port: ${formatYamlScalar(readDoor('port', '502'))}`,
        `unit_id: ${formatYamlScalar(readDoor('unit_id', '1'))}`,
        `command_coil: ${formatYamlScalar(readDoor('command_coil', '0'))}`,
        `open_discrete_input: ${formatYamlScalar(readDoor('open_discrete_input', '0'))}`,
        `poll_period_sec: ${formatYamlScalar(readDoor('poll_period_sec', '0.5'))}`,
        `timeout_sec: ${formatYamlScalar(readDoor('timeout_sec', '1.0'))}`,
        `moving_timeout_sec: ${formatYamlScalar(readDoor('moving_timeout_sec', '10.0'))}`,
      ])
    }

    onChange(nextContent)
    setSelectedDoor(doorName)
    setDoorDraftName('')
    setDoorDraftError(null)
  }

  const renderConfigFields = (basePath: string[], fields: ConfigScalarField[]) => (
    fields.map((field) => {
      const path = [...basePath, field.key]
      const value = scalar(path)
      const kind = field.kind ?? inferConfigFieldKind(field.key, value)

      if (kind === 'boolean') {
        return (
          <ConfigBooleanField
            key={field.key}
            label={field.label}
            value={value}
            onChange={nextValue => updateScalar(path, nextValue)}
          />
        )
      }

      return (
        <ConfigTextField
          key={field.key}
          label={field.label}
          type={kind === 'number' ? 'number' : 'text'}
          suffix={field.suffix}
          value={value}
          onChange={nextValue => updateScalar(path, nextValue)}
        />
      )
    })
  )

  if (isLoading && !content)
    return <div className="p-8 text-center text-sm text-gray-500">Loading rmf.yaml...</div>

  return (
    <div className="space-y-4 p-4">
      <ConfigSection title="Robots">
        {robotNames.length > 0
          ? (
              <div className="space-y-4">
                <ConfigAddForm
                  label="Robot name"
                  value={robotDraftName}
                  onChange={(value) => {
                    setRobotDraftName(value)
                    setRobotDraftError(null)
                  }}
                  error={robotDraftError}
                  buttonLabel="Add Robot"
                  onSubmit={createRobot}
                />
                <div className="flex flex-wrap gap-2">
                  {robotNames.map(robot => (
                    <button
                      key={robot}
                      type="button"
                      className={classNames(
                        'rounded-full border px-3 py-1 text-sm font-700',
                        selectedRobot === robot ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600',
                      )}
                      onClick={() => setSelectedRobot(robot)}>
                      {robot}
                    </button>
                  ))}
                </div>
                {selectedRobot && (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {renderConfigFields(['rmf_fleet', 'robots', selectedRobot], robotFields)}
                  </div>
                )}
                {selectedRobot && robotMaps.length > 0 && (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {robotMaps.map(mapName => (
                      <ConfigTextField
                        key={mapName}
                        label={`Map URL ${mapName}`}
                        value={scalar(['rmf_fleet', 'robots', selectedRobot, 'maps', mapName, 'map_url'])}
                        onChange={value => updateScalar(['rmf_fleet', 'robots', selectedRobot, 'maps', mapName, 'map_url'], value)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          : (
              <div className="space-y-4">
                <ConfigAddForm
                  label="Robot name"
                  value={robotDraftName}
                  onChange={(value) => {
                    setRobotDraftName(value)
                    setRobotDraftError(null)
                  }}
                  error={robotDraftError}
                  buttonLabel="Add Robot"
                  onSubmit={createRobot}
                />
                <div className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No robots configured</div>
              </div>
            )}
      </ConfigSection>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ConfigSection title="Doors">
          <div className="space-y-3">
            <ConfigAddForm
              label="Door name"
              value={doorDraftName}
              onChange={(value) => {
                setDoorDraftName(value)
                setDoorDraftError(null)
              }}
              error={doorDraftError}
              buttonLabel="Add Door"
              onSubmit={createDoor}
            />
            {doorServerFields.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-800 uppercase tracking-wide text-gray-500">Server</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {renderConfigFields(['door_adapters', 'server'], doorServerFields)}
                </div>
              </div>
            )}
            {doorNames.length > 0
              ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {doorNames.map(door => (
                    <button
                      key={door}
                      type="button"
                      className={classNames(
                        'rounded-full border px-3 py-1 text-sm font-700',
                        selectedDoor === door ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600',
                      )}
                      onClick={() => setSelectedDoor(door)}>
                      {door}
                    </button>
                  ))}
                </div>
                {selectedDoor && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {renderConfigFields(doorPath, doorFields)}
                  </div>
                )}
              </>
                )
              : (
                  <div className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No doors configured</div>
                )}
          </div>
        </ConfigSection>

        <ConfigSection title="Lifts">
          <div className="space-y-3">
            {liftServerFields.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-800 uppercase tracking-wide text-gray-500">Server</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {renderConfigFields(['lift_adapters', 'server'], liftServerFields)}
                </div>
              </div>
            )}
            {liftNames.length > 0
              ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {liftNames.map(lift => (
                        <button
                          key={lift}
                          type="button"
                          className={classNames(
                            'rounded-full border px-3 py-1 text-sm font-700',
                            selectedLift === lift ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-600',
                          )}
                          onClick={() => setSelectedLift(lift)}>
                          {lift}
                        </button>
                      ))}
                    </div>
                    {selectedLift && (
                      liftFields.length > 0
                        ? (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              {renderConfigFields(liftPath, liftFields)}
                            </div>
                          )
                        : (
                            <div className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No editable lift values</div>
                          )
                    )}
                  </>
                )
              : (
                  <div className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No lifts configured</div>
                )}
          </div>
        </ConfigSection>
      </div>
    </div>
  )
}

function getBuildingMapImageMime(image: BuildingMapImageMessage) {
  const encoding = image.encoding.toLowerCase()
  if (encoding.includes('jpg') || encoding.includes('jpeg'))
    return 'image/jpeg'
  if (encoding.includes('png'))
    return 'image/png'

  return 'application/octet-stream'
}

function getGraphPointCloud(level: BuildingMapLevelMessage) {
  const points: Array<{ x: number, y: number }> = []
  for (const graph of level.graphs) {
    for (const vertex of graph.vertices)
      points.push({ x: vertex.x, y: vertex.y })
  }
  for (const door of level.doors) {
    points.push({ x: door.v1X, y: door.v1Y })
    points.push({ x: door.v2X, y: door.v2Y })
  }
  return points
}

function createMapProjector(level: BuildingMapLevelMessage, image: BuildingMapImageMessage | null) {
  const scale = image && image.scale > 0 ? image.scale : 0.05
  const width = Math.max(1, image?.width ?? 1000)
  const height = Math.max(1, image?.height ?? 1000)
  const yaw = image?.yaw ?? 0
  const xOffset = image?.xOffset ?? 0
  const yOffset = image?.yOffset ?? 0
  const cos = Math.cos(-yaw)
  const sin = Math.sin(-yaw)

  const projectBase = (x: number, y: number, centered: boolean) => {
    const dx = x - xOffset
    const dy = y - yOffset
    const rotatedX = cos * dx - sin * dy
    const rotatedY = sin * dx + cos * dy
    return {
      x: (centered ? width / 2 : 0) + rotatedX / scale,
      y: (centered ? height / 2 : 0) - rotatedY / scale,
    }
  }

  const points = getGraphPointCloud(level)
  const score = (centered: boolean) => points.reduce((sum, point) => {
    const projected = projectBase(point.x, point.y, centered)
    const margin = 32
    return sum + (
      projected.x >= -margin
      && projected.x <= width + margin
      && projected.y >= -margin
      && projected.y <= height + margin
        ? 1
        : 0
    )
  }, 0)
  const centered = image ? score(true) > score(false) : false

  return {
    width,
    height,
    scale,
    project: (x: number, y: number) => projectBase(x, y, centered),
  }
}

function isRobotOnLevel(robot: FleetRobotDataMessage, level: BuildingMapLevelMessage) {
  const candidates = [robot.location.levelName, robot.location.map, robot.map].filter(Boolean)
  return candidates.length === 0 || candidates.includes(level.name)
}

function robotFootprintPoints(robot: FleetRobotDataMessage) {
  const pose = robot.location
  if (!pose.hasPose)
    return []

  const footprint = robot.footprint
  const length = robot.hasFootprint && footprint.robotLength > 0 ? footprint.robotLength : 0.8
  const width = robot.hasFootprint && footprint.robotWidth > 0 ? footprint.robotWidth : 0.6
  const centerOffset = robot.hasFootprint ? footprint.navCenterToRobotCenter : 0
  const cos = Math.cos(pose.yaw)
  const sin = Math.sin(pose.yaw)
  const centerX = pose.x + cos * centerOffset
  const centerY = pose.y + sin * centerOffset
  const halfLength = length / 2
  const halfWidth = width / 2

  return [
    [halfLength, halfWidth],
    [halfLength, -halfWidth],
    [-halfLength, -halfWidth],
    [-halfLength, halfWidth],
  ].map(([localX, localY]) => ({
    x: centerX + cos * localX - sin * localY,
    y: centerY + sin * localX + cos * localY,
  }))
}

function getRobotKey(robot: FleetRobotDataMessage) {
  return `${robot.zenohNamespace || robot.ip || robot.robot || getRobotName(robot)}:${getRobotName(robot)}`
}

function getRobotHealthTone(robot: FleetRobotDataMessage) {
  const status = `${robot.status} ${robot.statusDetail} ${robot.mode}`.toLowerCase()
  const hasDiagnosticError = robot.hasDiagnostics && robot.diagnostics.status.some(item => item.level >= 2)
  const hasDiagnosticWarning = robot.hasDiagnostics && robot.diagnostics.status.some(item => item.level === 1)
  if (hasDiagnosticError || status.includes('error') || status.includes('fault') || status.includes('failed'))
    return 'danger'
  if (hasDiagnosticWarning || status.includes('warn'))
    return 'warning'
  if (status.includes('moving') || status.includes('active') || status.includes('executing'))
    return 'active'
  if (status.includes('idle') || status.includes('ready') || status.includes('connected') || status.includes('succeeded'))
    return 'ok'

  return 'unknown'
}

function getDashboardToneClass(tone: string) {
  const classes: Record<string, string> = {
    ok: 'bg-emerald-50 text-emerald-700',
    active: 'bg-blue-50 text-blue-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
    unknown: 'bg-gray-100 text-gray-700',
  }
  return classes[tone] ?? classes.unknown
}

function getRobotHealthLabel(tone: string) {
  const labels: Record<string, string> = {
    ok: 'Ready',
    active: 'Active',
    warning: 'Warning',
    danger: 'Fault',
    unknown: 'Unknown',
  }
  return labels[tone] ?? labels.unknown
}

const doorModeLabels: Record<number, string> = {
  0: 'Closed',
  1: 'Moving',
  2: 'Open',
  3: 'Offline',
  4: 'Unknown',
}

const doorRequestTopic = 'adapter_door_requests'
const buildingMapTopic = 'map'
const fleetDataTopic = 'fleet_data'
const storageStateTopic = 'storage_state'
const storageAreaDisplayNameServiceTopic = 'set_area_display_name'
const storageReinitServiceTopic = 'reinit_storage'
const taskManagerServiceTopics = {
  list: 'list_tasks',
  get: 'get_task',
  create: 'create_task',
  run: 'run_task',
  cancel: 'task_manager/cancel_task',
  delete: 'delete_task',
} as const

const doorRequestModeOptions = [
  { value: 2, label: 'Open', icon: 'i-material-symbols-door-open-outline-rounded' },
  { value: 0, label: 'Close', icon: 'i-material-symbols-door-front-outline-rounded' },
]

const liftDoorStateLabels: Record<number, string> = {
  0: 'Closed',
  1: 'Moving',
  2: 'Open',
}

const liftMotionStateLabels: Record<number, string> = {
  0: 'Stopped',
  1: 'Up',
  2: 'Down',
  3: 'Unknown',
}

const liftModeLabels: Record<number, string> = {
  0: 'Unknown',
  1: 'Human',
  2: 'AGV',
  3: 'Fire',
  4: 'Offline',
  5: 'Emergency',
}

const liftRequestTopic = 'lift_requests'

const liftRequestTypeOptions = [
  { value: 1, label: 'AGV' },
  { value: 2, label: 'Human' },
  { value: 0, label: 'End' },
]

const liftDoorRequestOptions = [
  { value: 2, label: 'Open' },
  { value: 0, label: 'Closed' },
]

function normalizeRmfStateName(value: string) {
  return value.trim().toLowerCase()
}

function getRmfDoorState(doorName: string, rmfStates: FleetRmfStatesZenohState) {
  const exact = rmfStates.doorStates[doorName]
  if (exact)
    return exact

  const normalizedName = normalizeRmfStateName(doorName)
  return Object.values(rmfStates.doorStates).find(state => normalizeRmfStateName(state.doorName) === normalizedName)
}

function getRmfLiftState(liftName: string, rmfStates: FleetRmfStatesZenohState) {
  const exact = rmfStates.liftStates[liftName]
  if (exact)
    return exact

  const normalizedName = normalizeRmfStateName(liftName)
  return Object.values(rmfStates.liftStates).find(state => normalizeRmfStateName(state.liftName) === normalizedName)
}

function getDoorModeLabel(mode?: number) {
  return mode == null ? 'Unknown' : doorModeLabels[mode] ?? `Mode ${mode}`
}

function getLiftDoorStateLabel(state?: number) {
  return state == null ? 'Unknown' : liftDoorStateLabels[state] ?? `Door ${state}`
}

function getLiftMotionStateLabel(state?: number) {
  return state == null ? 'Unknown' : liftMotionStateLabels[state] ?? `Motion ${state}`
}

function getLiftModeLabel(mode?: number) {
  return mode == null ? 'Unknown' : liftModeLabels[mode] ?? `Mode ${mode}`
}

function getDoorStateToneClass(state?: RmfDoorStateValue) {
  if (!state)
    return 'bg-gray-100 text-gray-700'

  const classes: Record<number, string> = {
    0: 'bg-slate-100 text-slate-700',
    1: 'bg-blue-50 text-blue-700',
    2: 'bg-emerald-50 text-emerald-700',
    3: 'bg-red-50 text-red-700',
    4: 'bg-gray-100 text-gray-700',
  }
  return classes[state.currentMode] ?? 'bg-gray-100 text-gray-700'
}

function getLiftStateToneClass(state?: RmfLiftStateValue) {
  if (!state)
    return 'bg-gray-100 text-gray-700'
  if (state.currentMode === 4 || state.currentMode === 5)
    return 'bg-red-50 text-red-700'
  if (state.motionState === 1 || state.motionState === 2 || state.doorState === 1)
    return 'bg-blue-50 text-blue-700'
  if (state.doorState === 2 || state.currentMode === 2)
    return 'bg-emerald-50 text-emerald-700'

  return 'bg-violet-50 text-violet-700'
}

function getDoorStateStroke(state?: RmfDoorStateValue) {
  if (!state)
    return '#f59e0b'

  const colors: Record<number, string> = {
    0: '#64748b',
    1: '#2563eb',
    2: '#059669',
    3: '#dc2626',
    4: '#f59e0b',
  }
  return colors[state.currentMode] ?? '#f59e0b'
}

function getLiftStateStroke(state?: RmfLiftStateValue) {
  if (!state)
    return '#7c3aed'
  if (state.currentMode === 4 || state.currentMode === 5)
    return '#dc2626'
  if (state.motionState === 1 || state.motionState === 2 || state.doorState === 1)
    return '#2563eb'
  if (state.doorState === 2 || state.currentMode === 2)
    return '#059669'

  return '#7c3aed'
}

function getLiftStateFill(state?: RmfLiftStateValue) {
  if (!state)
    return '#7c3aed26'
  if (state.currentMode === 4 || state.currentMode === 5)
    return '#dc262626'
  if (state.motionState === 1 || state.motionState === 2 || state.doorState === 1)
    return '#2563eb26'
  if (state.doorState === 2 || state.currentMode === 2)
    return '#05966926'

  return '#7c3aed26'
}

function getLiftStateSummary(state?: RmfLiftStateValue) {
  if (!state)
    return 'Unknown'

  const destination = state.destinationFloor && state.destinationFloor !== state.currentFloor
    ? ` -> ${state.destinationFloor}`
    : ''

  return `${state.currentFloor || '--'}${destination} · ${getLiftMotionStateLabel(state.motionState)}`
}

function getDefaultDoorRequestDraft(_door: BuildingMapLevelMessage['doors'][number]): DoorRequestDraft {
  return {
    requesterId: 'manual_test',
  }
}

function getLiftFloorOptions(lift: BuildingMapMessage['lifts'][number], state?: RmfLiftStateValue) {
  const floors = [
    ...(state?.availableFloors ?? []),
    ...lift.levels,
    state?.currentFloor ?? '',
    state?.destinationFloor ?? '',
  ].map(value => value.trim()).filter(Boolean)

  return Array.from(new Set(floors))
}

function getDefaultLiftRequestDraft(lift: BuildingMapMessage['lifts'][number], state?: RmfLiftStateValue): LiftRequestDraft {
  const floors = getLiftFloorOptions(lift, state)
  return {
    sessionId: `zcbox_${lift.name}`,
    requestType: 1,
    destinationFloor: state?.destinationFloor || state?.currentFloor || floors[0] || '',
    doorState: 2,
  }
}

function isChargerWaypointName(name: string) {
  return /^c\d+$/i.test(name.trim())
}

function isChargerVertex(vertex: { name: string, params: Array<{ name: string, valueBool: boolean, valueString?: string }> }) {
  return vertex.params.some(param => param.name === 'is_charger' && param.valueBool)
    || isChargerWaypointName(vertex.name)
    || /charger|充电/.test(vertex.name.toLowerCase())
}

function isParkingVertex(vertex: { name: string, params: Array<{ name: string, valueBool: boolean, valueString?: string }> }) {
  return vertex.params.some(param => ['is_parking_spot', 'is_parking'].includes(param.name) && param.valueBool)
    || /^p\d+$/i.test(vertex.name)
}

function getWaypointKind(vertex: { name: string, params: Array<{ name: string, valueBool: boolean, valueString?: string }> }) {
  if (isChargerVertex(vertex))
    return 'Charger'
  if (isParkingVertex(vertex))
    return 'Parking'

  return 'Waypoint'
}

function getWaypointToneClass(vertex: { name: string, params: Array<{ name: string, valueBool: boolean, valueString?: string }> }) {
  if (isChargerVertex(vertex))
    return 'bg-emerald-50 text-emerald-700'
  if (isParkingVertex(vertex))
    return 'bg-sky-50 text-sky-700'

  return 'bg-blue-50 text-blue-700'
}

function getWaypointLabel(vertex: { name: string }, index: number) {
  return vertex.name || `Vertex ${index}`
}

function getGraphWaypointKey(graphName: string, vertex: { name: string }, index: number) {
  return `${graphName}:${index}:${vertex.name}`
}

function getNavWaypointOptions(buildingMap: BuildingMapMessage | null): TaskWaypointOption[] {
  const optionsByName = new Map<string, TaskWaypointOption>()
  for (const level of buildingMap?.levels ?? []) {
    for (const graph of level.graphs) {
      if (graph.type !== 'nav')
        continue

      for (const vertex of graph.vertices) {
        const name = vertex.name.trim()
        if (!name || optionsByName.has(name))
          continue

        optionsByName.set(name, {
          name,
          levelName: level.name,
          graphName: graph.name,
        })
      }
    }
  }

  return Array.from(optionsByName.values()).sort((a, b) => (
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  ))
}

function getChargerWaypointOptions(buildingMap: BuildingMapMessage | null): TaskWaypointOption[] {
  return getNavWaypointOptions(buildingMap).filter(option => isChargerWaypointName(option.name))
}

function formatBuildingMapParamValue(param: { valueBool: boolean, valueString: string, valueFloat: number, valueInt: number, type: number }) {
  if (param.valueString)
    return param.valueString
  if (param.valueBool)
    return 'true'
  if (Number.isFinite(param.valueFloat) && Math.abs(param.valueFloat) > 0)
    return formatNumber(param.valueFloat)
  if (Number.isFinite(param.valueInt) && param.valueInt !== 0)
    return formatInteger(param.valueInt)
  if (param.type === 4)
    return 'false'

  return '--'
}

function liftFootprintPoints(lift: BuildingMapMessage['lifts'][number]) {
  const halfWidth = Math.max(0.2, lift.width / 2)
  const halfDepth = Math.max(0.2, lift.depth / 2)
  const cos = Math.cos(lift.refYaw)
  const sin = Math.sin(lift.refYaw)

  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([x, y]) => ({
    x: lift.refX + x * cos - y * sin,
    y: lift.refY + x * sin + y * cos,
  }))
}

function getGraphSummary(graph: BuildingMapGraphMessage | null) {
  if (!graph)
    return 'No graph'

  return `${graph.vertices.length} vertices · ${graph.edges.length} edges`
}

type MapProjector = ReturnType<typeof createMapProjector>

interface DashboardMapPoint {
  x: number
  y: number
}

function clampNumber(value: number, min: number, max: number) {
  const finiteValue = Number.isFinite(value) ? value : min
  return Math.min(max, Math.max(min, finiteValue))
}

function markerScaleValue(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value != null && value > 0 ? value : fallback
}

function markerRgba(marker: RmfScheduleMarkerValue) {
  const color = marker.color ?? { r: 1, g: 0, b: 0, a: 1 }
  const r = clampNumber(color.r, 0, 1) * 255
  const g = clampNumber(color.g, 0, 1) * 255
  const b = clampNumber(color.b, 0, 1) * 255
  const a = Number.isFinite(color.a) && color.a > 0 ? clampNumber(color.a, 0, 1) : 0.6
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`
}

function markerStrokeWidth(marker: RmfScheduleMarkerValue, projector: MapProjector) {
  return clampNumber(markerScaleValue(marker.scale?.x, 0.05) / projector.scale, 1, 8)
}

function markerRadius(marker: RmfScheduleMarkerValue, projector: MapProjector) {
  return clampNumber(markerScaleValue(marker.scale?.x, 0.2) / projector.scale * 0.5, 2, 18)
}

function markerBoxSize(marker: RmfScheduleMarkerValue, projector: MapProjector) {
  return {
    width: clampNumber(markerScaleValue(marker.scale?.x, 0.2) / projector.scale, 4, 48),
    height: clampNumber(markerScaleValue(marker.scale?.y, 0.2) / projector.scale, 4, 48),
  }
}

function yawFromQuaternion(quaternion: RmfScheduleMarkerValue['pose']['orientation']) {
  const { x, y, z, w } = quaternion
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
}

function arrowHeadPoints(start: DashboardMapPoint, end: DashboardMapPoint, size: number) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length <= 0.001)
    return ''

  const unitX = dx / length
  const unitY = dy / length
  const left = {
    x: end.x - unitX * size - unitY * size * 0.55,
    y: end.y - unitY * size + unitX * size * 0.55,
  }
  const right = {
    x: end.x - unitX * size + unitY * size * 0.55,
    y: end.y - unitY * size - unitX * size * 0.55,
  }

  return `${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`
}

function renderScheduleMarker(marker: RmfScheduleMarkerValue, projector: MapProjector) {
  const key = `schedule-${marker.ns || 'default'}-${marker.id}`
  const color = markerRgba(marker)
  const strokeWidth = markerStrokeWidth(marker, projector)
  const radius = markerRadius(marker, projector)
  const points = marker.points ?? []
  const projectPoint = (point: DashboardMapPoint) => projector.project(point.x, point.y)

  if (marker.type === 4) {
    const projectedPoints = points.map(projectPoint)
    if (projectedPoints.length < 2)
      return null

    return (
      <polyline
        key={key}
        points={projectedPoints.map(point => `${point.x},${point.y}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  }

  if (marker.type === 5) {
    return (
      <g key={key}>
        {points.slice(0, points.length - 1).map((point, index) => {
          if (index % 2 !== 0)
            return null

          const start = projectPoint(point)
          const end = projectPoint(points[index + 1])
          return (
            <line
              key={`${key}-line-${index}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )
        })}
      </g>
    )
  }

  if (marker.type === 0) {
    const startWorld = points[0] ?? marker.pose
    const yaw = yawFromQuaternion(marker.pose.orientation)
    const length = markerScaleValue(marker.scale?.x, 0.5)
    const endWorld = points[1] ?? {
      x: marker.pose.x + Math.cos(yaw) * length,
      y: marker.pose.y + Math.sin(yaw) * length,
    }
    const start = projectPoint(startWorld)
    const end = projectPoint(endWorld)
    const head = arrowHeadPoints(start, end, clampNumber(strokeWidth * 3, 6, 16))

    return (
      <g key={key}>
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {head && <polygon points={head} fill={color} />}
      </g>
    )
  }

  if (marker.type === 1 || marker.type === 6) {
    const box = markerBoxSize(marker, projector)
    const boxPoints = marker.type === 6 ? points : [marker.pose]
    return (
      <g key={key}>
        {boxPoints.map((point, index) => {
          const center = projectPoint(point)
          return (
            <rect
              key={`${key}-box-${index}`}
              x={center.x - box.width / 2}
              y={center.y - box.height / 2}
              width={box.width}
              height={box.height}
              rx={2}
              fill={color}
            />
          )
        })}
      </g>
    )
  }

  if (marker.type === 9) {
    const point = projectPoint(marker.pose)
    return (
      <text key={key} x={point.x + 6} y={point.y - 6} fill={color} className="text-[11px] font-800">
        {marker.text || `${marker.ns}:${marker.id}`}
      </text>
    )
  }

  if (marker.type === 11) {
    return (
      <g key={key}>
        {points.slice(0, points.length - 2).map((point, index) => {
          if (index % 3 !== 0)
            return null

          const trianglePoints = [point, points[index + 1], points[index + 2]]
            .map(projectPoint)
            .map(projected => `${projected.x},${projected.y}`)
            .join(' ')
          return <polygon key={`${key}-triangle-${index}`} points={trianglePoints} fill={color} stroke={color} strokeWidth={1} />
        })}
      </g>
    )
  }

  const circlePoints = marker.type === 7 || marker.type === 8 ? points : [marker.pose]
  return (
    <g key={key}>
      {circlePoints.map((point, index) => {
        const center = projectPoint(point)
        return <circle key={`${key}-circle-${index}`} cx={center.x} cy={center.y} r={radius} fill={color} />
      })}
    </g>
  )
}

function DashboardPage({
  buildingMap,
  host,
  mapStatus,
  mapConnected,
  mapUpdatedAt,
  mapError,
  rmfStates,
  robots,
}: {
  buildingMap: BuildingMapMessage | null
  host: string
  mapStatus: string
  mapConnected: boolean
  mapUpdatedAt: number | null
  mapError: string | null
  rmfStates: FleetRmfStatesZenohState
  robots: FleetRobotDataMessage[]
}) {
  const fleetSiteNamespace = useFleetSiteNamespace()
  const buildingMapKey = prefixFleetSiteTopic(fleetSiteNamespace.namespace, buildingMapTopic)
  const doorRequestKey = prefixFleetSiteTopic(fleetSiteNamespace.namespace, doorRequestTopic)
  const liftRequestKey = prefixFleetSiteTopic(fleetSiteNamespace.namespace, liftRequestTopic)
  const [selectedLevelName, setSelectedLevelName] = useState('')
  const [selectedGraphName, setSelectedGraphName] = useState('')
  const [selectedRobotKey, setSelectedRobotKey] = useState('')
  const [selectedWaypointKey, setSelectedWaypointKey] = useState('')
  const [hoveredWaypointKey, setHoveredWaypointKey] = useState('')
  const [doorRequestDrafts, setDoorRequestDrafts] = useState<Record<string, DoorRequestDraft>>({})
  const [doorRequestFeedback, setDoorRequestFeedback] = useState<Record<string, DoorRequestCommandFeedback>>({})
  const [liftRequestDrafts, setLiftRequestDrafts] = useState<Record<string, LiftRequestDraft>>({})
  const [liftRequestFeedback, setLiftRequestFeedback] = useState<Record<string, LiftRequestCommandFeedback>>({})
  const [mapZoom, setMapZoom] = useState(1)
  const [layers, setLayers] = useState({
    images: true,
    nav: true,
    schedule: true,
    doors: true,
    lifts: true,
    robots: true,
    labels: true,
  })

  const levels = buildingMap?.levels ?? []
  const selectedLevel = useMemo(() => {
    if (levels.length === 0)
      return null

    return levels.find(level => level.name === selectedLevelName) ?? levels[0]
  }, [levels, selectedLevelName])
  const navGraphs = selectedLevel?.graphs.filter(graph => graph.type === 'nav') ?? []
  const selectedGraph = useMemo(() => {
    if (navGraphs.length === 0)
      return null

    return navGraphs.find(graph => graph.name === selectedGraphName) ?? navGraphs[0]
  }, [navGraphs, selectedGraphName])
  const selectedImage = selectedLevel?.images[0] ?? null
  const projector = selectedLevel ? createMapProjector(selectedLevel, selectedImage) : null
  const visibleRobots = useMemo(() => (
    selectedLevel
      ? robots.filter(robot => robot.location.hasPose && isRobotOnLevel(robot, selectedLevel))
      : []
  ), [robots, selectedLevel])
  const selectedRobot = visibleRobots.find(robot => getRobotKey(robot) === selectedRobotKey) ?? null
  const graphWaypoints = useMemo(() => (
    selectedGraph?.vertices.map((vertex, index) => ({
      graphName: selectedGraph.name,
      vertex,
      index,
      key: getGraphWaypointKey(selectedGraph.name, vertex, index),
    })) ?? []
  ), [selectedGraph])
  const selectedWaypointItem = graphWaypoints.find(item => item.key === selectedWaypointKey) ?? null
  const selectedWaypoint = selectedWaypointItem?.vertex ?? null
  const namedWaypoints = useMemo(() => (
    navGraphs
      .flatMap(graph => graph.vertices.map((vertex, index) => ({
        graphName: graph.name,
        vertex,
        index,
        key: getGraphWaypointKey(graph.name, vertex, index),
      })))
      .filter(item => item.vertex.name)
      .sort((a, b) => (
        a.vertex.name.localeCompare(b.vertex.name, undefined, { numeric: true, sensitivity: 'base' })
        || a.graphName.localeCompare(b.graphName, undefined, { numeric: true, sensitivity: 'base' })
      ))
  ), [navGraphs])
  const levelLifts = selectedLevel && buildingMap
    ? buildingMap.lifts.filter(lift => lift.levels.includes(selectedLevel.name))
    : []
  const scheduleMarkers = useMemo(() => (
    Object.values(rmfStates.scheduleMarkers).flatMap(namespaceMarkers => Object.values(namespaceMarkers))
  ), [rmfStates.scheduleMarkers])
  const observedDoorCount = Object.keys(rmfStates.doorStates).length
  const observedLiftCount = Object.keys(rmfStates.liftStates).length
  const observedScheduleMarkerCount = scheduleMarkers.length
  const scheduleMarkerBadgeClass = observedScheduleMarkerCount > 0
    ? 'bg-emerald-50 text-emerald-700'
    : rmfStates.connected
      ? 'bg-amber-50 text-amber-700'
      : 'bg-gray-100 text-gray-700'
  const scheduleMarkerStatus = observedScheduleMarkerCount > 0
    ? `${observedScheduleMarkerCount} active`
    : rmfStates.connected
      ? 'Waiting for next publish'
      : formatStatus(rmfStates.status, rmfStates.connected)
  const faultedRobots = visibleRobots.filter(robot => getRobotHealthTone(robot) === 'danger')
  const warningRobots = visibleRobots.filter(robot => getRobotHealthTone(robot) === 'warning')
  const activeRobots = visibleRobots.filter(robot => getRobotHealthTone(robot) === 'active')
  const mapZoomPercent = Math.round(mapZoom * 100)

  function updateMapZoom(value: number) {
    setMapZoom(Math.min(4, Math.max(0.25, value)))
  }

  function toggleLayer(key: keyof typeof layers) {
    setLayers(current => ({ ...current, [key]: !current[key] }))
  }

  function getDoorRequestDraft(door: BuildingMapLevelMessage['doors'][number]) {
    return doorRequestDrafts[door.name] ?? getDefaultDoorRequestDraft(door)
  }

  function updateDoorRequestDraft(door: BuildingMapLevelMessage['doors'][number], patch: Partial<DoorRequestDraft>) {
    setDoorRequestDrafts(current => ({
      ...current,
      [door.name]: {
        ...getDefaultDoorRequestDraft(door),
        ...current[door.name],
        ...patch,
      },
    }))
  }

  function setDoorRequestResult(doorName: string, status: DoorRequestCommandStatus, mode: number, message: string) {
    setDoorRequestFeedback(current => ({
      ...current,
      [doorName]: {
        status,
        mode,
        message,
        updatedAt: Date.now(),
      },
    }))
  }

  function publishDoorRequest(door: BuildingMapLevelMessage['doors'][number], requestedMode: number) {
    const draft = getDoorRequestDraft(door)
    const request: RmfDoorRequestMessage = {
      requesterId: draft.requesterId.trim(),
      doorName: door.name,
      requestedMode: {
        value: requestedMode,
      },
    }

    if (!window.zcDesktop?.isDesktop) {
      setDoorRequestResult(door.name, 'failed', requestedMode, 'Desktop app required')
      return
    }
    if (!host) {
      setDoorRequestResult(door.name, 'failed', requestedMode, 'Missing controller')
      return
    }
    if (fleetSiteNamespace.status === 'idle' || fleetSiteNamespace.status === 'loading') {
      setDoorRequestResult(door.name, 'failed', requestedMode, 'Loading site name')
      return
    }
    if (!doorRequestKey) {
      setDoorRequestResult(door.name, 'failed', requestedMode, fleetSiteNamespace.error || 'Missing site name')
      return
    }
    if (!request.requesterId) {
      setDoorRequestResult(door.name, 'failed', requestedMode, 'Missing requester')
      return
    }

    setDoorRequestResult(door.name, 'pending', requestedMode, 'pending')
    window.zcDesktop.publishZenohFleetDoorRequest({
      host,
      topic: doorRequestKey,
      request,
    }).then((result) => {
      setDoorRequestResult(door.name, result.ok ? 'sent' : 'failed', requestedMode, result.ok ? `${getDoorModeLabel(requestedMode)} sent` : 'send failed')
    }).catch((error) => {
      setDoorRequestResult(door.name, 'failed', requestedMode, `${error}`)
      console.warn('Failed to publish door request', error)
    })
  }

  function getLiftRequestDraft(lift: BuildingMapMessage['lifts'][number], state?: RmfLiftStateValue) {
    return liftRequestDrafts[lift.name] ?? getDefaultLiftRequestDraft(lift, state)
  }

  function updateLiftRequestDraft(lift: BuildingMapMessage['lifts'][number], state: RmfLiftStateValue | undefined, patch: Partial<LiftRequestDraft>) {
    setLiftRequestDrafts(current => ({
      ...current,
      [lift.name]: {
        ...getDefaultLiftRequestDraft(lift, state),
        ...current[lift.name],
        ...patch,
      },
    }))
  }

  function setLiftRequestResult(liftName: string, status: LiftRequestCommandStatus, message: string) {
    setLiftRequestFeedback(current => ({
      ...current,
      [liftName]: {
        status,
        message,
        updatedAt: Date.now(),
      },
    }))
  }

  function publishLiftRequest(lift: BuildingMapMessage['lifts'][number], state?: RmfLiftStateValue) {
    const draft = getLiftRequestDraft(lift, state)
    const request: RmfLiftRequestMessage = {
      liftName: lift.name,
      sessionId: draft.sessionId.trim(),
      requestType: draft.requestType,
      destinationFloor: draft.destinationFloor.trim(),
      doorState: draft.doorState,
    }

    if (!window.zcDesktop?.isDesktop) {
      setLiftRequestResult(lift.name, 'failed', 'Desktop app required')
      return
    }
    if (!host) {
      setLiftRequestResult(lift.name, 'failed', 'Missing controller')
      return
    }
    if (fleetSiteNamespace.status === 'idle' || fleetSiteNamespace.status === 'loading') {
      setLiftRequestResult(lift.name, 'failed', 'Loading site name')
      return
    }
    if (!liftRequestKey) {
      setLiftRequestResult(lift.name, 'failed', fleetSiteNamespace.error || 'Missing site name')
      return
    }
    if (!request.sessionId) {
      setLiftRequestResult(lift.name, 'failed', 'Missing session')
      return
    }
    if (request.requestType !== 0 && !request.destinationFloor) {
      setLiftRequestResult(lift.name, 'failed', 'Missing floor')
      return
    }

    setLiftRequestResult(lift.name, 'pending', 'pending')
    window.zcDesktop.publishZenohFleetLiftRequest({
      host,
      topic: liftRequestKey,
      request,
    }).then((result) => {
      setLiftRequestResult(lift.name, result.ok ? 'sent' : 'failed', result.ok ? 'sent' : 'send failed')
    }).catch((error) => {
      setLiftRequestResult(lift.name, 'failed', `${error}`)
      console.warn('Failed to publish lift request', error)
    })
  }

  useEffect(() => {
    if (levels.length === 0)
      return
    if (!levels.some(level => level.name === selectedLevelName))
      setSelectedLevelName(levels[0].name)
  }, [levels, selectedLevelName])

  useEffect(() => {
    if (navGraphs.length === 0) {
      if (selectedGraphName)
        setSelectedGraphName('')
      return
    }
    if (!navGraphs.some(graph => graph.name === selectedGraphName))
      setSelectedGraphName(navGraphs[0].name)
  }, [navGraphs, selectedGraphName])

  useEffect(() => {
    if (!selectedRobotKey)
      return
    if (!visibleRobots.some(robot => getRobotKey(robot) === selectedRobotKey))
      setSelectedRobotKey('')
  }, [selectedRobotKey, visibleRobots])

  useEffect(() => {
    if (!selectedWaypointKey)
      return
    if (!graphWaypoints.some(item => item.key === selectedWaypointKey))
      setSelectedWaypointKey('')
  }, [graphWaypoints, selectedWaypointKey])

  useEffect(() => {
    if (!hoveredWaypointKey)
      return
    if (!graphWaypoints.some(item => item.key === hoveredWaypointKey))
      setHoveredWaypointKey('')
  }, [graphWaypoints, hoveredWaypointKey])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Surface className="p-4">
          <div className="text-xs font-700 uppercase tracking-wide text-gray-500">Map source</div>
          <div className="mt-2 flex items-center gap-2">
            <span className={classNames('h-2.5 w-2.5 rounded-full', mapConnected ? 'bg-emerald-500' : 'bg-red-500')} />
            <span className="font-800 text-gray-900">{formatStatus(mapStatus, mapConnected)}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">{buildingMap?.key || buildingMapKey || buildingMapTopic} · {formatTime(mapUpdatedAt)}</div>
        </Surface>
        <Surface className="p-4">
          <div className="text-xs font-700 uppercase tracking-wide text-gray-500">Building</div>
          <div className="mt-2 truncate font-800 text-gray-900">{buildingMap?.name || '--'}</div>
          <div className="mt-1 text-xs text-gray-500">{levels.length} levels</div>
        </Surface>
        <Surface className="p-4">
          <div className="text-xs font-700 uppercase tracking-wide text-gray-500">Nav graph</div>
          <div className="mt-2 truncate font-800 text-gray-900">{selectedGraph?.name || '--'}</div>
          <div className="mt-1 text-xs text-gray-500">{getGraphSummary(selectedGraph)}</div>
        </Surface>
        <Surface className="p-4">
          <div className="text-xs font-700 uppercase tracking-wide text-gray-500">RMF state</div>
          <div className="mt-2 flex items-center gap-2">
            <span className={classNames('h-2.5 w-2.5 rounded-full', rmfStates.connected ? 'bg-emerald-500' : 'bg-red-500')} />
            <span className="font-800 text-gray-900">{formatStatus(rmfStates.status, rmfStates.connected)}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">{observedDoorCount} doors · {observedLiftCount} lifts · {observedScheduleMarkerCount} markers</div>
          {observedScheduleMarkerCount === 0 && rmfStates.connected && (
            <div className="mt-1 text-xs font-700 text-amber-700">Schedule waiting for publish</div>
          )}
        </Surface>
        <Surface className="p-4">
          <div className="text-xs font-700 uppercase tracking-wide text-gray-500">Robots on level</div>
          <div className="mt-2 font-800 text-gray-900">{visibleRobots.length}</div>
          <div className={classNames('mt-1 text-xs font-700', faultedRobots.length > 0 ? 'text-red-700' : 'text-gray-500')}>
            {faultedRobots.length > 0
              ? `${faultedRobots.length} need attention`
              : `${activeRobots.length} active · ${warningRobots.length} warnings`}
          </div>
        </Surface>
      </div>

      {mapError && (
        <div className="rounded-lg border-(solid 1px red-200) bg-red-50 px-4 py-3 text-sm text-red-700">{mapError}</div>
      )}
      {rmfStates.error && (
        <div className="rounded-lg border-(solid 1px red-200) bg-red-50 px-4 py-3 text-sm text-red-700">{rmfStates.error}</div>
      )}

      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-(b-solid 1px gray-200) p-4">
          <div>
            <div className="font-800 text-gray-900">Dashboard</div>
            <div className="text-xs text-gray-500">Map images, nav graph, RMF state, and fleet requests use site-namespaced Zenoh topics</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 rounded-lg border-(solid 1px gray-300) bg-white/85 px-3 text-sm outline-none focus:border-emerald-600"
              value={selectedLevel?.name ?? ''}
              onChange={event => setSelectedLevelName(event.target.value)}>
              {levels.map(level => <option key={level.name} value={level.name}>{level.name}</option>)}
              {levels.length === 0 && <option value="">No map</option>}
            </select>
            <select
              className="h-9 rounded-lg border-(solid 1px gray-300) bg-white/85 px-3 text-sm outline-none focus:border-emerald-600"
              value={selectedGraph?.name ?? ''}
              onChange={event => setSelectedGraphName(event.target.value)}>
              {navGraphs.map(graph => <option key={graph.name} value={graph.name}>{graph.name}</option>)}
              {navGraphs.length === 0 && <option value="">No nav graph</option>}
            </select>
            <div className="flex h-9 items-center gap-2 rounded-lg border-(solid 1px gray-300) bg-white/85 px-2">
              <IconButton
                icon="i-material-symbols-remove-rounded"
                title="Zoom out"
                disabled={!projector}
                onClick={() => updateMapZoom(mapZoom - 0.25)}
              />
              <input
                className="w-28 accent-emerald-600"
                type="range"
                min={0.25}
                max={4}
                step={0.25}
                title="Zoom"
                aria-label="Zoom"
                disabled={!projector}
                value={mapZoom}
                onChange={event => updateMapZoom(Number(event.target.value))}
              />
              <IconButton
                icon="i-material-symbols-add-rounded"
                title="Zoom in"
                disabled={!projector}
                onClick={() => updateMapZoom(mapZoom + 0.25)}
              />
              <button
                type="button"
                className="h-7 min-w-14 rounded-md px-2 text-xs font-800 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!projector}
                title="Reset zoom"
                onClick={() => updateMapZoom(1)}>
                {mapZoomPercent}%
              </button>
            </div>
            <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-lg border-(solid 1px gray-300) bg-white/85 px-2 py-1">
              {([
                ['images', 'Images'],
                ['nav', 'Nav'],
                ['schedule', 'Schedule'],
                ['doors', 'Doors'],
                ['lifts', 'Lifts'],
                ['robots', 'Robots'],
                ['labels', 'Labels'],
              ] as Array<[keyof typeof layers, string]>).map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-1 text-xs font-700 text-gray-700">
                  <input
                    className="accent-emerald-600"
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggleLayer(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {selectedLevel && projector
          ? (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-h-[42rem] overflow-auto bg-zinc-100 p-4">
                  <svg
                    className="mx-auto block max-w-none rounded-lg border-(solid 1px gray-300) bg-white shadow-sm"
                    viewBox={`0 0 ${projector.width} ${projector.height}`}
                    style={{
                      width: `${projector.width * mapZoom}px`,
                      height: `${projector.height * mapZoom}px`,
                    }}
                    role="img"
                    aria-label="RMF building map">
                    {selectedImage && layers.images && (
                      <image
                        href={`data:${getBuildingMapImageMime(selectedImage)};base64,${selectedImage.dataBase64}`}
                        x={0}
                        y={0}
                        width={projector.width}
                        height={projector.height}
                        preserveAspectRatio="none"
                      />
                    )}

                    {layers.doors && selectedLevel.doors.map((door) => {
                      const p1 = projector.project(door.v1X, door.v1Y)
                      const p2 = projector.project(door.v2X, door.v2Y)
                      const doorState = getRmfDoorState(door.name, rmfStates)
                      const stroke = getDoorStateStroke(doorState)
                      return (
                        <g key={door.name}>
                          <line
                            x1={p1.x}
                            y1={p1.y}
                            x2={p2.x}
                            y2={p2.y}
                            stroke={stroke}
                            strokeWidth={doorState ? 5 : 4}
                            strokeDasharray={doorState?.currentMode === 3 ? '8 5' : undefined}
                            strokeLinecap="round"
                          />
                          {layers.labels && (
                            <text x={(p1.x + p2.x) / 2 + 5} y={(p1.y + p2.y) / 2 - 5} fill={stroke} className="text-[11px] font-700">
                              {doorState ? `${door.name} · ${getDoorModeLabel(doorState.currentMode)}` : door.name}
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {layers.lifts && levelLifts.map((lift) => {
                      const points = liftFootprintPoints(lift).map(point => projector.project(point.x, point.y))
                      const center = projector.project(lift.refX, lift.refY)
                      const liftState = getRmfLiftState(lift.name, rmfStates)
                      const stroke = getLiftStateStroke(liftState)
                      return (
                        <g key={lift.name}>
                          <polygon
                            points={points.map(point => `${point.x},${point.y}`).join(' ')}
                            fill={getLiftStateFill(liftState)}
                            stroke={stroke}
                            strokeWidth={liftState ? 3 : 2}
                          />
                          {layers.labels && (
                            <text x={center.x + 6} y={center.y - 6} fill={stroke} className="text-[11px] font-800">
                              {liftState ? `${lift.name} · ${getLiftStateSummary(liftState)}` : lift.name}
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {layers.nav && selectedGraph?.edges.map((edge, index) => {
                      const v1 = selectedGraph.vertices[edge.v1]
                      const v2 = selectedGraph.vertices[edge.v2]
                      if (!v1 || !v2)
                        return null

                      const p1 = projector.project(v1.x, v1.y)
                      const p2 = projector.project(v2.x, v2.y)
                      return <line key={`${edge.v1}-${edge.v2}-${index}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#2563eb" strokeWidth={2} strokeOpacity={0.72} />
                    })}

                    {layers.nav && selectedGraph?.vertices.map((vertex, index) => {
                      const point = projector.project(vertex.x, vertex.y)
                      const waypointKey = getGraphWaypointKey(selectedGraph.name, vertex, index)
                      const isSelected = selectedWaypointKey === waypointKey
                      const isHovered = hoveredWaypointKey === waypointKey
                      const isCharger = isChargerVertex(vertex)
                      const isParking = isParkingVertex(vertex)
                      return (
                        <g
                          key={`${vertex.name || 'vertex'}-${index}`}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredWaypointKey(waypointKey)}
                          onMouseLeave={() => setHoveredWaypointKey(current => current === waypointKey ? '' : current)}
                          onClick={() => {
                            setSelectedWaypointKey(waypointKey)
                            setSelectedRobotKey('')
                          }}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r={isSelected ? 7 : isCharger || isParking ? 5 : 3.5}
                            fill={isSelected ? '#f97316' : isCharger ? '#059669' : isParking ? '#0284c7' : '#1d4ed8'}
                            stroke="#ffffff"
                            strokeWidth={isSelected ? 2.5 : 1.5}
                          />
                          {layers.labels && isHovered && vertex.name && (
                            <text x={point.x + 6} y={point.y - 6} className="fill-gray-900 text-[10px] font-700 drop-shadow-sm">{vertex.name}</text>
                          )}
                        </g>
                      )
                    })}

                    {layers.schedule && scheduleMarkers.map(marker => renderScheduleMarker(marker, projector))}

                    {layers.robots && visibleRobots.map((robot) => {
                      const robotKey = getRobotKey(robot)
                      const isSelected = selectedRobotKey === robotKey
                      const posePoint = projector.project(robot.location.x, robot.location.y)
                      const footprint = robotFootprintPoints(robot).map(point => projector.project(point.x, point.y))
                      const footprintText = footprint.map(point => `${point.x},${point.y}`).join(' ')
                      const radius = robot.hasFootprint && robot.footprint.isRound && robot.footprint.radius > 0
                        ? robot.footprint.radius / projector.scale
                        : 8
                      return (
                        <g
                          key={robotKey}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedRobotKey(robotKey)
                            setSelectedWaypointKey('')
                          }}>
                          {robot.hasFootprint && robot.footprint.isRound
                            ? <circle cx={posePoint.x} cy={posePoint.y} r={radius} fill={isSelected ? '#2563eb66' : '#dc262640'} stroke={isSelected ? '#1d4ed8' : '#dc2626'} strokeWidth={isSelected ? 3 : 2} />
                            : <polygon points={footprintText} fill={isSelected ? '#2563eb66' : '#dc262640'} stroke={isSelected ? '#1d4ed8' : '#dc2626'} strokeWidth={isSelected ? 3 : 2} />}
                          <circle cx={posePoint.x} cy={posePoint.y} r={isSelected ? 5 : 4} fill={isSelected ? '#1d4ed8' : '#dc2626'} />
                          <line
                            x1={posePoint.x}
                            y1={posePoint.y}
                            x2={posePoint.x + Math.cos(robot.location.yaw) * 18}
                            y2={posePoint.y - Math.sin(robot.location.yaw) * 18}
                            stroke={isSelected ? '#1d4ed8' : '#dc2626'}
                            strokeWidth={2}
                            strokeLinecap="round"
                          />
                          {layers.labels && <text x={posePoint.x + 8} y={posePoint.y + 14} className={classNames('text-[11px] font-800', isSelected ? 'fill-blue-700' : 'fill-red-700')}>{getRobotName(robot)}</text>}
                        </g>
                      )
                    })}
                  </svg>
                </div>

                <div className="border-(t-solid 1px gray-200) bg-white/70 p-4 xl:border-(l-solid 1px gray-200) xl:border-t-0">
                  <div className="space-y-4">
                    <section>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-800 text-gray-900">Focus</div>
                          <div className="text-xs text-gray-500">{selectedLevel.name}</div>
                        </div>
                        {selectedRobot && (
                          <Badge className={getDashboardToneClass(getRobotHealthTone(selectedRobot))}>
                            {getRobotHealthLabel(getRobotHealthTone(selectedRobot))}
                          </Badge>
                        )}
                        {!selectedRobot && selectedWaypoint && (
                          <Badge className={getWaypointToneClass(selectedWaypoint)}>
                            {getWaypointKind(selectedWaypoint)}
                          </Badge>
                        )}
                      </div>

                      {selectedRobot
                        ? (
                            <div className="mt-3 rounded-lg border-(solid 1px gray-200) bg-white/85 p-3">
                              <div className="min-w-0 truncate text-lg font-900 text-gray-900">{getRobotName(selectedRobot)}</div>
                              <div className={classNames('mt-1 text-sm font-800', getRobotStatusClass(selectedRobot.status))}>
                                {selectedRobot.status || '--'}
                              </div>
                              <div className="text-xs text-gray-500">{selectedRobot.statusDetail || selectedRobot.mode || selectedRobot.taskId || '--'}</div>

                              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                <div className="rounded-lg bg-gray-50 p-2">
                                  <div className="text-xs font-700 uppercase text-gray-500">Position</div>
                                  <div className="mt-1 font-800">x {formatNumber(selectedRobot.location.x)}</div>
                                  <div className="text-xs text-gray-500">y {formatNumber(selectedRobot.location.y)}</div>
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                  <div className="text-xs font-700 uppercase text-gray-500">Yaw</div>
                                  <div className="mt-1 font-800">{formatNumber(selectedRobot.location.yaw)}</div>
                                  <div className="text-xs text-gray-500">{selectedRobot.location.levelName || selectedRobot.map || '--'}</div>
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                  <div className="text-xs font-700 uppercase text-gray-500">Battery</div>
                                  <div className="mt-1 font-800">
                                    {selectedRobot.hasBatteryPercent
                                      ? `${formatNumber(selectedRobot.batteryPercent, 1)}%`
                                      : selectedRobot.hasBattery
                                        ? formatNumber(selectedRobot.battery)
                                        : '--'}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {selectedRobot.hasBatteryCurrent ? `${formatNumber(selectedRobot.batteryCurrent, 2)} A` : '--'}
                                  </div>
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                  <div className="text-xs font-700 uppercase text-gray-500">Task</div>
                                  <div className="mt-1 truncate font-800">{selectedRobot.taskId || '--'}</div>
                                  <div className="truncate text-xs text-gray-500">{selectedRobot.activityId || selectedRobot.mode || '--'}</div>
                                </div>
                              </div>

                              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                                <div className="font-800 text-gray-800">Robot footprint</div>
                                <div className="mt-1">
                                  {selectedRobot.hasFootprint
                                    ? selectedRobot.footprint.isRound
                                      ? `Round · r ${formatNumber(selectedRobot.footprint.radius)}`
                                      : `Rectangle · l ${formatNumber(selectedRobot.footprint.robotLength)} · w ${formatNumber(selectedRobot.footprint.robotWidth)}`
                                    : 'Default rectangle · l 0.80 · w 0.60'}
                                </div>
                                <div className="mt-1">nav center offset {formatNumber(selectedRobot.hasFootprint ? selectedRobot.footprint.navCenterToRobotCenter : 0)}</div>
                                <div className="mt-1">wheels {getWheelSummary(selectedRobot)} · diagnostics {getDiagnosticsSummary(selectedRobot)}</div>
                              </div>
                            </div>
                          )
                        : selectedWaypoint && selectedWaypointItem
                          ? (
                              <div className="mt-3 rounded-lg border-(solid 1px orange-200) bg-orange-50/70 p-3">
                                <div className="min-w-0 truncate text-lg font-900 text-gray-900">
                                  {getWaypointLabel(selectedWaypoint, selectedWaypointItem.index)}
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                  <div className="rounded-lg bg-white/80 p-2">
                                    <div className="text-xs font-700 uppercase text-gray-500">X</div>
                                    <div className="mt-1 font-800">{formatNumber(selectedWaypoint.x)}</div>
                                  </div>
                                  <div className="rounded-lg bg-white/80 p-2">
                                    <div className="text-xs font-700 uppercase text-gray-500">Y</div>
                                    <div className="mt-1 font-800">{formatNumber(selectedWaypoint.y)}</div>
                                  </div>
                                </div>
                                {selectedWaypoint.params.length > 0 && (
                                  <div className="mt-3 space-y-1 text-xs text-gray-600">
                                    {selectedWaypoint.params.slice(0, 5).map(param => (
                                      <div key={param.name} className="flex items-center justify-between gap-3">
                                        <span className="truncate font-700 text-gray-700">{param.name}</span>
                                        <span className="shrink-0 text-gray-500">{formatBuildingMapParamValue(param)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          : (
                              <div className="mt-3 rounded-lg border-(solid 1px gray-200) bg-white/85 p-3">
                                <div className="font-900 text-gray-900">{selectedLevel.name}</div>
                                <div className="mt-1 text-xs text-gray-500">{getGraphSummary(selectedGraph)}</div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                  <div className="rounded-lg bg-gray-50 p-2">
                                    <div className="text-xs font-700 uppercase text-gray-500">Images</div>
                                    <div className="mt-1 font-800">{selectedLevel.images.length}</div>
                                  </div>
                                  <div className="rounded-lg bg-gray-50 p-2">
                                    <div className="text-xs font-700 uppercase text-gray-500">Waypoints</div>
                                    <div className="mt-1 font-800">{namedWaypoints.length}</div>
                                  </div>
                                  <div className="rounded-lg bg-gray-50 p-2">
                                    <div className="text-xs font-700 uppercase text-gray-500">Doors</div>
                                    <div className="mt-1 font-800">{selectedLevel.doors.length}</div>
                                  </div>
                                  <div className="rounded-lg bg-gray-50 p-2">
                                    <div className="text-xs font-700 uppercase text-gray-500">Lifts</div>
                                    <div className="mt-1 font-800">{levelLifts.length}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                    </section>

	                    <section>
	                      <div className="flex items-center justify-between gap-3">
	                        <div className="font-800 text-gray-900">Robots</div>
	                        <Badge className={faultedRobots.length > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'}>
	                          {visibleRobots.length}
                        </Badge>
                      </div>
                      <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
                        {visibleRobots.length > 0
                          ? visibleRobots.map((robot) => {
                              const robotKey = getRobotKey(robot)
                              const tone = getRobotHealthTone(robot)
                              const isSelected = selectedRobotKey === robotKey
                              return (
                                <button
                                  key={robotKey}
                                  type="button"
                                  className={classNames(
                                    'w-full rounded-lg border-(solid 1px gray-200) bg-white/85 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/60',
                                    isSelected && 'border-blue-400 bg-blue-50',
                                  )}
                                  onClick={() => {
                                    setSelectedRobotKey(robotKey)
                                    setSelectedWaypointKey('')
                                  }}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0 truncate font-800 text-gray-900">{getRobotName(robot)}</div>
                                    <Badge className={getDashboardToneClass(tone)}>{getRobotHealthLabel(tone)}</Badge>
                                  </div>
                                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500">
                                    <span className="truncate">{robot.status || robot.mode || '--'}</span>
                                    <span className="shrink-0">x {formatNumber(robot.location.x, 1)} · y {formatNumber(robot.location.y, 1)}</span>
                                  </div>
                                </button>
                              )
                            })
                          : <div className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No robot pose on this level</div>}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-800 text-gray-900">Schedule markers</div>
                        <Badge className={scheduleMarkerBadgeClass}>{observedScheduleMarkerCount}</Badge>
                      </div>
                      <div className={classNames(
                        'mt-2 rounded-lg border-(solid 1px gray-200) bg-white/85 p-3 text-sm',
                        observedScheduleMarkerCount > 0 ? 'text-emerald-700' : rmfStates.connected ? 'text-amber-700' : 'text-gray-500',
                      )}>
                        <div className="font-800">{scheduleMarkerStatus}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          /schedule_markers · {rmfStates.scheduleMarkersUpdatedAt ? `updated ${formatTime(rmfStates.scheduleMarkersUpdatedAt)}` : 'no MarkerArray received'}
                        </div>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-800 text-gray-900">Waypoints</div>
                        <Badge className="bg-gray-100 text-gray-700">{namedWaypoints.length}</Badge>
                      </div>
                      <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
                        {namedWaypoints.length > 0
                          ? namedWaypoints.map(item => (
                              <button
                                key={item.key}
                                type="button"
                                className={classNames(
                                  'w-full rounded-lg border-(solid 1px gray-200) bg-white/85 p-3 text-left transition hover:border-orange-300 hover:bg-orange-50/60',
                                  selectedWaypointKey === item.key && 'border-orange-400 bg-orange-50',
                                )}
	                                onClick={() => {
	                                  setSelectedGraphName(item.graphName)
	                                  setSelectedWaypointKey(item.key)
	                                  setSelectedRobotKey('')
	                                }}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0 truncate font-800 text-gray-900">{item.vertex.name}</div>
                                  <Badge className={getWaypointToneClass(item.vertex)}>{getWaypointKind(item.vertex)}</Badge>
                                </div>
	                                <div className="mt-1 text-xs text-gray-500">
	                                  {item.graphName} · x {formatNumber(item.vertex.x)} · y {formatNumber(item.vertex.y)}
	                                </div>
	                              </button>
                            ))
                          : <div className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No named waypoints on this graph</div>}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-800 text-gray-900">Building systems</div>
                        <Badge className="bg-gray-100 text-gray-700">{selectedLevel.doors.length + levelLifts.length}</Badge>
                      </div>
                      <div className="mt-2 space-y-2">
                        {selectedLevel.doors.slice(0, 8).map((door) => {
                          const doorState = getRmfDoorState(door.name, rmfStates)
                          const draft = getDoorRequestDraft(door)
                          const feedback = doorRequestFeedback[door.name]
                          return (
                            <div key={door.name} className="rounded-lg border-(solid 1px gray-200) bg-white/85 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 truncate font-800 text-gray-900">{door.name}</div>
                                <Badge className={getDoorStateToneClass(doorState)}>{getDoorModeLabel(doorState?.currentMode)}</Badge>
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                range {formatNumber(door.motionRange)} · direction {formatInteger(door.motionDirection)} · updated {doorState ? formatAge(doorState.updatedAt) : '--'}
                              </div>
                              <div className="mt-3 text-xs">
                                <label className="block min-w-0">
                                  <span className="font-700 uppercase text-gray-500">Requester</span>
                                  <input
                                    className="mt-1 h-8 w-full rounded-md border-(solid 1px gray-300) bg-white px-2 outline-none focus:border-emerald-600"
                                    value={draft.requesterId}
                                    onChange={event => updateDoorRequestDraft(door, { requesterId: event.target.value })}
                                  />
                                </label>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <div className={classNames('min-w-0 truncate text-xs', feedback?.status === 'failed' ? 'text-red-700' : feedback?.status === 'sent' ? 'text-emerald-700' : 'text-gray-500')}>
                                  {feedback ? `${feedback.message} · ${formatTime(feedback.updatedAt)}` : doorRequestTopic}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  {doorRequestModeOptions.map(option => (
                                    <Button
                                      key={option.value}
                                      className="h-8 px-2 text-xs"
                                      icon={option.icon}
                                      disabled={feedback?.status === 'pending' || !host}
                                      onClick={() => publishDoorRequest(door, option.value)}
                                    >
                                      {option.label}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {levelLifts.slice(0, 8).map((lift) => {
                          const liftState = getRmfLiftState(lift.name, rmfStates)
                          const floorOptions = getLiftFloorOptions(lift, liftState)
                          const draft = getLiftRequestDraft(lift, liftState)
                          const feedback = liftRequestFeedback[lift.name]
                          return (
                            <div key={lift.name} className="rounded-lg border-(solid 1px gray-200) bg-white/85 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 truncate font-800 text-gray-900">{lift.name}</div>
                                <Badge className={getLiftStateToneClass(liftState)}>{getLiftModeLabel(liftState?.currentMode)}</Badge>
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {liftState
                                  ? `floor ${liftState.currentFloor || '--'} -> ${liftState.destinationFloor || '--'} · door ${getLiftDoorStateLabel(liftState.doorState)} · motion ${getLiftMotionStateLabel(liftState.motionState)}`
                                  : `levels ${lift.levels.join(', ') || '--'}`}
                              </div>
                              {liftState?.sessionId && <div className="mt-1 truncate text-xs text-gray-400">session {liftState.sessionId}</div>}
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <label className="block min-w-0">
                                  <span className="font-700 uppercase text-gray-500">Mode</span>
                                  <select
                                    className="mt-1 h-8 w-full rounded-md border-(solid 1px gray-300) bg-white px-2 outline-none focus:border-emerald-600"
                                    value={draft.requestType}
                                    onChange={event => updateLiftRequestDraft(lift, liftState, { requestType: Number(event.target.value) })}
                                  >
                                    {liftRequestTypeOptions.map(option => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block min-w-0">
                                  <span className="font-700 uppercase text-gray-500">Door</span>
                                  <select
                                    className="mt-1 h-8 w-full rounded-md border-(solid 1px gray-300) bg-white px-2 outline-none focus:border-emerald-600"
                                    value={draft.doorState}
                                    onChange={event => updateLiftRequestDraft(lift, liftState, { doorState: Number(event.target.value) })}
                                  >
                                    {liftDoorRequestOptions.map(option => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block min-w-0">
                                  <span className="font-700 uppercase text-gray-500">Floor</span>
                                  {floorOptions.length > 0
                                    ? (
                                        <select
                                          className="mt-1 h-8 w-full rounded-md border-(solid 1px gray-300) bg-white px-2 outline-none focus:border-emerald-600"
                                          value={draft.destinationFloor}
                                          onChange={event => updateLiftRequestDraft(lift, liftState, { destinationFloor: event.target.value })}
                                        >
                                          {floorOptions.map(floor => <option key={floor} value={floor}>{floor}</option>)}
                                        </select>
                                      )
                                    : (
                                        <input
                                          className="mt-1 h-8 w-full rounded-md border-(solid 1px gray-300) bg-white px-2 outline-none focus:border-emerald-600"
                                          value={draft.destinationFloor}
                                          onChange={event => updateLiftRequestDraft(lift, liftState, { destinationFloor: event.target.value })}
                                        />
                                      )}
                                </label>
                                <label className="block min-w-0">
                                  <span className="font-700 uppercase text-gray-500">Session</span>
                                  <input
                                    className="mt-1 h-8 w-full rounded-md border-(solid 1px gray-300) bg-white px-2 outline-none focus:border-emerald-600"
                                    value={draft.sessionId}
                                    onChange={event => updateLiftRequestDraft(lift, liftState, { sessionId: event.target.value })}
                                  />
                                </label>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <div className={classNames('min-w-0 truncate text-xs', feedback?.status === 'failed' ? 'text-red-700' : feedback?.status === 'sent' ? 'text-emerald-700' : 'text-gray-500')}>
                                  {feedback ? `${feedback.message} · ${formatTime(feedback.updatedAt)}` : liftRequestTopic}
                                </div>
                                <Button
                                  className="h-8 shrink-0 px-2 text-xs"
                                  icon="i-material-symbols-publish-rounded"
                                  disabled={feedback?.status === 'pending' || !host}
                                  onClick={() => publishLiftRequest(lift, liftState)}
                                >
                                  Send
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                        {selectedLevel.doors.length + levelLifts.length === 0 && (
                          <div className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No doors or lifts on this level</div>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )
          : (
              <div className="px-4 py-16 text-center text-sm text-gray-500">Waiting for BuildingMap from Zenoh {buildingMapKey || buildingMapTopic}</div>
            )}
      </Surface>
    </div>
  )
}

const didoBitRows = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
]

function DidoBits({ message }: { message?: DidoValue }) {
  if (!message)
    return <span className="text-gray-400">--</span>

  if (message.data.length === 0)
    return <span className="text-gray-400">空</span>

  return (
    <div className="min-w-30 space-y-1">
      {message.data.flatMap((byte, byteIndex) => (
        didoBitRows.map(bitRow => (
          <div key={`${message.key}-${byteIndex}-${bitRow[0]}`} className="flex items-center gap-1">
            <span className="w-5 text-[10px] text-gray-500">B{byteIndex}</span>
            {bitRow.map((bitIndex) => {
              const enabled = (byte & (1 << bitIndex)) !== 0
              return (
                <span
                  key={bitIndex}
                  title={`byte ${byteIndex} bit ${bitIndex}: ${enabled ? 1 : 0}`}
                  className={classNames(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[10px] font-700 tabular-nums',
                    enabled
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-gray-50 text-gray-400',
                  )}
                >
                  {bitIndex}:{enabled ? 1 : 0}
                </span>
              )
            })}
          </div>
        ))
      ))}
      <div className="text-[10px] text-gray-400">{formatTime(message.updatedAt)}</div>
    </div>
  )
}

function DigitalBitChip({
  label,
  value,
  readOnly = false,
}: {
  label: string
  value: boolean | null
  readOnly?: boolean
}) {
  return (
    <span
      title={`${label}: ${formatOutputState(value)}${readOnly ? ', read-only' : ''}`}
      className={classNames(
        'inline-flex h-8 min-w-13 items-center justify-center rounded-md border px-2 text-xs font-800 tabular-nums',
        value == null
          ? 'border-gray-200 bg-gray-50 text-gray-400'
          : value
            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
            : 'border-gray-300 bg-white text-gray-500',
      )}
    >
      {label} {value == null ? '?' : value ? 1 : 0}
    </span>
  )
}

function PeripheralStatePanel({
  robot,
  dido,
  namespace,
  host,
}: {
  robot: FleetRobotDataMessage | null
  dido?: RobotDidoValues
  namespace: string
  host: string
}) {
  const [feedbackByControl, setFeedbackByControl] = useState<Record<string, DigitalOutputCommandFeedback>>({})
  const inputBits = useMemo(() => didoBits(dido?.di), [dido?.di])
  const outputBits = useMemo(() => didoBits(dido?.do), [dido?.do])

  useEffect(() => {
    return window.zcDesktop?.onZenohCommand((message) => {
      if (message.type !== 'service-response' || message.service !== 'write_coil' || !message.requestId)
        return

      const controlId = message.controlId || message.requestId.split(':')[0]
      if (!controlId)
        return

      setFeedbackByControl(current => ({
        ...current,
        [controlId]: {
          status: message.success ? 'sent' : 'failed',
          value: message.value,
          message: message.message || (message.success ? 'accepted' : 'failed'),
          updatedAt: Date.now(),
        },
      }))
    }) ?? (() => {})
  }, [])

  function commandOutput(control: DigitalOutputControl, value: boolean) {
    if (!window.zcDesktop?.isDesktop) {
      setFeedbackByControl(current => ({
        ...current,
        [control.id]: {
          status: 'failed',
          value,
          message: 'Desktop app required',
          updatedAt: Date.now(),
        },
      }))
      return
    }

    if (!host || !namespace) {
      setFeedbackByControl(current => ({
        ...current,
        [control.id]: {
          status: 'failed',
          value,
          message: 'Missing robot command path',
          updatedAt: Date.now(),
        },
      }))
      return
    }

    const requestId = `${control.id}:${Date.now()}`
    setFeedbackByControl(current => ({
      ...current,
      [control.id]: {
        status: 'pending',
        value,
        message: 'pending',
        updatedAt: Date.now(),
      },
    }))

    window.zcDesktop.publishZenohFleetDigitalOutputCommand({
      host,
      servicePath: `${namespace}/dido/write_coil`,
      address: control.address,
      value,
      requestId,
      controlId: control.id,
    }).then((result) => {
      if (!result.ok) {
        setFeedbackByControl(current => ({
          ...current,
          [control.id]: {
            status: 'failed',
            value,
            message: 'send failed',
            updatedAt: Date.now(),
          },
        }))
      }
    }).catch((error) => {
      setFeedbackByControl(current => ({
        ...current,
        [control.id]: {
          status: 'failed',
          value,
          message: `${error}`,
          updatedAt: Date.now(),
        },
      }))
      console.warn('Failed to command digital output', error)
    })
  }

  return (
    <Surface className="mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
        <div>
          <div className="font-800">Peripheral State</div>
          <div className="text-xs text-gray-500">{robot ? getRobotName(robot) : 'Select a robot'} · {namespace || 'No command path'}</div>
        </div>
        <div className="text-xs font-700 text-gray-500">Observed state from D/O only</div>
      </div>

      {robot
        ? (
            <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[1fr_1.2fr]">
              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 bg-white/80 p-3">
                    <div className="text-xs font-700 text-gray-500">Power</div>
                    <div className="mt-1 text-sm text-gray-900">{robot.mode || robot.status || '--'}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white/80 p-3">
                    <div className="text-xs font-700 text-gray-500">Motion</div>
                    <div className="mt-1 text-sm text-gray-900">{getWheelSummary(robot)}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white/80 p-3">
                    <div className="text-xs font-700 text-gray-500">Fork/Lift</div>
                    <div className="mt-1 text-sm text-gray-900">{robot.hasWheelState ? `${robot.wheels.motors.length} motors` : '--'}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white/80 p-3">
                    <div className="text-xs font-700 text-gray-500">Shelf/Pallet</div>
                    <div className="mt-1 text-sm text-gray-900">
                      {robot.hasPalletState ? `stock ${robot.palletState.palletStock}` : '--'}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white/80 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-800">I/O</div>
                    <div className="text-xs text-gray-500">I is read-only</div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-xs font-700 uppercase text-gray-500">Inputs</div>
                      <div className="flex flex-wrap gap-2">
                        {inputBits.length > 0
                          ? inputBits.map(bit => <DigitalBitChip key={`i-${bit.index}`} label={digitalBitLabel('I', bit.index)} value={bit.value} readOnly />)
                          : <span className="text-sm text-gray-400">Waiting for I state</span>}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-700 uppercase text-gray-500">Outputs</div>
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: Math.max(outputBits.length, minimumDigitalOutputCount) }, (_, index) => (
                          <DigitalBitChip key={`o-${index}`} label={digitalBitLabel('O', index)} value={didoBitValue(dido?.do, index)} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white/80 p-3">
                <div className="mb-3">
                  <div className="font-800">Output Controls</div>
                  <div className="text-xs text-gray-500">Predefined controls only. Status waits for observed O state.</div>
                </div>
                <div className="space-y-2">
                  {predefinedDigitalOutputControls.map((control) => {
                    const observedValue = didoBitValue(dido?.do, control.outputIndex)
                    const feedback = feedbackByControl[control.id]
                    const disabled = observedValue == null || !namespace || !host
                    return (
                      <div key={control.id} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50/80 p-3 sm:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-800 text-gray-900">{control.label}</div>
                            <DigitalBitChip label={digitalBitLabel('O', control.outputIndex)} value={observedValue} />
                            <Badge className={observedValue == null ? 'bg-gray-100 text-gray-500' : observedValue ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-gray-600'}>
                              {formatOutputState(observedValue)}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            coil {control.address}
                            {feedback ? ` · ${feedback.status} ${feedback.value ? 1 : 0} · ${feedback.message}` : ' · idle'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:justify-end">
                          <Button
                            className="h-8 px-2 text-xs"
                            disabled={disabled || feedback?.status === 'pending'}
                            onClick={() => commandOutput(control, true)}
                          >
                            Set 1
                          </Button>
                          <Button
                            className="h-8 px-2 text-xs"
                            disabled={disabled || feedback?.status === 'pending'}
                            onClick={() => commandOutput(control, false)}
                          >
                            Set 0
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          )
        : (
            <div className="px-4 py-10 text-center text-sm text-gray-500">Select a robot to inspect peripherals</div>
          )}
    </Surface>
  )
}

function WheelStatesPanel({
  robot,
  wheelState,
  stream,
  now,
}: {
  robot: FleetRobotDataMessage | null
  wheelState?: WheelStateValue
  stream: FleetWheelStatesZenohState
  now: number
}) {
  return (
    <Surface className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
        <div>
          <div className="font-800 text-gray-900">Wheel State</div>
          <div className="text-xs text-gray-500">
            {robot ? getRobotName(robot) : 'Select a robot'} · Updated {wheelState ? formatAge(wheelState.updatedAt, now) : '--'}
          </div>
        </div>
        <Badge className={getWheelStateToneClass(wheelState)}>
          {getWheelStateSummary(wheelState)}
        </Badge>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
          <span>{formatStatus(stream.status, stream.connected)}</span>
          {stream.error && <span className="text-red-700">{stream.error}</span>}
        </div>

        {!robot && (
          <div className="rounded-lg bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">
            Select a robot to inspect wheel motors.
          </div>
        )}

        {robot && !wheelState && (
          <div className="rounded-lg bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">
            Waiting for wheel state.
          </div>
        )}

        {robot && wheelState && wheelState.motorStates.length === 0 && (
          <div className="rounded-lg bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">
            No wheel motors reported.
          </div>
        )}

        {robot && wheelState && wheelState.motorStates.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {wheelState.motorStates.map(motor => (
              <section key={`${motor.id}-${motor.name}`} className="rounded-lg border-(solid 1px gray-200) bg-white/75 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-800 text-gray-900">{motor.name || `Motor ${motor.id}`}</div>
                    <div className="mt-0.5 text-xs text-gray-500">ID {motor.id}</div>
                  </div>
                  <Badge className={motor.isFaulted ? 'bg-red-50 text-red-700' : motor.isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>
                    {motor.isFaulted ? 'Fault' : motor.isConnected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className={motor.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}>
                    {motor.isEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <Badge className={motor.isPowered ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}>
                    {motor.isPowered ? 'Powered' : 'Unpowered'}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Voltage</div>
                    <div className="font-800 tabular-nums text-gray-900">{formatNumber(motor.voltage, 2)} V</div>
                  </div>
                  <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Speed</div>
                    <div className="font-800 tabular-nums text-gray-900">{formatNumber(motor.speed, 0)}</div>
                  </div>
                  <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Position</div>
                    <div className="font-800 tabular-nums text-gray-900">{formatNumber(motor.position, 0)}</div>
                  </div>
                  <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Temp</div>
                    <div className="font-800 tabular-nums text-gray-900">{formatNumber(motor.temperature, 0)} C</div>
                  </div>
                  <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Payload</div>
                    <div className="font-800 tabular-nums text-gray-900">{formatNumber(motor.payload, 0)}</div>
                  </div>
                  <div className="rounded bg-gray-50 px-2 py-1">
                    <div className="text-gray-500">Error</div>
                    <div className="font-800 tabular-nums text-gray-900">{motor.errorCode}</div>
                  </div>
                </div>

                {(motor.errorMessage || motor.isFaulted) && (
                  <div className="mt-3 rounded-lg border-(solid 1px red-100) bg-red-50 px-3 py-2 text-xs text-red-700">
                    {motor.errorMessage || 'Motor fault reported'}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </Surface>
  )
}

function HardwareDiagnosticsPanel({
  robot,
  diagnostics,
  stream,
  now,
}: {
  robot: FleetRobotDataMessage | null
  diagnostics?: HardwareDiagnosticsValue
  stream: FleetHardwareDiagnosticsZenohState
  now: number
}) {
  const [showNormal, setShowNormal] = useState(false)
  const robotIdentity = robot ? `${robot.robot || ''}:${robot.name || ''}:${robot.ip || ''}` : ''

  useEffect(() => {
    setShowNormal(false)
  }, [robotIdentity])

  const view = useMemo(
    () => buildRobotHardwareDiagnosticsView(diagnostics, diagnostics?.updatedAt ?? null, showNormal, now),
    [diagnostics, now, showNormal],
  )
  const lastUpdateLabel = view.updatedAt ? formatAge(view.updatedAt, now) : '--'

  return (
    <Surface className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
        <div>
          <div className="font-800 text-gray-900">Hardware Diagnostics</div>
          <div className="text-xs text-gray-500">
            {robot ? getRobotName(robot) : 'Select a robot'} · Updated {lastUpdateLabel}
          </div>
        </div>
        <Badge className={getHardwareDiagnosticsToneClass(view.summary.state)}>
          {getHardwareDiagnosticsLabel(view.summary.state)}
        </Badge>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{formatStatus(stream.status, stream.connected)}</span>
            <span>·</span>
            <span>{view.summary.abnormalCount} abnormal / {view.summary.totalCount} total</span>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-700 text-gray-700">
            <input
              type="checkbox"
              checked={showNormal}
              onChange={event => setShowNormal(event.target.checked)}
            />
            Show normal
          </label>
        </div>

        {stream.error && (
          <div className="rounded-lg border-(solid 1px red-200) bg-red-50 px-3 py-2 text-sm text-red-700">
            {stream.error}
          </div>
        )}

        {!robot && (
          <div className="rounded-lg bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">
            Select a robot to inspect hardware diagnostics.
          </div>
        )}

        {robot && view.groups.length === 0 && (
          <div className="rounded-lg border-(solid 1px emerald-200) bg-emerald-50 px-3 py-6 text-center text-sm text-emerald-700">
            All monitored hardware items are normal.
          </div>
        )}

        {robot && view.groups.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {view.groups.map(group => (
              <section key={group.id} className="rounded-lg border-(solid 1px gray-200) bg-white/75 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-800 text-gray-900">{group.title}</div>
                  <Badge className="bg-gray-100 text-gray-700">{group.items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <div key={item.id} className="rounded-lg bg-gray-50/80 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-800 text-gray-900">{item.label}</div>
                          <div className="mt-0.5 text-xs text-gray-500">{item.message || '--'}</div>
                        </div>
                        <Badge className={getHardwareDiagnosticsToneClass(item.state)}>
                          {getHardwareDiagnosticsLabel(item.state)}
                        </Badge>
                      </div>
                      {item.values.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {item.values.map(value => (
                            <div key={`${item.id}-${value.label}`} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-xs">
                              <span className="truncate text-gray-500">{value.label}</span>
                              <span className="shrink-0 font-700 tabular-nums text-gray-800">{value.value || '--'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Surface>
  )
}

function formatBondDuration(nanoseconds: number) {
  if (!Number.isFinite(nanoseconds) || nanoseconds <= 0)
    return '--'

  const milliseconds = nanoseconds / 1_000_000
  if (milliseconds < 1000)
    return `${formatNumber(milliseconds, 0)} ms`

  return `${formatNumber(milliseconds / 1000, 1)} s`
}

function getBondHealth(bond: FleetBondValue, now: number) {
  const health = getFleetBondHealth(bond, now)
  if (health === 'inactive')
    return { label: 'Inactive', className: 'bg-red-50 text-red-700' }

  if (health === 'stale')
    return { label: 'Stale', className: 'bg-amber-50 text-amber-700' }

  return { label: 'Healthy', className: 'bg-emerald-50 text-emerald-700' }
}

function Ros2NodeHealthPanel({
  robot,
  nodeBonds,
  stream,
  now,
}: {
  robot: FleetRobotDataMessage | null
  nodeBonds?: Record<string, FleetBondValue>
  stream: FleetBondsZenohState
  now: number
}) {
  const nodes = Object.values(nodeBonds ?? {}).sort((left, right) => left.id.localeCompare(right.id))
  const healthyCount = nodes.filter(node => getBondHealth(node, now).label === 'Healthy').length
  const hasRobotNamespace = Boolean(robot && (getRobotDidoNamespace(robot) || stream.fallbackNamespace))

  return (
    <Surface className="mt-4 overflow-hidden">
      <details>
        <summary className="cursor-pointer select-none list-none px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="i-material-symbols-chevron-right-rounded text-5 text-gray-500" />
              <div className="min-w-0">
                <div className="font-800 text-gray-900">Node Health</div>
                <div className="truncate text-xs text-gray-500">
                  {robot ? getRobotName(robot) : 'Select a robot'} · {healthyCount} healthy / {nodes.length} reported
                </div>
              </div>
            </div>
            <Badge className={nodes.length === 0
              ? 'bg-gray-100 text-gray-600'
              : healthyCount > 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'}>
              {nodes.length === 0 ? 'Unknown' : healthyCount > 0 ? 'Healthy' : 'Attention'}
            </Badge>
          </div>
        </summary>

        <div className="space-y-3 border-(t-solid 1px gray-200) p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
            <span>
              {stream.connected ? `Monitoring active · Stale after ${FLEET_BOND_STALE_MS / 1000}s` : 'Monitoring unavailable'}
            </span>
            {stream.error && <span className="text-red-700">Node health updates are unavailable</span>}
          </div>

          {!robot && (
            <div className="rounded-lg bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">
              Select a robot to inspect node health.
            </div>
          )}

          {robot && !hasRobotNamespace && (
            <div className="rounded-lg border-(solid 1px amber-200) bg-amber-50 px-3 py-6 text-center text-sm text-amber-700">
              This robot has no namespace configured, so node health cannot be monitored.
            </div>
          )}

          {robot && hasRobotNamespace && nodes.length === 0 && (
            <div className="rounded-lg bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">
              Waiting for node health updates.
            </div>
          )}

          {robot && nodes.length > 0 && (
            <div className="space-y-2">
              {nodes.map((node) => {
                const health = getBondHealth(node, now)
                return (
                  <details key={node.id} className="overflow-hidden rounded-lg border-(solid 1px gray-200) bg-white/75">
                    <summary className="cursor-pointer select-none list-none px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="i-material-symbols-chevron-right-rounded text-4.5 text-gray-400" />
                          <div className="min-w-0">
                            <div className="truncate font-800 text-gray-900">{node.id}</div>
                            <div className="text-xs text-gray-500">Updated {formatAge(node.updatedAt, now)}</div>
                          </div>
                        </div>
                        <Badge className={health.className}>{health.label}</Badge>
                      </div>
                    </summary>
                    <div className="grid grid-cols-1 gap-2 border-(t-solid 1px gray-100) p-3 text-xs sm:grid-cols-3">
                      <div className="rounded bg-gray-50 px-2 py-1.5 sm:col-span-3">
                        <div className="text-gray-500">Instance</div>
                        <div className="break-all font-700 text-gray-900">{node.instanceId || '--'}</div>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5">
                        <div className="text-gray-500">Active</div>
                        <div className="font-700 text-gray-900">{node.active ? 'Yes' : 'No'}</div>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5">
                        <div className="text-gray-500">Heartbeat period</div>
                        <div className="font-700 text-gray-900">{formatBondDuration(node.heartbeatPeriod)}</div>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5">
                        <div className="text-gray-500">Heartbeat timeout</div>
                        <div className="font-700 text-gray-900">{formatBondDuration(node.heartbeatTimeout)}</div>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5">
                        <div className="text-gray-500">Stamp seconds</div>
                        <div className="font-700 tabular-nums text-gray-900">{node.header.stamp.sec}</div>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5">
                        <div className="text-gray-500">Stamp nanoseconds</div>
                        <div className="font-700 tabular-nums text-gray-900">{node.header.stamp.nanosec}</div>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5">
                        <div className="text-gray-500">Frame</div>
                        <div className="break-all font-700 text-gray-900">{node.header.frameId || '--'}</div>
                      </div>
                    </div>
                  </details>
                )
              })}
            </div>
          )}
        </div>
      </details>
    </Surface>
  )
}

const fleetJoystickButtons: Array<{ action?: FleetJoystickAction, icon: string, title: string, tone?: 'neutral' | 'danger' }> = [
  { action: 'forward-left', icon: 'i-material-symbols-north-west-rounded', title: 'Forward left' },
  { action: 'forward', icon: 'i-material-symbols-arrow-upward-rounded', title: 'Forward' },
  { action: 'forward-right', icon: 'i-material-symbols-north-east-rounded', title: 'Forward right' },
  { action: 'rotate-left', icon: 'i-material-symbols-rotate-left-rounded', title: 'Rotate left' },
  { icon: 'i-material-symbols-stop-rounded', title: 'Stop', tone: 'danger' },
  { action: 'rotate-right', icon: 'i-material-symbols-rotate-right-rounded', title: 'Rotate right' },
  { action: 'backward-left', icon: 'i-material-symbols-south-west-rounded', title: 'Backward left' },
  { action: 'backward', icon: 'i-material-symbols-arrow-downward-rounded', title: 'Backward' },
  { action: 'backward-right', icon: 'i-material-symbols-south-east-rounded', title: 'Backward right' },
]

function buildFleetJoystickCommand(action: FleetJoystickAction, linearVelocity: number, angularVelocity: number): TwistCommand {
  const linear = Number.isFinite(linearVelocity) ? Math.max(0, linearVelocity) : 0
  const angular = Number.isFinite(angularVelocity) ? Math.max(0, angularVelocity) : 0

  const commands: Record<FleetJoystickAction, TwistCommand> = {
    'forward-left': { linearX: linear, angularZ: angular },
    forward: { linearX: linear },
    'forward-right': { linearX: linear, angularZ: -angular },
    'rotate-left': { angularZ: angular },
    'rotate-right': { angularZ: -angular },
    'backward-left': { linearX: -linear, angularZ: -angular },
    backward: { linearX: -linear },
    'backward-right': { linearX: -linear, angularZ: angular },
  }

  return commands[action]
}

function FleetJoystickPopup({
  robots,
  dido,
  host,
  onClose,
}: {
  robots: FleetRobotDataMessage[]
  dido: FleetDidoZenohState
  host: string
  onClose: () => void
}) {
  const [linearVelocity, setLinearVelocity] = useState(0.35)
  const [angularVelocity, setAngularVelocity] = useState(0.35)
  const [pressedAction, setPressedAction] = useState<FleetJoystickAction | ''>('')
  const [selectedRobotId, setSelectedRobotId] = useState('')
  const [status, setStatus] = useState('')
  const robotOptions = useMemo<FleetJoystickOption[]>(() => (
    robots.map((robot, index) => ({
      id: `${robot.robot || robot.name || 'robot'}:${index}`,
      robot,
      namespace: getRobotCommandNamespace(robot, dido, robots),
    }))
  ), [dido, robots])
  const selectedOption = robotOptions.find(option => option.id === selectedRobotId) ?? robotOptions.find(option => option.namespace) ?? robotOptions[0]
  const topic = selectedOption?.namespace ? `${selectedOption.namespace}/cmd_vel_collision` : ''

  useEffect(() => {
    if (!selectedRobotId && selectedOption)
      setSelectedRobotId(selectedOption.id)
  }, [selectedOption, selectedRobotId])

  useEffect(() => {
    if (!robotOptions.some(option => option.id === selectedRobotId))
      setSelectedRobotId(robotOptions.find(option => option.namespace)?.id ?? robotOptions[0]?.id ?? '')
  }, [robotOptions, selectedRobotId])

  function publishCommand(command: TwistCommand = {}) {
    if (!window.zcDesktop?.isDesktop) {
      setStatus('仅桌面应用支持')
      return false
    }
    if (!host) {
      setStatus('缺少控制器')
      return false
    }
    if (!topic) {
      setStatus('请选择有 namespace 的机器人')
      return false
    }

    window.zcDesktop.publishZenohFleetVelocityCommand({
      host,
      topic,
      command,
    }).then((result) => {
      if (!result.ok)
        setStatus('发布失败')
      else if (Object.keys(command).length === 0)
        setStatus('已停止')
      else
        setStatus('已发送')
    }).catch((error) => {
      setStatus(`${error}`)
      console.warn('Failed to publish fleet velocity command', error)
    })

    return true
  }

  function stopCommand() {
    setPressedAction('')
    publishCommand()
  }

  function pressAction(action: FleetJoystickAction) {
    setPressedAction(action)
    publishCommand(buildFleetJoystickCommand(action, linearVelocity, angularVelocity))
  }

  useInterval(() => {
    if (!pressedAction)
      return

    publishCommand(buildFleetJoystickCommand(pressedAction, linearVelocity, angularVelocity))
  }, pressedAction ? 50 : undefined)

  useEffect(() => {
    return () => {
      if (window.zcDesktop?.isDesktop && host && topic) {
        window.zcDesktop.publishZenohFleetVelocityCommand({
          host,
          topic,
          command: {},
        }).catch((error) => {
          console.warn('Failed to stop fleet velocity command', error)
        })
      }
    }
  }, [host, topic])

  return (
    <div className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-white/80 bg-white/90 p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-800 text-gray-900">Fleet joystick</div>
            <div className="truncate text-[10px] text-gray-500">{topic || 'No command topic'}</div>
          </div>
          <IconButton icon="i-material-symbols-close-rounded" title="Close" onClick={onClose} />
        </div>

        <label className="mt-3 block space-y-1">
          <FieldLabel>Robot</FieldLabel>
          <select
            className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white px-2 text-xs outline-none focus:border-emerald-600"
            value={selectedOption?.id ?? ''}
            onChange={(event) => {
              stopCommand()
              setSelectedRobotId(event.target.value)
            }}
          >
            {robotOptions.length === 0 && <option value="">No robots</option>}
            {robotOptions.map(option => (
              <option key={option.id} value={option.id} disabled={!option.namespace}>
                {getRobotName(option.robot)} {option.namespace ? `(${option.namespace})` : '(no namespace)'}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3 grid grid-cols-1 gap-2">
          <label className="space-y-1">
            <FieldLabel>Linear</FieldLabel>
            <input
              className="h-8 w-full rounded-lg border-(solid 1px gray-300) bg-white px-2 text-xs outline-none focus:border-emerald-600"
              type="number"
              min="0"
              step="0.01"
              value={linearVelocity}
              onChange={(event) => {
                const value = Number(event.target.value)
                setLinearVelocity(Number.isFinite(value) ? Math.max(0, value) : 0)
              }}
            />
          </label>
          <label className="space-y-1">
            <FieldLabel>Angular</FieldLabel>
            <input
              className="h-8 w-full rounded-lg border-(solid 1px gray-300) bg-white px-2 text-xs outline-none focus:border-emerald-600"
              type="number"
              min="0"
              step="0.01"
              value={angularVelocity}
              onChange={(event) => {
                const value = Number(event.target.value)
                setAngularVelocity(Number.isFinite(value) ? Math.max(0, value) : 0)
              }}
            />
          </label>
        </div>

        <div className="mx-auto mt-3 grid w-36 grid-cols-3 gap-1.5">
          {fleetJoystickButtons.map((button, index) => (
            <button
              key={`${button.title}-${index}`}
              type="button"
              title={button.title}
              aria-label={button.title}
              className={classNames(
                'h-11 w-11 inline-flex items-center justify-center rounded-lg border text-5.5 transition',
                button.tone === 'danger'
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  : button.action && pressedAction === button.action
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              )}
              onPointerDown={() => button.action ? pressAction(button.action) : stopCommand()}
              onPointerUp={stopCommand}
              onPointerLeave={stopCommand}
              onPointerCancel={stopCommand}
              onClick={() => {
                if (!button.action)
                  stopCommand()
              }}
            >
              <span className={button.icon} />
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-xs text-gray-500">{status || '--'}</div>
          <Button className="h-8 px-2 text-xs" tone="danger" icon="i-material-symbols-stop-rounded" onClick={stopCommand}>Stop</Button>
        </div>
    </div>
  )
}

function RobotRow({
  robot,
  pending = false,
  dido,
  wheelState,
  hardwareDiagnostics,
  now,
  selected = false,
  onSelect,
}: {
  robot: FleetRobotDataMessage
  pending?: boolean
  dido?: RobotDidoValues
  wheelState?: WheelStateValue
  hardwareDiagnostics?: HardwareDiagnosticsValue
  now: number
  selected?: boolean
  onSelect?: () => void
}) {
  const diagnosticsSummary = getRobotHardwareDiagnosticsSummary(hardwareDiagnostics, now)

  return (
    <tr
      className={classNames(
        'cursor-pointer border-(b-solid 1px gray-200) hover:bg-white/60',
        selected && 'bg-emerald-50/70',
      )}
      onClick={onSelect}
    >
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2">
          <span className={classNames('h-2 w-2 rounded-full', pending ? 'bg-amber-500' : 'bg-emerald-500')} />
          <div>
            <div className="font-700 text-gray-900">{getRobotName(robot)}</div>
            <div className="text-xs text-gray-500">{robot.robot || '--'}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <div className={`font-700 ${getRobotStatusClass(robot.status)}`}>{robot.status || '--'}</div>
        <div className="text-xs text-gray-500">{robot.statusDetail || robot.mode || '--'}</div>
      </td>
      <td className="px-3 py-2 align-top">
        <div>{robot.map || robot.location.map || '--'}</div>
        <div className="text-xs text-gray-500">{robot.location.levelName || '--'}</div>
      </td>
      <td className="px-3 py-2 align-top">
        {robot.location.hasPose
          ? (
              <>
                <div>x {formatNumber(robot.location.x)} y {formatNumber(robot.location.y)}</div>
                <div className="text-xs text-gray-500">yaw {formatNumber(robot.location.yaw)}</div>
              </>
            )
          : '--'}
      </td>
      <td className="px-3 py-2 align-top">
        <div>{robot.hasBatteryPercent ? `${formatNumber(robot.batteryPercent, 1)}%` : '--'}</div>
        <div className="text-xs text-gray-500">
          {robot.hasBatteryCurrent ? `${formatNumber(robot.batteryCurrent, 2)} A` : robot.hasBattery ? `${formatNumber(robot.battery, 2)}` : '--'}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <Badge className={getWheelStateToneClass(wheelState)}>
          {getWheelStateSummary(wheelState)}
        </Badge>
      </td>
      <td className="px-3 py-2 align-top">
        <Badge className={getHardwareDiagnosticsToneClass(diagnosticsSummary.state)}>
          {diagnosticsSummary.label}
        </Badge>
      </td>
      <td className="px-3 py-2 align-top">
        <DidoBits message={dido?.di} />
      </td>
      <td className="px-3 py-2 align-top">
        <DidoBits message={dido?.do} />
      </td>
      <td className="px-3 py-2 align-top">
        {robot.hasPalletState
          ? (
              <>
                <div>货架 {formatBoolean(robot.palletState.palletPresent)}</div>
                <div className="text-xs text-gray-500">
                  库存 {robot.palletState.palletStock} / 缓冲 {robot.palletState.bufferStock}
                </div>
              </>
            )
          : '--'}
      </td>
    </tr>
  )
}

function RobotsPage({
  robots,
  pendingRobots,
  search,
  setSearch,
  fleetName,
  fleetType,
  error,
  dido,
  wheelStates,
  hardwareDiagnostics,
  bonds,
  host,
  selectedRobotId,
  setSelectedRobotId,
}: {
  robots: FleetRobotDataMessage[]
  pendingRobots: FleetRobotDataMessage[]
  search: string
  setSearch: (value: string) => void
  fleetName: string
  fleetType: string
  error: string | null
  dido: FleetDidoZenohState
  wheelStates: FleetWheelStatesZenohState
  hardwareDiagnostics: FleetHardwareDiagnosticsZenohState
  bonds: FleetBondsZenohState
  host: string
  selectedRobotId: string
  setSelectedRobotId: (value: string) => void
}) {
  const [now, setNow] = useState(Date.now())
  useInterval(() => setNow(Date.now()), 1000)

  const normalizedSearch = search.trim().toLowerCase()
  const visibleRobots = robots.filter((robot) => {
    if (!normalizedSearch)
      return true

    return [
      robot.name,
      robot.robot,
      robot.status,
      robot.mode,
      robot.map,
      robot.location.map,
      robot.location.levelName,
    ].some(value => value.toLowerCase().includes(normalizedSearch))
  })
  const visiblePendingRobots = pendingRobots.filter((robot) => {
    if (!normalizedSearch)
      return true

    return [
      robot.name,
      robot.robot,
      robot.status,
      robot.mode,
      robot.map,
      robot.location.map,
      robot.location.levelName,
    ].some(value => value.toLowerCase().includes(normalizedSearch))
  })
  const totalVisible = visibleRobots.length + visiblePendingRobots.length
  const didoRobots = [...robots, ...pendingRobots]
  const selectedRobot = didoRobots.find(robot => getRobotName(robot) === selectedRobotId)
    ?? visibleRobots[0]
    ?? visiblePendingRobots[0]
    ?? null
  const selectedDido = selectedRobot ? getRobotDidoValues(selectedRobot, dido, didoRobots) : undefined
  const selectedWheelState = selectedRobot ? getRobotWheelStateValue(selectedRobot, wheelStates, didoRobots) : undefined
  const selectedHardwareDiagnostics = selectedRobot ? getRobotHardwareDiagnosticsValue(selectedRobot, hardwareDiagnostics, didoRobots) : undefined
  const selectedBonds = selectedRobot ? getRobotBondValues(selectedRobot, bonds, didoRobots) : undefined
  const selectedNamespace = selectedRobot ? getRobotCommandNamespace(selectedRobot, dido, didoRobots) : ''

  return (
    <div>
      <Surface>
      <div className="flex flex-wrap items-center justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
        <div>
          <div className="font-800">Fleet Robots</div>
          <div className="text-xs text-gray-500">{fleetName || '--'} {fleetType || ''}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className={classNames('text-xs font-700', dido.connected ? 'text-emerald-700' : 'text-gray-500')}>
            I/O {formatStatus(dido.status, dido.connected)}
          </div>
          <div className={classNames('text-xs font-700', wheelStates.connected ? 'text-emerald-700' : 'text-gray-500')}>
            Wheels {formatStatus(wheelStates.status, wheelStates.connected)}
          </div>
          <div className={classNames('text-xs font-700', hardwareDiagnostics.connected ? 'text-emerald-700' : 'text-gray-500')}>
            Hardware {formatStatus(hardwareDiagnostics.status, hardwareDiagnostics.connected)}
          </div>
          <div className={classNames('text-xs font-700', bonds.connected ? 'text-emerald-700' : 'text-gray-500')}>
            Nodes {bonds.connected ? 'monitoring' : 'unavailable'}
          </div>
          {dido.error && <div className="text-sm text-red-700">{dido.error}</div>}
          {wheelStates.error && <div className="text-sm text-red-700">{wheelStates.error}</div>}
          {hardwareDiagnostics.error && <div className="text-sm text-red-700">{hardwareDiagnostics.error}</div>}
          {error && <div className="text-sm text-red-700">{error}</div>}
          <label className="relative block">
            <span className="i-material-symbols-search-rounded pointer-events-none absolute left-3 top-2.5 text-4 text-gray-400" />
            <input
              className="h-9 w-64 rounded-lg border-(solid 1px gray-300) bg-white/75 pl-9 pr-3 text-sm outline-none focus:border-emerald-600"
              placeholder="Search robots"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>
        </div>
      </div>

      {totalVisible > 0
        ? (
            <div className="overflow-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-gray-50/80 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-700">Robot</th>
                    <th className="px-3 py-2 font-700">Status</th>
                    <th className="px-3 py-2 font-700">Map</th>
                    <th className="px-3 py-2 font-700">Pose</th>
                    <th className="px-3 py-2 font-700">Battery</th>
                    <th className="px-3 py-2 font-700">Wheels</th>
                    <th className="px-3 py-2 font-700">Diagnostics</th>
                    <th className="px-3 py-2 font-700">DI</th>
                    <th className="px-3 py-2 font-700">DO</th>
                    <th className="px-3 py-2 font-700">Pallet</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRobots.map((robot, index) => (
                    <RobotRow
                      key={`robot-${robot.robot || robot.name || index}`}
                      robot={robot}
                      dido={getRobotDidoValues(robot, dido, didoRobots)}
                      wheelState={getRobotWheelStateValue(robot, wheelStates, didoRobots)}
                      hardwareDiagnostics={getRobotHardwareDiagnosticsValue(robot, hardwareDiagnostics, didoRobots)}
                      now={now}
                      selected={selectedRobot === robot}
                      onSelect={() => setSelectedRobotId(getRobotName(robot))}
                    />
                  ))}
                  {visiblePendingRobots.map((robot, index) => (
                    <RobotRow
                      key={`pending-${robot.robot || robot.name || index}`}
                      robot={robot}
                      pending
                      dido={getRobotDidoValues(robot, dido, didoRobots)}
                      wheelState={getRobotWheelStateValue(robot, wheelStates, didoRobots)}
                      hardwareDiagnostics={getRobotHardwareDiagnosticsValue(robot, hardwareDiagnostics, didoRobots)}
                      now={now}
                      selected={selectedRobot === robot}
                      onSelect={() => setSelectedRobotId(getRobotName(robot))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        : (
            <div className="px-4 py-14 text-center text-sm text-gray-500">
              {error ? 'Fleet data parse or connection failed' : 'Waiting for fleet robot data...'}
            </div>
          )}
      </Surface>

      <PeripheralStatePanel
        robot={selectedRobot}
        dido={selectedDido}
        namespace={selectedNamespace}
        host={host}
      />
      <WheelStatesPanel
        robot={selectedRobot}
        wheelState={selectedWheelState}
        stream={wheelStates}
        now={now}
      />
      <HardwareDiagnosticsPanel
        robot={selectedRobot}
        diagnostics={selectedHardwareDiagnostics}
        stream={hardwareDiagnostics}
        now={now}
      />
      <Ros2NodeHealthPanel
        robot={selectedRobot}
        nodeBonds={selectedBonds}
        stream={bonds}
        now={now}
      />
    </div>
  )
}

function TaskManagerDetailField({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
      <div className="font-700 text-gray-500">{label}</div>
      <div className="mt-1 min-w-0 break-all leading-4 text-gray-800" title={title || value}>
        {value || '--'}
      </div>
    </div>
  )
}

function TaskManagerUnitTaskRow({ unitTask }: { unitTask: TaskManagerUnitTaskInfo }) {
  return (
    <div className="border-(t-solid 1px gray-100) px-3 py-3 text-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-800 text-gray-900">
            <span className="mr-2 tabular-nums text-gray-500">#{unitTask.seq}</span>
            <span className="break-words">{unitTask.waypoint || unitTask.unit_id || '--'}</span>
          </div>
          <div className="mt-0.5 break-words text-xs text-gray-500">{unitTask.action_name || '--'}</div>
        </div>
        <Badge className={getTaskManagerStatusClass(unitTask.status)}>{unitTask.status || '--'}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-700 text-gray-500">
        <span>Attempts {unitTask.attempts}</span>
        <span title={unitTask.unit_id}>Unit {shortIdentifier(unitTask.unit_id)}</span>
      </div>
      {unitTask.last_error && <div className="mt-2 break-words text-xs text-red-700">{unitTask.last_error}</div>}
    </div>
  )
}

function TaskManagerDetail({
  detail,
  isRunning,
  isCanceling,
  isDeleting,
  onRun,
  onCancel,
  onDelete,
}: {
  detail: TaskManagerTaskDetail
  isRunning: boolean
  isCanceling: boolean
  isDeleting: boolean
  onRun: (taskId: string) => void
  onCancel: (task: TaskManagerTaskInfo) => void
  onDelete: (task: TaskManagerTaskInfo) => void
}) {
  if (!detail.found) {
    return (
      <div className="rounded-lg bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">
        {detail.message || 'Task not found'}
      </div>
    )
  }

  const task = detail.task
  const taskDefinitionId = getTaskManagerDefinitionId(task)
  const isExecuting = isTaskManagerTaskExecuting(task)
  return (
    <div className="space-y-4">
      <section className="rounded-lg border-(solid 1px gray-200) bg-white/75 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-800 text-gray-900">{getTaskManagerTaskName(task)}</div>
            <div className="mt-0.5 text-xs text-gray-500">{task.robot_name || '--'} · {task.fleet_name || '--'}</div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge className={getTaskManagerStatusClass(task.status)}>{task.status || '--'}</Badge>
            {isExecuting && (
              <Button
                type="button"
                tone="danger"
                icon={isCanceling ? 'i-material-symbols-progress-activity' : 'i-material-symbols-cancel-rounded'}
                disabled={isCanceling || isDeleting || !taskDefinitionId}
                onClick={() => onCancel(task)}>
                Cancel
              </Button>
            )}
            <Button
              type="button"
              tone="primary"
              icon={isRunning ? 'i-material-symbols-progress-activity' : 'i-material-symbols-play-arrow-rounded'}
              disabled={isRunning || isCanceling || isDeleting || isExecuting || !taskDefinitionId}
              onClick={() => onRun(taskDefinitionId)}>
              Run
            </Button>
            <IconButton
              icon={isDeleting ? 'i-material-symbols-progress-activity' : 'i-material-symbols-delete-outline-rounded'}
              title={isExecuting ? 'Cancel current execution before deleting' : 'Delete task'}
              tone="danger"
              disabled={isRunning || isCanceling || isDeleting || isExecuting || !taskDefinitionId}
              onClick={() => onDelete(task)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
          <TaskManagerDetailField label="Task ID" value={shortIdentifier(task.task_id)} title={task.task_id} />
          <TaskManagerDetailField label="Definition ID" value={shortIdentifier(task.task_definition_id)} title={task.task_definition_id} />
          <TaskManagerDetailField label="Latest execution" value={shortIdentifier(task.latest_task_execution_id)} title={task.latest_task_execution_id} />
          <TaskManagerDetailField label="Active execution" value={shortIdentifier(task.active_task_execution_id)} title={task.active_task_execution_id} />
          <TaskManagerDetailField label="Created" value={formatUnixMilliseconds(task.created_at_unix_ms)} />
          <TaskManagerDetailField label="Updated" value={formatUnixMilliseconds(task.updated_at_unix_ms)} />
          <TaskManagerDetailField label="Execution created" value={formatUnixMilliseconds(task.execution_created_at_unix_ms)} />
          <TaskManagerDetailField label="Execution updated" value={formatUnixMilliseconds(task.execution_updated_at_unix_ms)} />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border-(solid 1px gray-200) bg-white/75">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="font-800 text-gray-900">Unit tasks</div>
          <div className="text-xs font-700 text-gray-500">{detail.unit_tasks.length} total</div>
        </div>
        {detail.unit_tasks.length > 0
          ? detail.unit_tasks.map(unitTask => (
              <TaskManagerUnitTaskRow
                key={`${unitTask.unit_task_execution_id || unitTask.unit_id}:${unitTask.seq}`}
                unitTask={unitTask}
              />
          ))
          : <div className="border-(t-solid 1px gray-100) px-3 py-8 text-center text-sm text-gray-500">No unit tasks</div>}
      </section>
    </div>
  )
}

function TaskManagerPanel() {
  const fleetSiteNamespace = useFleetSiteNamespace()
  const taskListServicePath = prefixFleetSiteTopic(fleetSiteNamespace.namespace, taskManagerServiceTopics.list)
  const taskGetServicePath = prefixFleetSiteTopic(fleetSiteNamespace.namespace, taskManagerServiceTopics.get)
  const taskRunServicePath = prefixFleetSiteTopic(fleetSiteNamespace.namespace, taskManagerServiceTopics.run)
  const taskCancelServicePath = prefixFleetSiteTopic(fleetSiteNamespace.namespace, taskManagerServiceTopics.cancel)
  const taskDeleteServicePath = prefixFleetSiteTopic(fleetSiteNamespace.namespace, taskManagerServiceTopics.delete)
  const taskManagerServiceLabel = taskListServicePath && taskGetServicePath
    ? `${taskListServicePath} / ${taskGetServicePath}`
    : 'Waiting for site name'
  const [taskManagerTasks, setTaskManagerTasks] = useState<TaskManagerTaskInfo[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [taskDetail, setTaskDetail] = useState<TaskManagerTaskDetail | null>(null)
  const [isRefreshingTasks, setIsRefreshingTasks] = useState(false)
  const [isLoadingTaskDetail, setIsLoadingTaskDetail] = useState(false)
  const [runningTaskId, setRunningTaskId] = useState('')
  const [cancelingTaskId, setCancelingTaskId] = useState('')
  const [deletingTaskId, setDeletingTaskId] = useState('')
  const [taskManagerError, setTaskManagerError] = useState('')
  const detailRequestId = useRef(0)

  function taskManagerSiteNamespaceError(servicePath: string) {
    if (fleetSiteNamespace.status === 'idle' || fleetSiteNamespace.status === 'loading')
      return 'Loading site name'
    if (!servicePath)
      return fleetSiteNamespace.error || 'Missing site name'

    return ''
  }

  function requireTaskManagerServicePath(servicePath: string, showToast = true) {
    const message = taskManagerSiteNamespaceError(servicePath)
    if (!message)
      return true

    setTaskManagerError(message)
    if (showToast)
      toast.error(message)
    return false
  }

  useEffect(() => {
    setTaskManagerTasks([])
    setSelectedTaskId('')
    setTaskDetail(null)
    setTaskManagerError('')
  }, [fleetSiteNamespace.namespace])

  async function refreshTaskManagerTasks(showToast = true) {
    if (!requireTaskManagerServicePath(taskListServicePath, showToast))
      return

    setIsRefreshingTasks(true)
    setTaskManagerError('')
    try {
      const tasks = await apiServer.listTasks({ servicePath: taskListServicePath })
      setTaskManagerTasks(tasks)
      if (selectedTaskId && !tasks.some(task => getTaskManagerDefinitionId(task) === selectedTaskId)) {
        setSelectedTaskId('')
        setTaskDetail(null)
      }
      if (showToast)
        toast.success(`Loaded ${tasks.length} tasks`)
    }
    catch (error) {
      const message = errorMessage(error)
      setTaskManagerError(message)
      if (showToast)
        toast.error(`Failed to load task list: ${message}`)
    }
    finally {
      setIsRefreshingTasks(false)
    }
  }

  async function selectTaskManagerTask(task: TaskManagerTaskInfo) {
    const taskId = getTaskManagerDefinitionId(task)
    if (!taskId)
      return

    const requestId = detailRequestId.current + 1
    detailRequestId.current = requestId
    setSelectedTaskId(taskId)
    setTaskDetail(null)
    setIsLoadingTaskDetail(true)
    setTaskManagerError('')

    try {
      if (!requireTaskManagerServicePath(taskGetServicePath))
        return

      const detail = await apiServer.getTask(taskId, { servicePath: taskGetServicePath })
      if (detailRequestId.current !== requestId)
        return

      setTaskDetail(detail)
      if (!detail.found)
        toast.error(detail.message || 'Task not found')
    }
    catch (error) {
      if (detailRequestId.current !== requestId)
        return

      const message = errorMessage(error)
      setTaskManagerError(message)
      toast.error(`Failed to load task detail: ${message}`)
    }
    finally {
      if (detailRequestId.current === requestId)
        setIsLoadingTaskDetail(false)
    }
  }

  async function refreshTaskManagerStateAfterMutation(taskId: string) {
    if (!requireTaskManagerServicePath(taskListServicePath, false) || !requireTaskManagerServicePath(taskGetServicePath, false))
      return

    const tasks = await apiServer.listTasks({ servicePath: taskListServicePath })
    setTaskManagerTasks(tasks)

    if (!selectedTaskId)
      return

    if (!tasks.some(task => getTaskManagerDefinitionId(task) === selectedTaskId)) {
      setSelectedTaskId('')
      setTaskDetail(null)
      return
    }

    if (selectedTaskId === taskId) {
      const detail = await apiServer.getTask(taskId, { servicePath: taskGetServicePath })
      setTaskDetail(detail)
    }
  }

  async function runTaskManagerTask(taskId: string) {
    if (!taskId)
      return

    setRunningTaskId(taskId)
    setTaskManagerError('')
    try {
      if (!requireTaskManagerServicePath(taskRunServicePath))
        return

      const response = await apiServer.runTask(taskId, { servicePath: taskRunServicePath })
      const executionLabel = response.task_execution_id
        ? `Execution ${shortIdentifier(response.task_execution_id)} accepted`
        : 'Task accepted'
      toast.success(response.message || executionLabel)

      setTaskManagerTasks(current => current.map(task => (
        getTaskManagerDefinitionId(task) === taskId && response.task_execution_id
          ? { ...task, status: 'PENDING', active_task_execution_id: response.task_execution_id, latest_task_execution_id: response.task_execution_id }
          : task
      )))
      if (selectedTaskId === taskId) {
        try {
          const detail = await apiServer.getTask(taskId, { servicePath: taskGetServicePath })
          setTaskDetail(detail)
        }
        catch (error) {
          console.warn('Failed to refresh task detail after run', error)
        }
      }
    }
    catch (error) {
      const message = errorMessage(error)
      setTaskManagerError(message)
      toast.error(`Failed to run task: ${message}`)
    }
    finally {
      setRunningTaskId('')
    }
  }

  async function cancelTaskManagerTask(task: TaskManagerTaskInfo) {
    const taskId = getTaskManagerDefinitionId(task)
    if (!taskId)
      return

    setCancelingTaskId(task.task_id || taskId)
    setTaskManagerError('')
    try {
      if (!requireTaskManagerServicePath(taskCancelServicePath))
        return

      const response = await apiServer.cancelTaskExecution(taskId, { servicePath: taskCancelServicePath })
      toast.success(response.message || 'Task execution canceled')
      await refreshTaskManagerStateAfterMutation(taskId)
    }
    catch (error) {
      const message = errorMessage(error)
      setTaskManagerError(message)
      toast.error(`Failed to cancel task: ${message}`)
    }
    finally {
      setCancelingTaskId('')
    }
  }

  async function deleteTaskManagerTask(task: TaskManagerTaskInfo) {
    const taskId = getTaskManagerDefinitionId(task)
    if (!taskId)
      return

    const name = getTaskManagerTaskName(task)
    if (!window.confirm(`Permanently delete task "${name}" from the database?`))
      return

    setDeletingTaskId(task.task_id || taskId)
    setTaskManagerError('')
    try {
      if (!requireTaskManagerServicePath(taskDeleteServicePath))
        return

      const response = await apiServer.deleteTaskDefinition(taskId, true, { servicePath: taskDeleteServicePath })
      toast.success(response.message || 'Task deleted')
      await refreshTaskManagerStateAfterMutation(taskId)
    }
    catch (error) {
      const message = errorMessage(error)
      setTaskManagerError(message)
      toast.error(`Failed to delete task: ${message}`)
    }
    finally {
      setDeletingTaskId('')
    }
  }

  return (
    <Surface>
      <div className="flex flex-wrap items-center justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
        <div>
          <div className="font-800">Task Manager</div>
          <div className="text-xs text-gray-500">{taskManagerServiceLabel}</div>
        </div>
        <Button
          type="button"
          tone="primary"
          icon={isRefreshingTasks ? 'i-material-symbols-progress-activity' : 'i-material-symbols-refresh-rounded'}
          disabled={isRefreshingTasks || !taskListServicePath}
          onClick={() => { refreshTaskManagerTasks() }}>
          Refresh
        </Button>
      </div>

      {taskManagerError && (
        <div className="border-(b-solid 1px red-100) bg-red-50 px-4 py-2 text-sm text-red-700">
          {taskManagerError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-0 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
        <div className="min-w-0 border-(b-solid 1px gray-200) 2xl:border-(b-0 r-solid 1px gray-200)">
          {taskManagerTasks.length > 0
            ? (
                <div className="grid grid-cols-1 gap-3 p-3 xl:grid-cols-2 2xl:grid-cols-1">
                  {taskManagerTasks.map((task) => {
                    const isExecuting = isTaskManagerTaskExecuting(task)
                    const taskDefinitionId = getTaskManagerDefinitionId(task)
                    const taskStateId = task.task_id || taskDefinitionId
                    const isTaskRunning = runningTaskId === taskDefinitionId
                    const isTaskCanceling = cancelingTaskId === taskStateId
                    const isTaskDeleting = deletingTaskId === taskStateId
                    return (
                      <div
                        key={task.task_id || `${task.task_definition_id}:${task.created_at_unix_ms}`}
                        className={classNames(
                          'rounded-lg border-(solid 1px gray-200) bg-white/80 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/35',
                          selectedTaskId === taskDefinitionId && 'border-emerald-500 bg-emerald-50/70 shadow-sm',
                        )}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          title={task.task_id}
                          onClick={() => selectTaskManagerTask(task)}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="break-words font-800 leading-5 text-gray-900">{getTaskManagerTaskName(task)}</div>
                              <div className="mt-1 break-all font-mono text-[11px] leading-4 text-gray-500">{task.task_id || '--'}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge className={getTaskManagerStatusClass(task.status)}>{task.status || '--'}</Badge>
                              <span
                                className={classNames(
                                  'h-5 w-5 text-gray-400',
                                  isLoadingTaskDetail && selectedTaskId === taskDefinitionId
                                    ? 'i-material-symbols-progress-activity animate-spin'
                                    : 'i-material-symbols-chevron-right-rounded',
                                )}
                              />
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                            <TaskManagerSummaryField label="Robot" value={task.robot_name || '--'} />
                            <TaskManagerSummaryField label="Fleet" value={task.fleet_name || '--'} />
                            <TaskManagerSummaryField label="Updated" value={formatUnixMilliseconds(task.updated_at_unix_ms)} />
                          </div>
                        </button>
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-(t-solid 1px gray-100) pt-3">
                          {isExecuting && (
                            <Button
                              type="button"
                              tone="danger"
                              icon={isTaskCanceling ? 'i-material-symbols-progress-activity' : 'i-material-symbols-cancel-rounded'}
                              disabled={isTaskCanceling || isTaskDeleting || !taskDefinitionId}
                              onClick={() => { cancelTaskManagerTask(task) }}>
                              Cancel
                            </Button>
                          )}
                          <IconButton
                            icon={isTaskDeleting ? 'i-material-symbols-progress-activity' : 'i-material-symbols-delete-outline-rounded'}
                            title={isExecuting ? 'Cancel current execution before deleting' : 'Delete task'}
                            tone="danger"
                            disabled={isTaskRunning || isTaskCanceling || isTaskDeleting || isExecuting || !taskDefinitionId}
                            onClick={() => { deleteTaskManagerTask(task) }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            : (
                <div className="px-4 py-14 text-center text-sm text-gray-500">
                  {isRefreshingTasks ? 'Loading tasks...' : 'Press Refresh to load runtime tasks'}
                </div>
              )}
        </div>

        <div className="min-w-0 p-4">
          {isLoadingTaskDetail && !taskDetail && (
            <div className="rounded-lg bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">Loading task detail...</div>
          )}
          {!isLoadingTaskDetail && !taskDetail && (
            <div className="rounded-lg bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">Select a task to view details</div>
          )}
          {taskDetail && (
            <TaskManagerDetail
              detail={taskDetail}
              isRunning={runningTaskId === getTaskManagerDefinitionId(taskDetail.task)}
              isCanceling={cancelingTaskId === (taskDetail.task.task_id || getTaskManagerDefinitionId(taskDetail.task))}
              isDeleting={deletingTaskId === (taskDetail.task.task_id || getTaskManagerDefinitionId(taskDetail.task))}
              onRun={runTaskManagerTask}
              onCancel={cancelTaskManagerTask}
              onDelete={deleteTaskManagerTask}
            />
          )}
        </div>
      </div>
    </Surface>
  )
}

function TasksPage({
  tasks,
  taskDraft,
  setTaskDraft,
  createTask,
  updateTaskStatus,
  updateTaskSchedule,
  deleteTask,
  robotOptions,
  mapOptions,
  buildingMap,
  fleetName,
}: {
  tasks: FleetTask[]
  taskDraft: TaskDraft
  setTaskDraft: React.Dispatch<React.SetStateAction<TaskDraft>>
  createTask: (event: React.FormEvent<HTMLFormElement>) => void
  updateTaskStatus: (id: string, status: FleetTaskStatus) => void
  updateTaskSchedule: (id: string, scheduleAt: string) => void
  deleteTask: (id: string) => void
  robotOptions: string[]
  mapOptions: string[]
  buildingMap: BuildingMapMessage | null
  fleetName: string
}) {
  const [goToChargerDraft, setGoToChargerDraft] = useState<GoToChargerTaskDraft>({
    robot: '',
    chargerWaypoint: '',
  })
  const [goToWaypointDraft, setGoToWaypointDraft] = useState<GoToWaypointTaskDraft>({
    robot: '',
    waypoint: '',
  })
  const [multiGoToPoseDraft, setMultiGoToPoseDraft] = useState<MultiGoToPoseTaskDraft>(() => ({
    robot: '',
    stops: [
      { id: createId('go-to-pose'), waypoint: '' },
      { id: createId('go-to-pose'), waypoint: '' },
    ],
  }))
  const [isCreatingGoToChargerTask, setIsCreatingGoToChargerTask] = useState(false)
  const [isCreatingGoToWaypointTask, setIsCreatingGoToWaypointTask] = useState(false)
  const [isCreatingMultiGoToPoseTask, setIsCreatingMultiGoToPoseTask] = useState(false)
  const [goToChargerFeedback, setGoToChargerFeedback] = useState<GoToChargerFeedback | null>(null)
  const [goToWaypointFeedback, setGoToWaypointFeedback] = useState<GoToChargerFeedback | null>(null)
  const [multiGoToPoseFeedback, setMultiGoToPoseFeedback] = useState<GoToChargerFeedback | null>(null)
  const waypointOptions = useMemo(() => getNavWaypointOptions(buildingMap), [buildingMap])
  const waypointNames = useMemo(() => waypointOptions.map(option => option.name), [waypointOptions])
  const chargerWaypointOptions = useMemo(() => getChargerWaypointOptions(buildingMap), [buildingMap])
  const chargerWaypointNames = useMemo(() => chargerWaypointOptions.map(option => option.name), [chargerWaypointOptions])
  const normalizedFleetName = fleetName.trim()
  const fleetSiteNamespace = useFleetSiteNamespace()
  const taskCreateServicePath = prefixFleetSiteTopic(fleetSiteNamespace.namespace, taskManagerServiceTopics.create)
  const taskCreateServiceError = fleetSiteNamespace.status === 'idle' || fleetSiteNamespace.status === 'loading'
    ? 'Loading site name'
    : taskCreateServicePath
      ? ''
      : fleetSiteNamespace.error || 'Missing site name'
  const selectedChargerOption = chargerWaypointOptions.find(option => option.name === goToChargerDraft.chargerWaypoint) ?? null
  const selectedWaypointOption = waypointOptions.find(option => option.name === goToWaypointDraft.waypoint.trim()) ?? null
  const multiGoToPoseUnitTasks = buildMultiGoToPoseUnitTasks(
    multiGoToPoseDraft.stops.map(stop => stop.waypoint),
    waypointNames,
  )
  const canCreateGoToChargerTask = Boolean(
    normalizedFleetName
    && !taskCreateServiceError
    && goToChargerDraft.robot
    && goToChargerDraft.chargerWaypoint,
  )
  const canCreateGoToWaypointTask = Boolean(
    normalizedFleetName
    && !taskCreateServiceError
    && goToWaypointDraft.robot
    && goToWaypointDraft.waypoint.trim(),
  )
  const canCreateMultiGoToPoseTask = Boolean(
    normalizedFleetName
    && !taskCreateServiceError
    && multiGoToPoseDraft.robot
    && multiGoToPoseUnitTasks.ok,
  )
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === b.status)
      return new Date(a.scheduleAt).getTime() - new Date(b.scheduleAt).getTime()
    if (a.status === 'active')
      return -1
    if (b.status === 'active')
      return 1
    return a.createdAt - b.createdAt
  })

  useEffect(() => {
    setGoToChargerDraft((current) => {
      if (robotOptions.length === 0)
        return current.robot ? { ...current, robot: '' } : current
      return robotOptions.includes(current.robot) ? current : { ...current, robot: robotOptions[0] }
    })
    setGoToWaypointDraft((current) => {
      if (robotOptions.length === 0)
        return current.robot ? { ...current, robot: '' } : current
      return robotOptions.includes(current.robot) ? current : { ...current, robot: robotOptions[0] }
    })
    setMultiGoToPoseDraft((current) => {
      if (robotOptions.length === 0)
        return current.robot ? { ...current, robot: '' } : current
      return robotOptions.includes(current.robot) ? current : { ...current, robot: robotOptions[0] }
    })
  }, [robotOptions])

  useEffect(() => {
    setGoToWaypointDraft((current) => {
      if (waypointNames.length === 0)
        return current
      return waypointNames.includes(current.waypoint) ? current : { ...current, waypoint: waypointNames[0] }
    })
  }, [waypointNames])

  useEffect(() => {
    setMultiGoToPoseDraft((current) => {
      const stops = current.stops.map(stop => (
        !stop.waypoint || waypointNames.includes(stop.waypoint)
          ? stop
          : { ...stop, waypoint: '' }
      ))
      return stops.every((stop, index) => stop === current.stops[index])
        ? current
        : { ...current, stops }
    })
  }, [waypointNames])

  useEffect(() => {
    setGoToChargerDraft((current) => {
      if (chargerWaypointNames.length === 0)
        return current.chargerWaypoint ? { ...current, chargerWaypoint: '' } : current
      return chargerWaypointNames.includes(current.chargerWaypoint)
        ? current
        : { ...current, chargerWaypoint: chargerWaypointNames[0] }
    })
  }, [chargerWaypointNames])

  function requireTaskCreateService(setFeedback: React.Dispatch<React.SetStateAction<GoToChargerFeedback | null>>) {
    if (!taskCreateServiceError)
      return true

    setFeedback({ tone: 'error', message: taskCreateServiceError })
    toast.error(taskCreateServiceError)
    return false
  }

  function updateMultiGoToPoseStop(stopId: string, waypoint: string) {
    setMultiGoToPoseDraft(current => ({
      ...current,
      stops: current.stops.map(stop => stop.id === stopId ? { ...stop, waypoint } : stop),
    }))
    setMultiGoToPoseFeedback(null)
  }

  function addMultiGoToPoseStop() {
    setMultiGoToPoseDraft(current => ({
      ...current,
      stops: [...current.stops, { id: createId('go-to-pose'), waypoint: '' }],
    }))
    setMultiGoToPoseFeedback(null)
  }

  function removeMultiGoToPoseStop(stopId: string) {
    setMultiGoToPoseDraft(current => (
      current.stops.length <= 2
        ? current
        : { ...current, stops: current.stops.filter(stop => stop.id !== stopId) }
    ))
    setMultiGoToPoseFeedback(null)
  }

  function moveMultiGoToPoseStop(stopId: string, offset: -1 | 1) {
    setMultiGoToPoseDraft((current) => {
      const index = current.stops.findIndex(stop => stop.id === stopId)
      const targetIndex = index + offset
      if (index < 0 || targetIndex < 0 || targetIndex >= current.stops.length)
        return current

      const stops = [...current.stops]
      const movingStop = stops[index]
      stops[index] = stops[targetIndex]
      stops[targetIndex] = movingStop
      return { ...current, stops }
    })
    setMultiGoToPoseFeedback(null)
  }

  async function createGoToChargerTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const robot = goToChargerDraft.robot.trim()
    const chargerWaypoint = goToChargerDraft.chargerWaypoint.trim()

    if (!robot) {
      setGoToChargerFeedback({ tone: 'error', message: 'Select a robot before creating the task.' })
      return
    }
    if (!normalizedFleetName) {
      setGoToChargerFeedback({ tone: 'error', message: 'Waiting for fleet state before creating the task.' })
      return
    }
    if (!chargerWaypoint) {
      setGoToChargerFeedback({ tone: 'error', message: 'No charger waypoint is selected.' })
      return
    }
    if (!requireTaskCreateService(setGoToChargerFeedback))
      return

    setIsCreatingGoToChargerTask(true)
    setGoToChargerFeedback(null)
    try {
      const response = await apiServer.createTask({
        name: goToChargerTaskName,
        robot_name: robot,
        fleet_name: normalizedFleetName,
        unit_tasks: [
          {
            seq: 0,
            waypoint: chargerWaypoint,
            action_name: '',
            action_params_json: '{}',
          },
          {
            seq: 1,
            waypoint: '',
            action_name: goToChargerActionName,
            action_params_json: '{}',
          },
        ],
      }, {
        servicePath: taskCreateServicePath,
      })
      const taskLabel = response.task_id ? `Task ${shortIdentifier(response.task_id)} created` : 'Task created'
      setGoToChargerFeedback({ tone: 'success', message: response.message || taskLabel })
      toast.success(taskLabel)
    }
    catch (error) {
      const message = errorMessage(error)
      setGoToChargerFeedback({ tone: 'error', message })
      toast.error(`Failed to create task: ${message}`)
    }
    finally {
      setIsCreatingGoToChargerTask(false)
    }
  }

  async function createGoToWaypointTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const robot = goToWaypointDraft.robot.trim()
    const waypoint = goToWaypointDraft.waypoint.trim()

    if (!robot) {
      setGoToWaypointFeedback({ tone: 'error', message: 'Select a robot before creating the task.' })
      return
    }
    if (!normalizedFleetName) {
      setGoToWaypointFeedback({ tone: 'error', message: 'Waiting for fleet state before creating the task.' })
      return
    }
    if (!waypoint) {
      setGoToWaypointFeedback({ tone: 'error', message: 'Enter a waypoint before creating the task.' })
      return
    }
    if (!requireTaskCreateService(setGoToWaypointFeedback))
      return

    setIsCreatingGoToWaypointTask(true)
    setGoToWaypointFeedback(null)
    try {
      const response = await apiServer.createTask({
        name: goToWaypointTaskName,
        robot_name: robot,
        fleet_name: normalizedFleetName,
        unit_tasks: [{
          seq: 1,
          waypoint,
          action_name: '',
          action_params_json: '{}',
        }],
      }, {
        servicePath: taskCreateServicePath,
      })
      const taskLabel = response.task_id ? `Task ${shortIdentifier(response.task_id)} created` : 'Task created'
      setGoToWaypointFeedback({ tone: 'success', message: response.message || taskLabel })
      toast.success(taskLabel)
    }
    catch (error) {
      const message = errorMessage(error)
      setGoToWaypointFeedback({ tone: 'error', message })
      toast.error(`Failed to create task: ${message}`)
    }
    finally {
      setIsCreatingGoToWaypointTask(false)
    }
  }

  async function createMultiGoToPoseTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const robot = multiGoToPoseDraft.robot.trim()

    if (!robot) {
      setMultiGoToPoseFeedback({ tone: 'error', message: 'Select a robot before creating the task.' })
      return
    }
    if (!normalizedFleetName) {
      setMultiGoToPoseFeedback({ tone: 'error', message: 'Waiting for fleet state before creating the task.' })
      return
    }
    if (!multiGoToPoseUnitTasks.ok) {
      setMultiGoToPoseFeedback({ tone: 'error', message: `Template error: ${multiGoToPoseUnitTasks.error}` })
      return
    }
    if (!requireTaskCreateService(setMultiGoToPoseFeedback))
      return

    setIsCreatingMultiGoToPoseTask(true)
    setMultiGoToPoseFeedback(null)
    try {
      const response = await apiServer.createTask({
        name: multiGoToPoseTaskName,
        robot_name: robot,
        fleet_name: normalizedFleetName,
        unit_tasks: multiGoToPoseUnitTasks.unitTasks,
      }, {
        servicePath: taskCreateServicePath,
      })
      const taskLabel = response.task_id ? `Task ${shortIdentifier(response.task_id)} created` : 'Task created'
      setMultiGoToPoseFeedback({ tone: 'success', message: response.message || taskLabel })
      toast.success(taskLabel)
    }
    catch (error) {
      const message = errorMessage(error)
      setMultiGoToPoseFeedback({ tone: 'error', message: `Submission error: ${message}` })
      toast.error(`Task submission failed: ${message}`)
    }
    finally {
      setIsCreatingMultiGoToPoseTask(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      <Surface className="p-4">
        <div className="space-y-6">
          <form className="space-y-4" onSubmit={createGoToChargerTask}>
            <div>
              <div className="text-4 font-800">Go to charger</div>
              <div className="text-xs text-gray-500">Create a Task Manager task</div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Robot</FieldLabel>
              <select
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={goToChargerDraft.robot}
                onChange={event => setGoToChargerDraft(current => ({ ...current, robot: event.target.value }))}>
                {robotOptions.map(robot => <option key={robot} value={robot}>{robot}</option>)}
                {robotOptions.length === 0 && <option value="">No robots</option>}
              </select>
            </div>

            <div className="space-y-2">
              <FieldLabel>Charger</FieldLabel>
              <select
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={goToChargerDraft.chargerWaypoint}
                onChange={event => setGoToChargerDraft(current => ({ ...current, chargerWaypoint: event.target.value }))}>
                {chargerWaypointOptions.map(option => (
                  <option key={`${option.name}:${option.levelName}:${option.graphName}`} value={option.name}>
                    {option.name} ({option.levelName})
                  </option>
                ))}
                {chargerWaypointOptions.length === 0 && <option value="">No charger waypoints</option>}
              </select>
            </div>

            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-700 uppercase text-gray-400">Fleet</div>
              <div className="mt-0.5 min-w-0 break-words text-sm font-700 text-gray-800">
                {normalizedFleetName || 'Waiting for fleet state'}
              </div>
            </div>

            <div className="rounded-lg border-(solid 1px gray-200) bg-white/70 px-3 py-2">
              <div className="text-[11px] font-700 uppercase text-gray-400">Unit tasks</div>
              <div className="mt-1 space-y-1 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge className="bg-emerald-50 text-emerald-700">#0</Badge>
                  <span className="font-800 text-gray-900">{goToChargerDraft.chargerWaypoint || '--'}</span>
                  <span className="text-gray-500">Go to charger</span>
                  {selectedChargerOption && (
                    <span className="text-xs text-gray-400">{selectedChargerOption.levelName}</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge className="bg-sky-50 text-sky-700">#1</Badge>
                  <span className="font-800 text-gray-900">{goToChargerActionName}</span>
                  <span className="text-gray-500">Dock at charger</span>
                </div>
              </div>
            </div>

            {goToChargerFeedback && (
              <div
                className={classNames(
                  'rounded-lg px-3 py-2 text-sm',
                  goToChargerFeedback.tone === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700',
                )}
              >
                {goToChargerFeedback.message}
              </div>
            )}

            <Button
              type="submit"
              tone="primary"
              icon={isCreatingGoToChargerTask ? 'i-material-symbols-progress-activity' : 'i-material-symbols-battery-charging-full-rounded'}
              className="w-full"
              disabled={isCreatingGoToChargerTask || !canCreateGoToChargerTask}>
              Create task
            </Button>
          </form>

          <form className="space-y-4 border-(t-solid 1px gray-200) pt-5" onSubmit={createGoToWaypointTask}>
            <div>
              <div className="text-4 font-800">Go to waypoint</div>
              <div className="text-xs text-gray-500">Create a Task Manager task</div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Robot</FieldLabel>
              <select
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={goToWaypointDraft.robot}
                onChange={event => setGoToWaypointDraft(current => ({ ...current, robot: event.target.value }))}>
                {robotOptions.map(robot => <option key={robot} value={robot}>{robot}</option>)}
                {robotOptions.length === 0 && <option value="">No robots</option>}
              </select>
            </div>

            <div className="space-y-2">
              <FieldLabel>Waypoint</FieldLabel>
              {waypointOptions.length > 0
                ? (
                    <select
                      className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                      value={goToWaypointDraft.waypoint}
                      onChange={event => setGoToWaypointDraft(current => ({ ...current, waypoint: event.target.value }))}>
                      {waypointOptions.map(option => (
                        <option key={`${option.name}:${option.levelName}:${option.graphName}`} value={option.name}>
                          {option.name} ({option.levelName})
                        </option>
                      ))}
                    </select>
                  )
                : (
                    <input
                      className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                      placeholder="WP_001"
                      value={goToWaypointDraft.waypoint}
                      onChange={event => setGoToWaypointDraft(current => ({ ...current, waypoint: event.target.value }))}
                    />
                  )}
            </div>

            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-700 uppercase text-gray-400">Fleet</div>
              <div className="mt-0.5 min-w-0 break-words text-sm font-700 text-gray-800">
                {normalizedFleetName || 'Waiting for fleet state'}
              </div>
            </div>

            <div className="rounded-lg border-(solid 1px gray-200) bg-white/70 px-3 py-2">
              <div className="text-[11px] font-700 uppercase text-gray-400">Unit task</div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <Badge className="bg-blue-50 text-blue-700">#1</Badge>
                <span className="font-800 text-gray-900">{goToWaypointDraft.waypoint.trim() || '--'}</span>
                <span className="text-gray-500">Navigate</span>
                <span className="text-xs text-gray-400">
                  {selectedWaypointOption ? selectedWaypointOption.levelName : 'Manual waypoint'}
                </span>
              </div>
            </div>

            {goToWaypointFeedback && (
              <div
                className={classNames(
                  'rounded-lg px-3 py-2 text-sm',
                  goToWaypointFeedback.tone === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700',
                )}
              >
                {goToWaypointFeedback.message}
              </div>
            )}

            <Button
              type="submit"
              tone="primary"
              icon={isCreatingGoToWaypointTask ? 'i-material-symbols-progress-activity' : 'i-material-symbols-route-rounded'}
              className="w-full"
              disabled={isCreatingGoToWaypointTask || !canCreateGoToWaypointTask}>
              Create task
            </Button>
          </form>

          <form className="space-y-4 border-(t-solid 1px gray-200) pt-5" onSubmit={createMultiGoToPoseTask}>
            <div>
              <div className="text-4 font-800">Multi Go To Pose</div>
              <div className="text-xs text-gray-500">Create an ordered Waypoint Task</div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Robot</FieldLabel>
              <select
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={multiGoToPoseDraft.robot}
                onChange={event => setMultiGoToPoseDraft(current => ({ ...current, robot: event.target.value }))}>
                {robotOptions.map(robot => <option key={robot} value={robot}>{robot}</option>)}
                {robotOptions.length === 0 && <option value="">No robots</option>}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>Waypoints</FieldLabel>
                <Badge className="bg-gray-50 text-gray-700">{multiGoToPoseDraft.stops.length} stops</Badge>
              </div>

              {multiGoToPoseDraft.stops.map((stop, index) => {
                const waypointOption = waypointOptions.find(option => option.name === stop.waypoint.trim()) ?? null
                return (
                  <div key={stop.id} className="rounded-lg border-(solid 1px gray-200) bg-white/70 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge className="bg-blue-50 text-blue-700">#{index}</Badge>
                      <div className="flex items-center gap-1">
                        <IconButton
                          type="button"
                          icon="i-material-symbols-arrow-upward-rounded"
                          title={`Move Waypoint #${index} up`}
                          disabled={index === 0}
                          onClick={() => moveMultiGoToPoseStop(stop.id, -1)}
                        />
                        <IconButton
                          type="button"
                          icon="i-material-symbols-arrow-downward-rounded"
                          title={`Move Waypoint #${index} down`}
                          disabled={index === multiGoToPoseDraft.stops.length - 1}
                          onClick={() => moveMultiGoToPoseStop(stop.id, 1)}
                        />
                        <IconButton
                          type="button"
                          icon="i-material-symbols-delete-outline-rounded"
                          title={`Remove Waypoint #${index}`}
                          tone="danger"
                          disabled={multiGoToPoseDraft.stops.length <= 2}
                          onClick={() => removeMultiGoToPoseStop(stop.id)}
                        />
                      </div>
                    </div>

                    <select
                      className="h-9 box-border w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                      aria-label={`Waypoint #${index}`}
                      value={stop.waypoint}
                      disabled={waypointOptions.length === 0}
                      onChange={event => updateMultiGoToPoseStop(stop.id, event.target.value)}>
                      <option value="">{waypointOptions.length > 0 ? 'Select waypoint' : 'No waypoints available'}</option>
                      {waypointOptions.map(option => (
                        <option key={`${option.name}:${option.levelName}:${option.graphName}`} value={option.name}>
                          {option.name} ({option.levelName})
                        </option>
                      ))}
                    </select>

                    <div className="mt-1 min-h-4 text-xs text-gray-400">
                      {waypointOption
                        ? `${waypointOption.levelName} · ${waypointOption.graphName}`
                        : waypointOptions.length > 0
                          ? 'Waypoint required'
                          : 'Waiting for navigation Waypoints'}
                    </div>
                  </div>
                )
              })}

              <Button
                type="button"
                icon="i-material-symbols-add-rounded"
                className="w-full"
                onClick={addMultiGoToPoseStop}>
                Add waypoint
              </Button>
            </div>

            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-700 uppercase text-gray-400">Fleet</div>
              <div className="mt-0.5 min-w-0 break-words text-sm font-700 text-gray-800">
                {normalizedFleetName || 'Waiting for fleet state'}
              </div>
            </div>

            <div className="rounded-lg border-(solid 1px gray-200) bg-white/70 px-3 py-2">
              <div className="text-[11px] font-700 uppercase text-gray-400">Unit task sequence</div>
              <div className="mt-1 space-y-1 text-sm">
                {multiGoToPoseDraft.stops.map((stop, index) => (
                  <div key={`preview:${stop.id}`} className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge className="bg-blue-50 text-blue-700">#{index}</Badge>
                    <span className="min-w-0 break-words font-800 text-gray-900">{stop.waypoint.trim() || '--'}</span>
                    <span className="text-gray-500">Go To</span>
                  </div>
                ))}
              </div>
            </div>

            {multiGoToPoseFeedback && (
              <div
                className={classNames(
                  'rounded-lg px-3 py-2 text-sm',
                  multiGoToPoseFeedback.tone === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700',
                )}
              >
                {multiGoToPoseFeedback.message}
              </div>
            )}

            <Button
              type="submit"
              tone="primary"
              icon={isCreatingMultiGoToPoseTask ? 'i-material-symbols-progress-activity' : 'i-material-symbols-conversion-path-rounded'}
              className="w-full"
              disabled={isCreatingMultiGoToPoseTask || !canCreateMultiGoToPoseTask}>
              Create task
            </Button>
          </form>

          <form className="space-y-4 border-(t-solid 1px gray-200) pt-5" onSubmit={createTask}>
            <div>
              <div className="text-4 font-800">Local queue</div>
              <div className="text-xs text-gray-500">Local queue</div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Task name</FieldLabel>
              <input
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={taskDraft.title}
                onChange={event => setTaskDraft(current => ({ ...current, title: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Robot</FieldLabel>
              <select
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={taskDraft.robot}
                onChange={event => setTaskDraft(current => ({ ...current, robot: event.target.value }))}>
                <option value="">Auto assign</option>
                {robotOptions.map(robot => <option key={robot} value={robot}>{robot}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <FieldLabel>Map</FieldLabel>
              <select
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={taskDraft.map}
                onChange={event => setTaskDraft(current => ({ ...current, map: event.target.value }))}>
                <option value="">Default map</option>
                {mapOptions.map(map => <option key={map} value={map}>{map}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <FieldLabel>Timer</FieldLabel>
                <input
                  className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                  type="datetime-local"
                  value={taskDraft.scheduleAt}
                  onChange={event => setTaskDraft(current => ({ ...current, scheduleAt: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Priority</FieldLabel>
                <select
                  className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                  value={taskDraft.priority}
                  onChange={event => setTaskDraft(current => ({ ...current, priority: event.target.value as FleetTaskPriority }))}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <Button type="submit" tone="primary" icon="i-material-symbols-add-rounded" className="w-full">
              Add task
            </Button>
          </form>
        </div>
      </Surface>

      <div className="space-y-4">
        <TaskManagerPanel />

        <Surface>
          <div className="flex items-center justify-between border-(b-solid 1px gray-200) px-4 py-3">
            <div>
              <div className="font-800">Local Queue</div>
              <div className="text-xs text-gray-500">{tasks.length} total</div>
            </div>
            <Badge className="bg-white text-gray-700">{tasks.filter(task => task.status === 'active').length} active</Badge>
          </div>

          {sortedTasks.length > 0
            ? (
                <div className="divide-y divide-gray-200">
                  {sortedTasks.map(task => (
                    <div key={task.id} className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[1fr_15rem_12rem]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate font-800 text-gray-900">{task.title}</div>
                          <Badge className={getTaskStatusClass(task.status)}>{task.status}</Badge>
                          <Badge className={getPriorityClass(task.priority)}>{task.priority}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span>Robot {task.robot || 'Auto'}</span>
                          <span>Map {task.map || 'Default'}</span>
                          <span>{formatDateTime(task.scheduleAt)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="i-material-symbols-timer-outline-rounded text-5 text-gray-500" />
                        <input
                          className="h-8 min-w-0 flex-1 rounded-lg border-(solid 1px gray-300) bg-white/80 px-2 text-xs outline-none focus:border-emerald-600"
                          type="datetime-local"
                          value={task.scheduleAt}
                          onChange={event => updateTaskSchedule(task.id, event.target.value)}
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <span className="mr-auto text-xs font-700 text-gray-500">{formatTimer(task.scheduleAt, task.status)}</span>
                        {task.status !== 'active' && task.status !== 'done' && (
                          <IconButton
                            icon="i-material-symbols-play-arrow-rounded"
                            title="Start"
                            tone="primary"
                            onClick={() => updateTaskStatus(task.id, 'active')}
                          />
                        )}
                        {task.status === 'active' && (
                          <IconButton
                            icon="i-material-symbols-pause-rounded"
                            title="Pause"
                            onClick={() => updateTaskStatus(task.id, 'paused')}
                          />
                        )}
                        {task.status !== 'done' && (
                          <IconButton
                            icon="i-material-symbols-check-rounded"
                            title="Complete"
                            onClick={() => updateTaskStatus(task.id, 'done')}
                          />
                        )}
                        <IconButton
                          icon="i-material-symbols-delete-outline-rounded"
                          title="Delete"
                          tone="danger"
                          onClick={() => deleteTask(task.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
            : (
                <div className="px-4 py-14 text-center text-sm text-gray-500">No local tasks</div>
              )}
        </Surface>
      </div>
    </div>
  )
}

function StoragePage({
  areas,
  storageDraft,
  setStorageDraft,
  createStorageArea,
  updateStorageArea,
  deleteStorageArea,
  mapOptions,
  storageState,
  storageStatus,
  storageError,
  storageUpdatedAt,
  buildingMap,
  host,
}: {
  areas: StorageArea[]
  storageDraft: StorageDraft
  setStorageDraft: React.Dispatch<React.SetStateAction<StorageDraft>>
  createStorageArea: (event: React.FormEvent<HTMLFormElement>) => void
  updateStorageArea: (id: string, patch: Partial<StorageArea>) => void
  deleteStorageArea: (id: string) => void
  mapOptions: string[]
  storageState: StorageStateValue | null
  storageStatus: string
  storageError: string | null
  storageUpdatedAt: number | null
  buildingMap: BuildingMapMessage | null
  host: string
}) {
  const [isReinitializingStorage, setIsReinitializingStorage] = useState(false)
  const [storageReinitFeedback, setStorageReinitFeedback] = useState<StorageFeedback | null>(null)
  const [storageReinitLayerDrafts, setStorageReinitLayerDrafts] = useState<StorageReinitLayerDraft[] | null>(null)
  const [storageReinitLayerError, setStorageReinitLayerError] = useState<string | null>(null)
  const [editingStorageAreaIndex, setEditingStorageAreaIndex] = useState<number | null>(null)
  const [storageAreaNameDraft, setStorageAreaNameDraft] = useState('')
  const [savingStorageAreaIndex, setSavingStorageAreaIndex] = useState<number | null>(null)
  const [storageAreaNameFeedback, setStorageAreaNameFeedback] = useState<Record<number, StorageFeedback>>({})
  const fleetSiteNamespace = useFleetSiteNamespace()
  const storageStateKey = prefixFleetSiteTopic(fleetSiteNamespace.namespace, storageStateTopic)
  const storageAreaDisplayNameServicePath = prefixFleetSiteTopic(fleetSiteNamespace.namespace, storageAreaDisplayNameServiceTopic)
  const storageReinitServicePath = prefixFleetSiteTopic(fleetSiteNamespace.namespace, storageReinitServiceTopic)
  const storageReinitServiceError = fleetSiteNamespace.status === 'idle' || fleetSiteNamespace.status === 'loading'
    ? 'Loading site name'
    : storageReinitServicePath
      ? ''
      : fleetSiteNamespace.error || 'Missing site name'
  const storageAreaDisplayNameServiceError = fleetSiteNamespace.status === 'idle' || fleetSiteNamespace.status === 'loading'
    ? 'Loading site name'
    : storageAreaDisplayNameServicePath
      ? ''
      : fleetSiteNamespace.error || 'Missing site name'
  const storageCellsById = useMemo(() => {
    const cells = new Map<string, StorageCellStockMessage>()
    for (const cell of storageState?.cells ?? [])
      cells.set(cell.cellId, cell)
    return cells
  }, [storageState])
  const generatedStorage = useMemo(
    () => buildStorageReinitLayout(buildingMap, storageState),
    [buildingMap, storageState],
  )
  const statusClass = storageState
    ? 'bg-emerald-50 text-emerald-700'
    : storageError
      ? 'bg-red-50 text-red-700'
      : 'bg-gray-100 text-gray-600'
  const storageStatusLabel = storageState
    ? formatStatus('subscribed', true)
    : storageError
      ? formatStatus(storageStatus, false)
      : '等待数据'
  const canReinitializeStorage = Boolean(host && generatedStorage.layout.areas.length > 0 && !storageReinitServiceError && !isReinitializingStorage)

  function openStorageReinitLayerDialog() {
    if (!window.zcDesktop?.isDesktop) {
      setStorageReinitFeedback({ tone: 'error', message: 'Desktop app required' })
      return
    }
    if (!host) {
      setStorageReinitFeedback({ tone: 'error', message: 'Missing controller' })
      return
    }
    if (generatedStorage.layout.areas.length === 0) {
      setStorageReinitFeedback({ tone: 'error', message: 'No storage waypoints found' })
      return
    }
    if (storageReinitServiceError) {
      setStorageReinitFeedback({ tone: 'error', message: storageReinitServiceError })
      return
    }

    setStorageReinitFeedback(null)
    setStorageReinitLayerError(null)
    setStorageReinitLayerDrafts(buildStorageReinitLayerDrafts(generatedStorage.layout))
  }

  function updateStorageReinitLayerDraft(index: number, rows: string) {
    setStorageReinitLayerDrafts(current => current?.map((draft, draftIndex) => (
      draftIndex === index ? { ...draft, rows } : draft
    )) ?? null)
  }

  function closeStorageReinitLayerDialog() {
    if (isReinitializingStorage)
      return

    setStorageReinitLayerDrafts(null)
    setStorageReinitLayerError(null)
  }

  function editStorageAreaDisplayName(area: StorageAreaLayoutMessage) {
    setEditingStorageAreaIndex(area.areaIndex)
    setStorageAreaNameDraft(area.displayName || '')
    setStorageAreaNameFeedback(current => ({
      ...current,
      [area.areaIndex]: { tone: 'success', message: '' },
    }))
  }

  function cancelStorageAreaDisplayNameEdit() {
    if (savingStorageAreaIndex != null)
      return

    setEditingStorageAreaIndex(null)
    setStorageAreaNameDraft('')
  }

  async function saveStorageAreaDisplayName(areaIndex: number) {
    if (!window.zcDesktop?.isDesktop || !window.zcDesktop.setZenohStorageAreaDisplayName) {
      setStorageAreaNameFeedback(current => ({
        ...current,
        [areaIndex]: { tone: 'error', message: 'Desktop app required' },
      }))
      return
    }
    if (!host) {
      setStorageAreaNameFeedback(current => ({
        ...current,
        [areaIndex]: { tone: 'error', message: 'Missing controller' },
      }))
      return
    }
    if (storageAreaDisplayNameServiceError) {
      setStorageAreaNameFeedback(current => ({
        ...current,
        [areaIndex]: { tone: 'error', message: storageAreaDisplayNameServiceError },
      }))
      return
    }

    setSavingStorageAreaIndex(areaIndex)
    setStorageAreaNameFeedback(current => ({
      ...current,
      [areaIndex]: { tone: 'success', message: '' },
    }))
    try {
      const response = await window.zcDesktop.setZenohStorageAreaDisplayName({
        host,
        servicePath: storageAreaDisplayNameServicePath,
        areaIndex,
        displayName: storageAreaNameDraft,
        timeoutMs: 10000,
      })
      if (response.success) {
        setEditingStorageAreaIndex(null)
        setStorageAreaNameDraft('')
        setStorageAreaNameFeedback(current => ({
          ...current,
          [areaIndex]: { tone: 'success', message: response.message || 'Display name updated' },
        }))
      }
      else {
        const message = response.error_code ? `${response.error_code}: ${response.message}` : response.message || 'Display name update rejected'
        setStorageAreaNameFeedback(current => ({
          ...current,
          [areaIndex]: { tone: 'error', message },
        }))
      }
    }
    catch (error) {
      const message = errorMessage(error)
      setStorageAreaNameFeedback(current => ({
        ...current,
        [areaIndex]: { tone: 'error', message },
      }))
      console.warn('Failed to update storage area display name', error)
    }
    finally {
      setSavingStorageAreaIndex(null)
    }
  }

  async function reinitializeStorageFromWaypoints(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!storageReinitLayerDrafts)
      return

    const invalidDraft = storageReinitLayerDrafts.find((draft) => {
      const rows = Number(draft.rows.trim() || '1')
      return !Number.isInteger(rows) || rows <= 0
    })
    if (invalidDraft) {
      setStorageReinitLayerError(`Area ${invalidDraft.areaIndex}, shelf ${invalidDraft.shelfIndex} needs a positive whole number of layers.`)
      return
    }
    if (!window.zcDesktop?.isDesktop || !window.zcDesktop.reinitZenohStorage) {
      const message = 'Desktop app required'
      setStorageReinitLayerError(message)
      setStorageReinitFeedback({ tone: 'error', message })
      return
    }
    if (!host) {
      const message = 'Missing controller'
      setStorageReinitLayerError(message)
      setStorageReinitFeedback({ tone: 'error', message })
      return
    }
    if (storageReinitServiceError) {
      setStorageReinitLayerError(storageReinitServiceError)
      setStorageReinitFeedback({ tone: 'error', message: storageReinitServiceError })
      return
    }

    const zcDesktop = window.zcDesktop
    const layout = buildStorageReinitLayoutFromLayerDrafts(storageReinitLayerDrafts)
    const requestId = `app-reinit-${Date.now()}`
    setIsReinitializingStorage(true)
    setStorageReinitLayerError(null)
    setStorageReinitFeedback(null)
    try {
      const response = await zcDesktop.reinitZenohStorage({
        host,
        servicePath: storageReinitServicePath,
        timeoutMs: 20000,
        request: {
          request_id: requestId,
          confirm_reinitialize: true,
          caller_id: 'operator-app',
          reason: 'reset storage layout from site waypoints',
          layout,
        },
      })
      if (response.success) {
        setStorageReinitLayerDrafts(null)
        setStorageReinitFeedback({
          tone: 'success',
          message: `Reinitialized storage ${response.old_revision} -> ${response.new_revision}`,
        })
      }
      else {
        const message = response.error_code ? `${response.error_code}: ${response.message}` : response.message || 'Storage reinit rejected'
        setStorageReinitLayerError(message)
        setStorageReinitFeedback({
          tone: 'error',
          message,
        })
      }
    }
    catch (error) {
      const message = errorMessage(error)
      setStorageReinitLayerError(message)
      setStorageReinitFeedback({ tone: 'error', message })
      console.warn('Failed to reinitialize storage', error)
    }
    finally {
      setIsReinitializingStorage(false)
    }
  }

  function renderStorageCell(areaIndex: number, shelf: StorageShelfMessage, columnIndex: number, rowIndex: number) {
    const cellId = getStorageCellId(areaIndex, shelf.shelfIndex, columnIndex, rowIndex)
    const cell = storageCellsById.get(cellId)
    const status = cell ? getStorageCellStatus(cell.stock) : 'blocked'

    return (
      <div
        key={cellId}
        className={classNames(
          'min-h-13 min-w-0 rounded-md border p-2 text-xs leading-4',
          getStorageCellClass(status),
        )}
        title={cellId}>
        <div className="truncate font-800">{`C${columnIndex} R${rowIndex}`}</div>
        <div className="truncate">{formatStorageCellStock(cell)}</div>
      </div>
    )
  }

  function renderStorageShelf(areaIndex: number, shelf: StorageShelfMessage) {
    const cellIds = Array.from({ length: shelf.rows }, (_, rowIndex) => (
      Array.from({ length: shelf.columns }, (_column, columnIndex) => (
        getStorageCellId(areaIndex, shelf.shelfIndex, columnIndex + 1, rowIndex + 1)
      ))
    )).flat()
    const shelfCells = cellIds.map(cellId => storageCellsById.get(cellId)).filter((cell): cell is StorageCellStockMessage => Boolean(cell))
    const disabled = shelfCells.filter(cell => cell.stock < 0).length
    const withStock = shelfCells.filter(cell => cell.stock > 0).length
    const available = shelfCells.filter(cell => cell.stock === 0).length

    return (
      <div key={shelf.shelfIndex} className="mt-4 rounded-lg border-(solid 1px gray-200) bg-white/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-800 text-gray-900">Shelf {shelf.shelfIndex}</div>
            <div className="text-xs text-gray-500">
              {shelf.columns} columns x {shelf.rows} rows · {shelf.shelfSide || 'side not set'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2 py-1 font-700 text-emerald-700">{available} available</span>
            <span className="rounded-full bg-amber-50 px-2 py-1 font-700 text-amber-700">{withStock} occupied</span>
            <span className="rounded-full bg-red-50 px-2 py-1 font-700 text-red-700">{disabled} disabled</span>
          </div>
        </div>
        <div
          className="mt-3 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, shelf.columns)}, minmax(4.75rem, 1fr))` }}>
          {Array.from({ length: shelf.rows }, (_row, rowIndex) => (
            Array.from({ length: shelf.columns }, (_column, columnIndex) => (
              renderStorageCell(areaIndex, shelf, columnIndex + 1, rowIndex + 1)
            ))
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Surface className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-800 text-gray-900">Storage State</div>
            <div className="text-xs text-gray-500">
              {storageState ? `${storageState.key || storageStateKey || storageStateTopic} · updated ${formatTime(storageUpdatedAt)}` : 'Waiting for live storage snapshot'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              tone="primary"
              icon={isReinitializingStorage ? 'i-material-symbols-progress-activity' : 'i-material-symbols-sync-rounded'}
              disabled={!canReinitializeStorage}
              onClick={openStorageReinitLayerDialog}>
              Reinit from waypoints
            </Button>
            <Badge className={statusClass}>{storageStatusLabel}</Badge>
          </div>
        </div>

        {storageError && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-700 text-red-700">{storageError}</div>}
        {storageReinitFeedback && (
          <div className={classNames(
            'mt-3 rounded-lg px-3 py-2 text-sm font-700',
            storageReinitFeedback.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
          )}>
            {storageReinitFeedback.message}
          </div>
        )}

        {storageState && (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div>
              <FieldLabel>Revision</FieldLabel>
              <div className="mt-1 text-5 font-800">{storageState.layoutRevision}</div>
            </div>
            <div>
              <FieldLabel>Total</FieldLabel>
              <div className="mt-1 text-5 font-800">{storageState.total}</div>
            </div>
            <div>
              <FieldLabel>With Stock</FieldLabel>
              <div className="mt-1 text-5 font-800">{storageState.withStock}</div>
            </div>
            <div>
              <FieldLabel>Disabled</FieldLabel>
              <div className="mt-1 text-5 font-800">{storageState.disabled}</div>
            </div>
            <div>
              <FieldLabel>Areas</FieldLabel>
              <div className="mt-1 text-5 font-800">{storageState.layout.areas.length}</div>
            </div>
          </div>
        )}
        <div className="mt-4 rounded-lg border-(solid 1px gray-200) bg-white/60 px-3 py-2 text-sm text-gray-700">
          Generated layout: {generatedStorage.layout.areas.length} areas, {generatedStorage.shelfCount} shelves, {generatedStorage.waypointCount} storage waypoints.
        </div>
      </Surface>

      {storageState
        ? (
            storageState.layout.areas.length > 0
              ? (
                  <div className="space-y-3">
                    {storageState.layout.areas.map((area) => {
                      const displayName = area.displayName.trim()
                      const areaTitle = displayName || `Area ${area.areaIndex}`
                      const isEditingAreaName = editingStorageAreaIndex === area.areaIndex
                      const isSavingAreaName = savingStorageAreaIndex === area.areaIndex
                      const areaNameFeedback = storageAreaNameFeedback[area.areaIndex]

                      return (
                        <Surface key={area.areaIndex} className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-800 text-gray-900">{areaTitle}</div>
                              <div className="text-xs text-gray-500">
                                {displayName ? `Area ${area.areaIndex} · ${area.shelves.length} shelves` : `${area.shelves.length} shelves`}
                              </div>
                            </div>
                            {!isEditingAreaName && (
                              <IconButton
                                type="button"
                                icon="i-material-symbols-edit-outline-rounded"
                                title="Edit display name"
                                disabled={savingStorageAreaIndex != null}
                                onClick={() => editStorageAreaDisplayName(area)}
                              />
                            )}
                          </div>

                          {isEditingAreaName && (
                            <form
                              className="mt-3 flex flex-wrap items-end gap-2"
                              onSubmit={(event) => {
                                event.preventDefault()
                                void saveStorageAreaDisplayName(area.areaIndex)
                              }}>
                              <div className="min-w-60 flex-1 space-y-2">
                                <FieldLabel>Display name</FieldLabel>
                                <input
                                  className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white px-3 text-sm outline-none focus:border-emerald-600"
                                  maxLength={64}
                                  placeholder={`Area ${area.areaIndex}`}
                                  value={storageAreaNameDraft}
                                  disabled={isSavingAreaName}
                                  onChange={event => setStorageAreaNameDraft(event.target.value)}
                                />
                              </div>
                              <IconButton
                                type="submit"
                                icon={isSavingAreaName ? 'i-material-symbols-progress-activity' : 'i-material-symbols-check-rounded'}
                                title="Save display name"
                                tone="primary"
                                disabled={isSavingAreaName}
                              />
                              <IconButton
                                type="button"
                                icon="i-material-symbols-backspace-outline-rounded"
                                title="Clear display name"
                                disabled={isSavingAreaName || storageAreaNameDraft.length === 0}
                                onClick={() => setStorageAreaNameDraft('')}
                              />
                              <IconButton
                                type="button"
                                icon="i-material-symbols-close-rounded"
                                title="Cancel"
                                disabled={isSavingAreaName}
                                onClick={cancelStorageAreaDisplayNameEdit}
                              />
                            </form>
                          )}

                          {areaNameFeedback?.message && (
                            <div className={classNames(
                              'mt-3 rounded-lg px-3 py-2 text-sm font-700',
                              areaNameFeedback.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                            )}>
                              {areaNameFeedback.message}
                            </div>
                          )}

                          {area.shelves.map(shelf => renderStorageShelf(area.areaIndex, shelf))}
                        </Surface>
                      )
                    })}
                  </div>
                )
              : (
                  <Surface className="px-4 py-14 text-center text-sm text-gray-500">
                    No storage layout configured.
                  </Surface>
                )
          )
        : (
            <>
              <Surface className="p-4">
                <form className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_12rem_8rem_auto]" onSubmit={createStorageArea}>
                  <div className="space-y-2">
                    <FieldLabel>Storage area</FieldLabel>
                    <input
                      className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                      value={storageDraft.name}
                      onChange={event => setStorageDraft(current => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Map</FieldLabel>
                    <select
                      className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                      value={storageDraft.map}
                      onChange={event => setStorageDraft(current => ({ ...current, map: event.target.value }))}>
                      {mapOptions.map(map => <option key={map} value={map}>{map}</option>)}
                      {mapOptions.length === 0 && <option value="">No site files loaded</option>}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Capacity</FieldLabel>
                    <input
                      className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                      min={1}
                      type="number"
                      value={storageDraft.capacity}
                      onChange={event => setStorageDraft(current => ({ ...current, capacity: Math.max(1, Number(event.target.value) || 1) }))}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" tone="primary" icon="i-material-symbols-add-rounded">Add</Button>
                  </div>
                </form>
              </Surface>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {areas.map((area) => {
                  const fill = area.capacity > 0 ? Math.min(100, Math.round((area.occupied / area.capacity) * 100)) : 0
                  return (
                    <Surface key={area.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-800 text-gray-900">{area.name}</div>
                          <div className="text-xs text-gray-500">{area.map}</div>
                        </div>
                        <Badge className={getStorageStatusClass(area.status)}>{area.status}</Badge>
                      </div>

                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="font-700">{area.occupied}/{area.capacity}</span>
                          <span className="text-gray-500">{fill}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={classNames('h-full rounded-full', fill >= 90 ? 'bg-red-500' : fill >= 60 ? 'bg-amber-500' : 'bg-emerald-500')}
                            style={{ width: `${fill}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                        <select
                          className="h-8 rounded-lg border-(solid 1px gray-300) bg-white/80 px-2 text-sm outline-none focus:border-emerald-600"
                          value={area.status}
                          onChange={event => updateStorageArea(area.id, { status: event.target.value as StorageStatus })}>
                          <option value="available">available</option>
                          <option value="reserved">reserved</option>
                          <option value="occupied">occupied</option>
                          <option value="blocked">blocked</option>
                        </select>
                        <div className="flex gap-2">
                          <IconButton
                            icon="i-material-symbols-remove-rounded"
                            title="Decrease occupied"
                            onClick={() => updateStorageArea(area.id, { occupied: Math.max(0, area.occupied - 1) })}
                          />
                          <IconButton
                            icon="i-material-symbols-add-rounded"
                            title="Increase occupied"
                            onClick={() => updateStorageArea(area.id, { occupied: Math.min(area.capacity, area.occupied + 1) })}
                          />
                          <IconButton
                            icon="i-material-symbols-delete-outline-rounded"
                            title="Delete storage area"
                            tone="danger"
                            onClick={() => deleteStorageArea(area.id)}
                          />
                        </div>
                      </div>
                    </Surface>
                  )
                })}
              </div>
            </>
          )}
      {storageReinitLayerDrafts && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/35 px-4 py-6">
          <form
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="storage-reinit-layers-title"
            onSubmit={event => void reinitializeStorageFromWaypoints(event)}>
            <div className="flex items-start justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
              <div>
                <div id="storage-reinit-layers-title" className="font-800 text-gray-900">Storage layers</div>
                <div className="text-xs text-gray-500">
                  {generatedStorage.shelfCount} shelves · {generatedStorage.waypointCount} waypoints
                </div>
              </div>
              <IconButton
                type="button"
                icon="i-material-symbols-close-rounded"
                title="Close"
                disabled={isReinitializingStorage}
                onClick={closeStorageReinitLayerDialog}
              />
            </div>

            <div className="max-h-[56vh] overflow-auto p-4">
              <div className="grid grid-cols-[1fr_7rem_9rem] gap-3 border-(b-solid 1px gray-100) pb-2 text-xs font-700 uppercase text-gray-500">
                <div>Shelf</div>
                <div>Columns</div>
                <div>Layers</div>
              </div>
              <div className="divide-y divide-gray-100">
                {storageReinitLayerDrafts.map((draft, index) => (
                  <div key={`${draft.areaIndex}:${draft.shelfIndex}`} className="grid grid-cols-[1fr_7rem_9rem] items-center gap-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-800 text-gray-900">
                        {draft.displayName.trim() ? `${draft.displayName.trim()} / Shelf ${draft.shelfIndex}` : `Area ${draft.areaIndex} / Shelf ${draft.shelfIndex}`}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {draft.displayName.trim() ? `Area ${draft.areaIndex} · ${draft.shelfSide || 'side not set'}` : draft.shelfSide || 'side not set'}
                      </div>
                    </div>
                    <div className="text-sm font-700 text-gray-700">{draft.columns}</div>
                    <input
                      className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white px-3 text-sm outline-none focus:border-emerald-600"
                      min={1}
                      step={1}
                      type="number"
                      value={draft.rows}
                      disabled={isReinitializingStorage}
                      onChange={event => updateStorageReinitLayerDraft(index, event.target.value)}
                    />
                  </div>
                ))}
              </div>

              {storageReinitLayerError && (
                <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-700 text-red-700">
                  {storageReinitLayerError}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-(t-solid 1px gray-200) px-4 py-3">
              <Button
                type="button"
                disabled={isReinitializingStorage}
                onClick={closeStorageReinitLayerDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                tone="danger"
                icon={isReinitializingStorage ? 'i-material-symbols-progress-activity' : 'i-material-symbols-sync-rounded'}
                disabled={isReinitializingStorage}>
                {isReinitializingStorage ? 'Reinitializing...' : 'Reinitialize'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function ComposeControlPage({ host }: { host: string }) {
  const [composeFiles, setComposeFiles] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [project, setProject] = useState('')
  const [serviceDraft, setServiceDraft] = useState('')
  const [detach, setDetach] = useState(true)
  const [build, setBuild] = useState(false)
  const [pull, setPull] = useState(false)
  const [removeOrphans, setRemoveOrphans] = useState(true)
  const [volumes, setVolumes] = useState(false)
  const [logService, setLogService] = useState('')
  const [logTail, setLogTail] = useState(200)
  const [logTimestamps, setLogTimestamps] = useState(false)
  const [composeStatus, setComposeStatus] = useState<ComposeControlStatusResponse | null>(null)
  const [composeLogs, setComposeLogs] = useState('')
  const [composeConfig, setComposeConfig] = useState('')
  const [lastCommand, setLastCommand] = useState<ComposeControlCommandResponse | null>(null)
  const [lastCommandAt, setLastCommandAt] = useState(0)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [runningAction, setRunningAction] = useState<ComposeControlAction | ''>('')
  const [composeError, setComposeError] = useState('')
  const selectedServices = useMemo(() => parseComposeServices(serviceDraft), [serviceDraft])
  const serviceOptions = useMemo(() => {
    const names = composeStatus?.services.map(getComposeServiceName).filter(name => name !== '--') ?? []
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
  }, [composeStatus])
  const commandOutput = composeOutputText(lastCommand)
  const canControl = Boolean(host && !runningAction)

  useEffect(() => {
    if (!host) {
      setComposeFiles([])
      setComposeStatus(null)
      setComposeError('Controller host is not configured.')
      return
    }

    void loadComposeFiles()
  }, [host])

  useEffect(() => {
    if (!host)
      return

    void refreshComposeStatus(false)
  }, [host, selectedFile])

  useEffect(() => {
    if (logService && !serviceOptions.includes(logService))
      setLogService('')
  }, [logService, serviceOptions])

  useInterval(() => {
    if (!host || isLoadingStatus || runningAction)
      return

    void refreshComposeStatus(false)
  }, host ? 5000 : undefined)

  async function loadComposeFiles() {
    if (!host)
      return

    setIsLoadingFiles(true)
    setComposeError('')
    try {
      const files = await apiServer.fetchComposeAllowedFiles()
      setComposeFiles(files)
      setSelectedFile(current => files.includes(current) ? current : files[0] ?? '')
    }
    catch (error) {
      const message = errorMessage(error)
      setComposeError(message)
      toast.error(`Failed to load compose files: ${message}`)
    }
    finally {
      setIsLoadingFiles(false)
    }
  }

  async function refreshComposeStatus(showToast = true) {
    if (!host)
      return

    setIsLoadingStatus(true)
    setComposeError('')
    try {
      const status = await apiServer.fetchComposeStatus(selectedFile.trim(), project.trim())
      setComposeStatus(status)
      if (showToast)
        toast.success(`Compose status: ${status.status}`)
    }
    catch (error) {
      const message = errorMessage(error)
      setComposeError(message)
      if (showToast)
        toast.error(`Failed to refresh compose status: ${message}`)
    }
    finally {
      setIsLoadingStatus(false)
    }
  }

  async function loadComposeLogs(showToast = true) {
    if (!host)
      return

    setIsLoadingLogs(true)
    setComposeError('')
    try {
      const response = await apiServer.fetchComposeLogs({
        file: selectedFile.trim(),
        project: project.trim(),
        service: logService,
        tail: logTail,
        timestamps: logTimestamps,
      })
      setComposeLogs(response.stdout || '')
      if (showToast)
        toast.success('Compose logs loaded')
    }
    catch (error) {
      const message = errorMessage(error)
      setComposeError(message)
      if (showToast)
        toast.error(`Failed to load compose logs: ${message}`)
    }
    finally {
      setIsLoadingLogs(false)
    }
  }

  async function loadComposeConfig() {
    if (!host)
      return

    setIsLoadingConfig(true)
    setComposeError('')
    try {
      const response = await apiServer.fetchComposeConfig(selectedFile.trim(), project.trim())
      setComposeConfig(response.stdout || '')
      toast.success('Compose config loaded')
    }
    catch (error) {
      const message = errorMessage(error)
      setComposeError(message)
      toast.error(`Failed to load compose config: ${message}`)
    }
    finally {
      setIsLoadingConfig(false)
    }
  }

  async function runComposeAction(action: ComposeControlAction) {
    if (!canControl)
      return

    if (action === 'down') {
      const message = volumes
        ? 'Stop and remove this Compose project, including volumes?'
        : 'Stop and remove this Compose project?'
      if (!window.confirm(message))
        return
    }

    setRunningAction(action)
    setComposeError('')
    try {
      const response = await apiServer.runComposeCommand(action, {
        file: selectedFile.trim() || undefined,
        project: project.trim() || undefined,
        services: action === 'down' ? undefined : selectedServices,
        detach: action === 'up' ? detach : undefined,
        build: action === 'up' ? build : undefined,
        pull: action === 'up' ? pull : undefined,
        remove_orphans: action === 'up' || action === 'down' ? removeOrphans : undefined,
        volumes: action === 'down' ? volumes : undefined,
      })
      setLastCommand(response)
      setLastCommandAt(Date.now())
      toast.success(`Compose ${composeControlActionLabels[action].toLowerCase()} completed`)
      await refreshComposeStatus(false)
      await loadComposeLogs(false)
    }
    catch (error) {
      const message = errorMessage(error)
      setComposeError(message)
      toast.error(`Compose ${composeControlActionLabels[action].toLowerCase()} failed: ${message}`)
    }
    finally {
      setRunningAction('')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[21rem_1fr]">
      <div className="space-y-4">
        <Surface className="p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-4 font-800">Docker Compose</div>
              <div className="text-xs text-gray-500">{host ? `${host}:4999` : 'Controller not set'}</div>
            </div>
            <IconButton
              icon={isLoadingFiles ? 'i-material-symbols-progress-activity' : 'i-material-symbols-refresh-rounded'}
              title="Reload compose files"
              disabled={!host || isLoadingFiles}
              onClick={() => void loadComposeFiles()}
            />
          </div>

          {composeError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{composeError}</div>}

          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>Compose file</FieldLabel>
              <select
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={selectedFile}
                disabled={!host || isLoadingFiles}
                onChange={event => setSelectedFile(event.target.value)}>
                {composeFiles.map(file => <option key={file} value={file}>{file}</option>)}
                {composeFiles.length === 0 && <option value="">Default compose file</option>}
              </select>
            </div>

            <div className="space-y-2">
              <FieldLabel>Project</FieldLabel>
              <input
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={project}
                placeholder="Default"
                onBlur={() => void refreshComposeStatus(false)}
                onChange={event => setProject(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Services</FieldLabel>
              <input
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={serviceDraft}
                placeholder="All services"
                onChange={event => setServiceDraft(event.target.value)}
              />
              <div className="text-xs text-gray-500">
                {selectedServices.length > 0 ? `${selectedServices.length} selected` : 'All services'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
              <label className="flex items-center gap-2 rounded-lg bg-white/65 px-3 py-2">
                <input type="checkbox" checked={detach} onChange={event => setDetach(event.target.checked)} />
                <span>Detach</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg bg-white/65 px-3 py-2">
                <input type="checkbox" checked={build} onChange={event => setBuild(event.target.checked)} />
                <span>Build</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg bg-white/65 px-3 py-2">
                <input type="checkbox" checked={pull} onChange={event => setPull(event.target.checked)} />
                <span>Pull</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg bg-white/65 px-3 py-2">
                <input type="checkbox" checked={removeOrphans} onChange={event => setRemoveOrphans(event.target.checked)} />
                <span>Orphans</span>
              </label>
              <label className="col-span-2 flex items-center gap-2 rounded-lg bg-white/65 px-3 py-2">
                <input type="checkbox" checked={volumes} onChange={event => setVolumes(event.target.checked)} />
                <span>Remove volumes on down</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                tone="primary"
                icon={runningAction === 'up' ? 'i-material-symbols-progress-activity' : 'i-material-symbols-play-arrow-rounded'}
                disabled={!canControl}
                onClick={() => void runComposeAction('up')}>
                Start
              </Button>
              <Button
                type="button"
                icon={runningAction === 'restart' ? 'i-material-symbols-progress-activity' : 'i-material-symbols-refresh-rounded'}
                disabled={!canControl}
                onClick={() => void runComposeAction('restart')}>
                Restart
              </Button>
              <Button
                type="button"
                icon={runningAction === 'stop' ? 'i-material-symbols-progress-activity' : 'i-material-symbols-stop-rounded'}
                disabled={!canControl}
                onClick={() => void runComposeAction('stop')}>
                Stop
              </Button>
              <Button
                type="button"
                tone="danger"
                icon={runningAction === 'down' ? 'i-material-symbols-progress-activity' : 'i-material-symbols-power-settings-new-rounded'}
                disabled={!canControl}
                onClick={() => void runComposeAction('down')}>
                Down
              </Button>
            </div>
          </div>
        </Surface>

        <Surface className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-800">Logs</div>
              <div className="text-xs text-gray-500">docker compose logs</div>
            </div>
            <IconButton
              icon={isLoadingLogs ? 'i-material-symbols-progress-activity' : 'i-material-symbols-terminal-rounded'}
              title="Load logs"
              disabled={!host || isLoadingLogs}
              onClick={() => void loadComposeLogs()}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <FieldLabel>Service</FieldLabel>
              <select
                className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                value={logService}
                onChange={event => setLogService(event.target.value)}>
                <option value="">All services</option>
                {serviceOptions.map(service => <option key={service} value={service}>{service}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2">
                <FieldLabel>Tail</FieldLabel>
                <input
                  className="h-9 w-full rounded-lg border-(solid 1px gray-300) bg-white/80 px-3 text-sm outline-none focus:border-emerald-600"
                  type="number"
                  min={1}
                  max={5000}
                  value={logTail}
                  onChange={event => setLogTail(Math.max(1, Number(event.target.value) || 1))}
                />
              </div>
              <label className="mt-6 flex h-9 items-center gap-2 rounded-lg bg-white/65 px-3 text-sm text-gray-700">
                <input type="checkbox" checked={logTimestamps} onChange={event => setLogTimestamps(event.target.checked)} />
                <span>Time</span>
              </label>
            </div>
          </div>
        </Surface>
      </div>

      <div className="space-y-4">
        <Surface className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
            <div>
              <div className="font-800">Runtime status</div>
              <div className="text-xs text-gray-500">{composeStatus?.file || selectedFile || '/data/rmf_data/docker-rmf-compose.yaml'}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={getComposeStatusClass(composeStatus?.status || 'unknown')}>
                {composeStatus?.status || 'unknown'}
              </Badge>
              <Button
                type="button"
                icon={isLoadingStatus ? 'i-material-symbols-progress-activity' : 'i-material-symbols-refresh-rounded'}
                disabled={!host || isLoadingStatus}
                onClick={() => void refreshComposeStatus()}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-xs font-700 text-gray-500">Services</div>
              <div className="mt-1 text-6 font-800">{composeStatus?.total ?? '--'}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-xs font-700 text-gray-500">Running</div>
              <div className="mt-1 text-6 font-800 text-emerald-700">{composeStatus?.running_count ?? '--'}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-xs font-700 text-gray-500">Return code</div>
              <div className="mt-1 text-6 font-800">{composeStatus?.returncode ?? '--'}</div>
            </div>
          </div>

          <div className="overflow-x-auto border-(t-solid 1px gray-200)">
            {composeStatus?.services.length
              ? (
                  <table className="w-full min-w-[52rem] text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-700 uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-2">Service</th>
                        <th className="px-4 py-2">State</th>
                        <th className="px-4 py-2">Health</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Image</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {composeStatus.services.map(service => (
                        <tr key={service.id || `${service.project}:${service.service}:${service.name}`}>
                          <td className="max-w-[14rem] px-4 py-3">
                            <div className="truncate font-800 text-gray-900">{getComposeServiceName(service)}</div>
                            <div className="truncate text-xs text-gray-500">{service.name || service.id || '--'}</div>
                          </td>
                          <td className="px-4 py-3"><Badge className={getComposeStatusClass(service.state || 'unknown')}>{service.state || '--'}</Badge></td>
                          <td className="px-4 py-3"><Badge className={getComposeStatusClass(service.health || 'unknown')}>{service.health || '--'}</Badge></td>
                          <td className="max-w-[18rem] px-4 py-3 text-xs text-gray-600"><div className="truncate">{service.status || '--'}</div></td>
                          <td className="max-w-[18rem] px-4 py-3 text-xs text-gray-600"><div className="truncate">{service.image || '--'}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              : (
                  <div className="px-4 py-10 text-center text-sm text-gray-500">
                    {isLoadingStatus ? 'Loading compose status...' : 'No compose services'}
                  </div>
                )}
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
            <div>
              <div className="font-800">Last command</div>
              <div className="text-xs text-gray-500">{lastCommandAt ? formatTime(lastCommandAt) : 'No command run'}</div>
            </div>
            {lastCommand?.returncode !== undefined && <Badge className={lastCommand.returncode === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}>exit {lastCommand.returncode}</Badge>}
          </div>
          <div className="p-4">
            {lastCommand?.command && <div className="mb-2 break-all font-mono text-xs text-gray-500">{lastCommand.command}</div>}
            <pre className="max-h-[16rem] overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-[11px] leading-5 text-zinc-100">
              {commandOutput || 'No output'}
            </pre>
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
            <div>
              <div className="font-800">Recent logs</div>
              <div className="text-xs text-gray-500">{logService || 'All services'} · tail {logTail}</div>
            </div>
            <Button
              type="button"
              icon={isLoadingLogs ? 'i-material-symbols-progress-activity' : 'i-material-symbols-terminal-rounded'}
              disabled={!host || isLoadingLogs}
              onClick={() => void loadComposeLogs()}>
              Load logs
            </Button>
          </div>
          <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap bg-zinc-950 p-4 text-[11px] leading-5 text-zinc-100">
            {composeLogs || (isLoadingLogs ? 'Loading logs...' : 'No logs loaded')}
          </pre>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
            <div>
              <div className="font-800">Resolved config</div>
              <div className="text-xs text-gray-500">docker compose config</div>
            </div>
            <Button
              type="button"
              icon={isLoadingConfig ? 'i-material-symbols-progress-activity' : 'i-material-symbols-description-outline-rounded'}
              disabled={!host || isLoadingConfig}
              onClick={() => void loadComposeConfig()}>
              Load config
            </Button>
          </div>
          <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap bg-gray-950 p-4 text-[11px] leading-5 text-gray-100">
            {composeConfig || (isLoadingConfig ? 'Loading config...' : 'No config loaded')}
          </pre>
        </Surface>
      </div>
    </div>
  )
}

function SitesPage({
  sites,
  selectedSite,
  setSelectedSite,
  refreshSites,
  isLoadingSites,
  siteError,
  fleetSiteConfig,
  siteNameDraft,
  setSiteNameDraft,
  isLoadingFleetSiteConfig,
  isSavingFleetSiteConfig,
  fleetSiteConfigError,
  fleetSiteConfigStatus,
  isSiteNameDirty,
  reloadFleetSiteConfig,
  dryRunFleetSiteConfig,
  saveFleetSiteConfig,
  fleetConfig,
  fleetConfigDraft,
  setFleetConfigDraft,
  isLoadingFleetConfig,
  isSavingFleetConfig,
  fleetConfigError,
  fleetConfigStatus,
  isFleetConfigDirty,
  reloadFleetConfig,
  dryRunFleetConfig,
  saveFleetConfig,
}: {
  sites: ManagedSite[]
  selectedSite: string
  setSelectedSite: (site: string) => void
  refreshSites: () => void
  isLoadingSites: boolean
  siteError: string | null
  fleetSiteConfig: FleetConfigNamespaceData | null
  siteNameDraft: string
  setSiteNameDraft: (value: string) => void
  isLoadingFleetSiteConfig: boolean
  isSavingFleetSiteConfig: boolean
  fleetSiteConfigError: string | null
  fleetSiteConfigStatus: string | null
  isSiteNameDirty: boolean
  reloadFleetSiteConfig: () => void
  dryRunFleetSiteConfig: () => void
  saveFleetSiteConfig: () => void
  fleetConfig: FleetConfigResponse | null
  fleetConfigDraft: string
  setFleetConfigDraft: (value: string) => void
  isLoadingFleetConfig: boolean
  isSavingFleetConfig: boolean
  fleetConfigError: string | null
  fleetConfigStatus: string | null
  isFleetConfigDirty: boolean
  reloadFleetConfig: () => void
  dryRunFleetConfig: () => void
  saveFleetConfig: () => void
}) {
  const activeSite = sites.find(site => site.site === selectedSite) ?? sites[0]
  const normalizedSiteNameDraft = normalizeFleetSiteName(siteNameDraft)
  const siteNameActionDisabled = !normalizedSiteNameDraft || isLoadingFleetSiteConfig || isSavingFleetSiteConfig

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[18rem_1fr]">
      <div className="space-y-4">
        <Surface className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-4 font-800">Sites</div>
              <div className="text-xs text-gray-500">Compose control /api/maps/sites</div>
            </div>
            <IconButton
              icon="i-material-symbols-refresh-rounded"
              title="Refresh sites"
              disabled={isLoadingSites}
              onClick={refreshSites}
            />
          </div>
          {siteError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{siteError}</div>}
          <div className="space-y-2">
            {sites.length > 0
              ? sites.map(site => (
                  <button
                    key={site.site}
                    type="button"
                    className={classNames(
                      'w-full rounded-lg border px-3 py-2 text-left transition',
                      activeSite?.site === site.site
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-gray-200 bg-white/70 hover:bg-white',
                    )}
                    onClick={() => setSelectedSite(site.site)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-800 text-gray-900">{site.site}</span>
                      <Badge className="bg-white text-gray-700">{site.fileCount}</Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                      <span>{formatBytes(site.totalBytes)}</span>
                      <span>{site.robotCount} robots</span>
                    </div>
                  </button>
                ))
              : (
                  <div className="rounded-lg border-(solid 1px gray-200) bg-white/70 px-3 py-8 text-center text-sm text-gray-500">
                    {isLoadingSites ? 'Loading sites...' : 'No sites'}
                  </div>
                )}
          </div>
        </Surface>
      </div>

      <div className="space-y-4">
        <Surface className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-4 font-800">Current Site Name</div>
              <div className="text-xs text-gray-500">{fleetSiteConfig?.path || '/data/rmf_data/params/rmf.yaml'}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {fleetSiteConfigStatus && <span className="text-xs font-700 text-emerald-700">{fleetSiteConfigStatus}</span>}
              {fleetSiteConfigError && <span className="text-xs font-700 text-red-700">{fleetSiteConfigError}</span>}
              <IconButton
                icon="i-material-symbols-refresh-rounded"
                title="Reload site name"
                disabled={isLoadingFleetSiteConfig || isSavingFleetSiteConfig}
                onClick={reloadFleetSiteConfig}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <FieldLabel>Site name</FieldLabel>
              <input
                value={siteNameDraft}
                disabled={isLoadingFleetSiteConfig || isSavingFleetSiteConfig}
                placeholder="zhencang_office"
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white/80 px-3 text-sm font-700 outline-none transition focus:border-emerald-400"
                onChange={event => setSiteNameDraft(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>Current: {fleetSiteConfig?.namespace || fleetSiteConfig?.site_id || '--'}</span>
                <span>ROS: {formatRosNamespace(siteNameDraft)}</span>
                {fleetSiteConfig?.valid === false && (
                  <span className="font-700 text-red-700">{fleetSiteConfig.validation_error || 'Invalid site name'}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                icon="i-material-symbols-content-copy-outline-rounded"
                disabled={!activeSite || isLoadingFleetSiteConfig || isSavingFleetSiteConfig}
                onClick={() => activeSite && setSiteNameDraft(activeSite.site)}>
                Use selected
              </Button>
              <Button
                type="button"
                icon="i-material-symbols-fact-check-outline-rounded"
                disabled={siteNameActionDisabled}
                onClick={dryRunFleetSiteConfig}>
                Dry run
              </Button>
              <Button
                type="button"
                tone="primary"
                icon="i-material-symbols-save-outline-rounded"
                disabled={!isSiteNameDirty || siteNameActionDisabled}
                onClick={saveFleetSiteConfig}>
                Save
              </Button>
            </div>
          </div>
        </Surface>

        <Surface className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-5 font-800">{activeSite?.site || 'No site selected'}</div>
              <div className="text-xs text-gray-500">
                {activeSite ? `${activeSite.fileCount} files · ${formatBytes(activeSite.totalBytes)} · updated ${formatTime(activeSite.modifiedTime)}` : '--'}
              </div>
            </div>
            <Badge className="bg-blue-50 text-blue-700">{activeSite?.robotCount ?? 0} robots</Badge>
          </div>

          {activeSite && (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {activeSite.files.map(file => (
                <div key={file.id} className="rounded-lg border-(solid 1px gray-200) bg-white/75 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-800 text-gray-900">{file.name}</div>
                      <div className="truncate text-xs text-gray-500">{getSiteFileDisplayName(file)}</div>
                    </div>
                    <Badge className="bg-gray-100 text-gray-700">{file.fileType}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>{formatBytes(file.size)}</span>
                    <span>{formatTime(file.updatedAt)}</span>
                    <span>{file.robotCount} robots</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-(b-solid 1px gray-200) px-4 py-3">
            <div>
              <div className="font-800">rmf.yaml</div>
              <div className="text-xs text-gray-500">{fleetConfig?.path || '/data/rmf_data/params/rmf.yaml'}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {fleetConfigStatus && <span className="text-xs font-700 text-emerald-700">{fleetConfigStatus}</span>}
              {fleetConfigError && <span className="text-xs font-700 text-red-700">{fleetConfigError}</span>}
              <Button
                type="button"
                icon="i-material-symbols-refresh-rounded"
                disabled={isLoadingFleetConfig || isSavingFleetConfig}
                onClick={reloadFleetConfig}>
                Reload
              </Button>
              <Button
                type="button"
                icon="i-material-symbols-fact-check-outline-rounded"
                disabled={!fleetConfigDraft.trim() || isLoadingFleetConfig || isSavingFleetConfig}
                onClick={dryRunFleetConfig}>
                Dry run
              </Button>
              <Button
                type="button"
                tone="primary"
                icon="i-material-symbols-save-outline-rounded"
                disabled={!isFleetConfigDirty || !fleetConfigDraft.trim() || isLoadingFleetConfig || isSavingFleetConfig}
                onClick={saveFleetConfig}>
                Save
              </Button>
            </div>
          </div>

          <RmfYamlStructuredEditor
            content={fleetConfigDraft}
            onChange={setFleetConfigDraft}
            isLoading={isLoadingFleetConfig}
          />
        </Surface>
      </div>
    </div>
  )
}

const FleetView: React.FC = () => {
  const fleet = useFleetDataZenoh()
  const buildingMap = useBuildingMapZenoh()
  const fleetSiteNamespace = useFleetSiteNamespace()
  const fleetDataKey = prefixFleetSiteTopic(fleetSiteNamespace.namespace, fleetDataTopic)
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const changeNestController = useParamsStore(state => state.changeNestController)
  const robots = fleet.data?.robots ?? []
  const pendingRobots = fleet.data?.pendingRobots ?? []
  const allRobots = useMemo(() => [...robots, ...pendingRobots], [robots, pendingRobots])
  const dido = useFleetDidoZenoh(allRobots)
  const wheelStates = useFleetWheelStatesZenoh(allRobots)
  const hardwareDiagnostics = useFleetHardwareDiagnosticsZenoh(allRobots)
  const bonds = useFleetBondsZenoh(allRobots)
  const rmfStates = useFleetRmfStatesZenoh()
  const robotOptions = useMemo(() => allRobots.map(getRobotName).filter(name => name !== '--'), [allRobots])
  const [activePage, setActivePage] = useState<FleetPage>('dashboard')
  const [robotSearch, setRobotSearch] = useState('')
  const [selectedRobotId, setSelectedRobotId] = useState('')
  const [isJoystickOpen, setIsJoystickOpen] = useState(false)
  const [tasks, setTasks] = useState<FleetTask[]>([])
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => ({
    title: 'New fleet task',
    robot: '',
    map: '',
    scheduleAt: formatDateTimeInput(new Date(Date.now() + 15 * 60000)),
    priority: 'normal',
  }))
  const [storageAreas, setStorageAreas] = useState<StorageArea[]>(defaultStorageAreas)
  const [storageDraft, setStorageDraft] = useState<StorageDraft>({
    name: 'New storage area',
    map: '',
    capacity: 10,
  })
  const [siteFiles, setSiteFiles] = useState<ManagedSiteFile[]>([])
  const [selectedSite, setSelectedSite] = useState('')
  const [isLoadingSites, setIsLoadingSites] = useState(false)
  const [siteListError, setSiteListError] = useState<string | null>(null)
  const [fleetConfig, setFleetConfig] = useState<FleetConfigResponse | null>(null)
  const [fleetConfigDraft, setFleetConfigDraft] = useState('')
  const [isLoadingFleetConfig, setIsLoadingFleetConfig] = useState(false)
  const [isSavingFleetConfig, setIsSavingFleetConfig] = useState(false)
  const [fleetConfigError, setFleetConfigError] = useState<string | null>(null)
  const [fleetConfigStatus, setFleetConfigStatus] = useState<string | null>(null)
  const [fleetSiteConfig, setFleetSiteConfig] = useState<FleetConfigNamespaceData | null>(null)
  const [siteNameDraft, setSiteNameDraft] = useState('')
  const [isLoadingFleetSiteConfig, setIsLoadingFleetSiteConfig] = useState(false)
  const [isSavingFleetSiteConfig, setIsSavingFleetSiteConfig] = useState(false)
  const [fleetSiteConfigError, setFleetSiteConfigError] = useState<string | null>(null)
  const [fleetSiteConfigStatus, setFleetSiteConfigStatus] = useState<string | null>(null)
  const mapOptions = useMemo(() => {
    const options = siteFiles
      .filter(file => file.status !== 'archived')
      .map(getSiteFileOptionName)
      .filter(Boolean)

    return Array.from(new Set(options))
  }, [siteFiles])
  const managedSites = useMemo<ManagedSite[]>(() => {
    const grouped = new Map<string, ManagedSiteFile[]>()
    for (const file of siteFiles) {
      const list = grouped.get(file.site) ?? []
      list.push(file)
      grouped.set(file.site, list)
    }

    return Array.from(grouped.entries()).map(([site, files]) => ({
      site,
      files,
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      modifiedTime: Math.max(...files.map(file => file.updatedAt)),
      robotCount: countRobotsForManagedSiteFile({
        id: `site:${site}`,
        name: site,
        site,
        path: site,
        fileType: 'site',
        size: 0,
        status: 'active',
        robotCount: 0,
        source: 'compose_control',
        updatedAt: 0,
      }, allRobots),
    })).sort((a, b) => a.site.localeCompare(b.site))
  }, [siteFiles, allRobots])
  const isFleetConfigDirty = fleetConfig != null && fleetConfigDraft !== fleetConfig.content
  const isSiteNameDirty = fleetSiteConfig != null && normalizeFleetSiteName(siteNameDraft) !== normalizeFleetSiteName(fleetSiteConfig.namespace || fleetSiteConfig.site_id || '')
  const faultedMotorCount = allRobots.reduce((sum, robot) => (
    sum + (robot.hasWheelState ? robot.wheels.motors.filter(motor => motor.isFaulted).length : 0)
  ), 0)
  const activeTaskCount = tasks.filter(task => task.status === 'active').length
  const occupiedStorageCount = rmfStates.storageState?.withStock ?? storageAreas.reduce((sum, area) => sum + area.occupied, 0)
  const storageUseLabel = rmfStates.storageState ? `${rmfStates.storageState.withStock}/${rmfStates.storageState.total}` : `${occupiedStorageCount}`

  async function loadComposeSites() {
    if (!nestControllerIp)
      return

    setIsLoadingSites(true)
    setSiteListError(null)
    try {
      const sites = await apiServer.fetchComposeMapSitesWithFiles()
      setSiteFiles((current) => {
        const localFiles = current.filter(file => file.source === 'local')
        const existingStatusById = new Map(current.map(file => [file.id, file.status]))
        const composeFiles = sites.flatMap((site: ComposeMapSiteWithFiles) => site.files.map((file) => {
          const id = `compose:${site.site}:${file.path}`
          return {
            id,
            name: file.path,
            site: site.site,
            path: file.path,
            fileType: file.type,
            size: file.size,
            status: existingStatusById.get(id) ?? 'standby',
            robotCount: 0,
            source: 'compose_control',
            updatedAt: file.modified_time * 1000,
          } satisfies ManagedSiteFile
        }))

        if (!composeFiles.some(file => file.status === 'active') && composeFiles.length > 0)
          composeFiles[0] = { ...composeFiles[0], status: 'active' }

        return [...composeFiles, ...localFiles]
      })
      setSelectedSite(current => current || sites[0]?.site || '')
    }
    catch (error) {
      setSiteListError(`${error}`)
    }
    finally {
      setIsLoadingSites(false)
    }
  }

  useEffect(() => {
    void loadComposeSites()
    void loadFleetSiteConfig()
    void loadFleetConfig()
  }, [nestControllerIp])

  useEffect(() => {
    setSiteFiles((current) => {
      let changed = false
      const next = current.map((file) => {
        const robotCount = countRobotsForManagedSiteFile(file, allRobots)
        if (robotCount === file.robotCount)
          return file

        changed = true
        return { ...file, robotCount }
      })

      return changed ? next : current
    })
  }, [allRobots])

  useEffect(() => {
    if (mapOptions.length === 0)
      return

    setStorageDraft(current => mapOptions.includes(current.map) ? current : { ...current, map: mapOptions[0] })
    setTaskDraft(current => mapOptions.includes(current.map) ? current : { ...current, map: mapOptions[0] })
  }, [mapOptions])

  useEffect(() => {
    if (managedSites.length === 0)
      return
    if (!managedSites.some(site => site.site === selectedSite))
      setSelectedSite(managedSites[0].site)
  }, [managedSites, selectedSite])

  useEffect(() => {
    if (allRobots.length === 0) {
      if (selectedRobotId)
        setSelectedRobotId('')
      return
    }

    if (!allRobots.some(robot => getRobotName(robot) === selectedRobotId))
      setSelectedRobotId(getRobotName(allRobots[0]))
  }, [allRobots, selectedRobotId])

  async function loadFleetSiteConfig() {
    if (!nestControllerIp) {
      setFleetSiteConfig(null)
      setSiteNameDraft('')
      setFleetSiteConfigError(null)
      setFleetSiteConfigStatus(null)
      return
    }

    setIsLoadingFleetSiteConfig(true)
    setFleetSiteConfigError(null)
    setFleetSiteConfigStatus(null)
    try {
      const response = await apiServer.fetchFleetConfigNamespace()
      setFleetSiteConfig(response.data)
      setSiteNameDraft(response.data.namespace || response.data.site_id || '')
      setFleetSiteConfigStatus('Loaded')
    }
    catch (error) {
      setFleetSiteConfigError(errorMessage(error))
    }
    finally {
      setIsLoadingFleetSiteConfig(false)
    }
  }

  function applyFleetSiteConfigWrite(response: { data: FleetConfigNamespaceData }) {
    setFleetSiteConfig(response.data)
    setSiteNameDraft(response.data.namespace || response.data.site_id || '')
  }

  async function dryRunFleetSiteConfig() {
    const namespace = normalizeFleetSiteName(siteNameDraft)
    if (!namespace)
      return

    setIsSavingFleetSiteConfig(true)
    setFleetSiteConfigError(null)
    setFleetSiteConfigStatus(null)
    try {
      await apiServer.updateFleetConfigNamespace(namespace, fleetSiteConfig?.modified_time, true)
      setFleetSiteConfigStatus('Dry run passed')
    }
    catch (error) {
      setFleetSiteConfigError(errorMessage(error))
    }
    finally {
      setIsSavingFleetSiteConfig(false)
    }
  }

  async function saveFleetSiteConfig() {
    const namespace = normalizeFleetSiteName(siteNameDraft)
    if (!namespace)
      return

    setIsSavingFleetSiteConfig(true)
    setFleetSiteConfigError(null)
    setFleetSiteConfigStatus(null)
    try {
      const response = await apiServer.updateFleetConfigNamespace(namespace, fleetSiteConfig?.modified_time, false)
      applyFleetSiteConfigWrite(response)
      notifyFleetSiteNamespaceUpdated(response.data.namespace || response.data.site_id || namespace)
      setFleetSiteConfigStatus(response.data.backup_path ? 'Saved, backup created' : 'Saved')
      if (!isFleetConfigDirty)
        void loadFleetConfig()
      else
        setFleetConfigStatus('Site name saved; reload rmf.yaml to sync')
    }
    catch (error) {
      setFleetSiteConfigError(errorMessage(error))
    }
    finally {
      setIsSavingFleetSiteConfig(false)
    }
  }

  async function loadFleetConfig() {
    if (!nestControllerIp)
      return

    setIsLoadingFleetConfig(true)
    setFleetConfigError(null)
    setFleetConfigStatus(null)
    try {
      const config = await apiServer.fetchFleetConfig()
      setFleetConfig(config)
      setFleetConfigDraft(config.content)
      setFleetConfigStatus('Loaded')
    }
    catch (error) {
      setFleetConfigError(`${error}`)
    }
    finally {
      setIsLoadingFleetConfig(false)
    }
  }

  function applyFleetConfigWrite(response: FleetConfigWriteResponse) {
    setFleetConfig(current => ({
      ok: true,
      path: response.path,
      size: response.size,
      modified_time: response.modified_time,
      content: fleetConfigDraft,
      error: current?.error,
    }))
  }

  async function dryRunFleetConfig() {
    setIsSavingFleetConfig(true)
    setFleetConfigError(null)
    setFleetConfigStatus(null)
    try {
      await apiServer.updateFleetConfig(fleetConfigDraft, fleetConfig?.modified_time, true)
      setFleetConfigStatus('Dry run passed')
    }
    catch (error) {
      setFleetConfigError(`${error}`)
    }
    finally {
      setIsSavingFleetConfig(false)
    }
  }

  async function saveFleetConfig() {
    setIsSavingFleetConfig(true)
    setFleetConfigError(null)
    setFleetConfigStatus(null)
    try {
      const response = await apiServer.updateFleetConfig(fleetConfigDraft, fleetConfig?.modified_time, false)
      applyFleetConfigWrite(response)
      setFleetConfigStatus(response.backup_path ? `Saved, backup created` : 'Saved')
    }
    catch (error) {
      setFleetConfigError(`${error}`)
    }
    finally {
      setIsSavingFleetConfig(false)
    }
  }

  function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = taskDraft.title.trim()
    if (!title)
      return

    const task: FleetTask = {
      id: createId('task'),
      title,
      robot: taskDraft.robot,
      map: taskDraft.map || mapOptions[0] || '',
      scheduleAt: taskDraft.scheduleAt,
      priority: taskDraft.priority,
      status: taskDraft.scheduleAt ? 'scheduled' : 'draft',
      createdAt: Date.now(),
    }

    setTasks(current => [task, ...current])
    setTaskDraft(current => ({
      ...current,
      title: 'New fleet task',
      scheduleAt: formatDateTimeInput(new Date(Date.now() + 15 * 60000)),
    }))
  }

  function updateTaskStatus(id: string, status: FleetTaskStatus) {
    setTasks(current => current.map(task => task.id === id ? { ...task, status } : task))
  }

  function updateTaskSchedule(id: string, scheduleAt: string) {
    setTasks(current => current.map(task => task.id === id
      ? { ...task, scheduleAt, status: task.status === 'done' ? task.status : 'scheduled' }
      : task,
    ))
  }

  function deleteTask(id: string) {
    setTasks(current => current.filter(task => task.id !== id))
  }

  function createStorageArea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = storageDraft.name.trim()
    if (!name)
      return

    setStorageAreas(current => [
      {
        id: createId('storage'),
        name,
        map: storageDraft.map || mapOptions[0] || '',
        capacity: Math.max(1, storageDraft.capacity),
        occupied: 0,
        status: 'available',
      },
      ...current,
    ])
    setStorageDraft(current => ({ ...current, name: 'New storage area' }))
  }

  function updateStorageArea(id: string, patch: Partial<StorageArea>) {
    setStorageAreas(current => current.map((area) => {
      if (area.id !== id)
        return area

      const next = { ...area, ...patch }
      next.capacity = Math.max(1, next.capacity)
      next.occupied = Math.max(0, Math.min(next.capacity, next.occupied))
      return next
    }))
  }

  function deleteStorageArea(id: string) {
    setStorageAreas(current => current.filter(area => area.id !== id))
  }

  function renderActivePage() {
    if (activePage === 'dashboard') {
      return (
        <DashboardPage
          buildingMap={buildingMap.data}
          host={nestControllerIp}
          mapStatus={buildingMap.status}
          mapConnected={buildingMap.connected}
          mapUpdatedAt={buildingMap.updatedAt}
          mapError={buildingMap.error}
          rmfStates={rmfStates}
          robots={allRobots}
        />
      )
    }

    if (activePage === 'tasks') {
      return (
        <TasksPage
          tasks={tasks}
          taskDraft={taskDraft}
          setTaskDraft={setTaskDraft}
          createTask={createTask}
          updateTaskStatus={updateTaskStatus}
          updateTaskSchedule={updateTaskSchedule}
          deleteTask={deleteTask}
          robotOptions={robotOptions}
          mapOptions={mapOptions}
          buildingMap={buildingMap.data}
          fleetName={fleet.data?.name || ''}
        />
      )
    }

    if (activePage === 'storage') {
      return (
        <StoragePage
          areas={storageAreas}
          storageDraft={storageDraft}
          setStorageDraft={setStorageDraft}
          createStorageArea={createStorageArea}
          updateStorageArea={updateStorageArea}
          deleteStorageArea={deleteStorageArea}
          mapOptions={mapOptions}
          storageState={rmfStates.storageState}
          storageStatus={rmfStates.storageState ? 'subscribed' : rmfStates.status}
          storageError={rmfStates.error}
          storageUpdatedAt={rmfStates.storageUpdatedAt}
          buildingMap={buildingMap.data}
          host={nestControllerIp}
        />
      )
    }

    if (activePage === 'sites') {
      return (
        <SitesPage
          sites={managedSites}
          selectedSite={selectedSite}
          setSelectedSite={setSelectedSite}
          refreshSites={() => void loadComposeSites()}
          isLoadingSites={isLoadingSites}
          siteError={siteListError}
          fleetSiteConfig={fleetSiteConfig}
          siteNameDraft={siteNameDraft}
          setSiteNameDraft={setSiteNameDraft}
          isLoadingFleetSiteConfig={isLoadingFleetSiteConfig}
          isSavingFleetSiteConfig={isSavingFleetSiteConfig}
          fleetSiteConfigError={fleetSiteConfigError}
          fleetSiteConfigStatus={fleetSiteConfigStatus}
          isSiteNameDirty={isSiteNameDirty}
          reloadFleetSiteConfig={() => void loadFleetSiteConfig()}
          dryRunFleetSiteConfig={() => void dryRunFleetSiteConfig()}
          saveFleetSiteConfig={() => void saveFleetSiteConfig()}
          fleetConfig={fleetConfig}
          fleetConfigDraft={fleetConfigDraft}
          setFleetConfigDraft={setFleetConfigDraft}
          isLoadingFleetConfig={isLoadingFleetConfig}
          isSavingFleetConfig={isSavingFleetConfig}
          fleetConfigError={fleetConfigError}
          fleetConfigStatus={fleetConfigStatus}
          isFleetConfigDirty={isFleetConfigDirty}
          reloadFleetConfig={() => void loadFleetConfig()}
          dryRunFleetConfig={() => void dryRunFleetConfig()}
          saveFleetConfig={() => void saveFleetConfig()}
        />
      )
    }

    if (activePage === 'compose')
      return <ComposeControlPage host={nestControllerIp} />

    return (
      <RobotsPage
        robots={robots}
        pendingRobots={pendingRobots}
        search={robotSearch}
        setSearch={setRobotSearch}
        fleetName={fleet.data?.name || ''}
        fleetType={fleet.data?.fleetType || ''}
        error={fleet.error}
        dido={dido}
        wheelStates={wheelStates}
        hardwareDiagnostics={hardwareDiagnostics}
        bonds={bonds}
        host={nestControllerIp}
        selectedRobotId={selectedRobotId}
        setSelectedRobotId={setSelectedRobotId}
      />
    )
  }

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900">
      <header className="sticky top-0 z-30 flex items-center justify-between border-(b-solid 1px white/70) bg-white/70 px-5 py-3 backdrop-blur-xl">
        <div>
          <div className="text-5 font-800">Fleet</div>
          <div className="text-xs text-gray-500">Controller {nestControllerIp || '--'}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <div className={fleet.connected ? 'font-700 text-emerald-700' : 'font-700 text-gray-500'}>
              {formatStatus(fleet.status, fleet.connected)}
            </div>
            <div className="text-xs text-gray-500">{fleet.key || fleetDataKey || fleetDataTopic}</div>
          </div>
          <Button
            type="button"
            icon="i-material-symbols-swap-horiz-rounded"
            onClick={changeNestController}>
            Change controller
          </Button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-65px)] grid-cols-1 lg:grid-cols-[12rem_1fr]">
        <aside className="sticky top-[65px] flex h-[calc(100vh-65px)] flex-col overflow-y-auto border-(r-solid 1px white/70) bg-white/55 p-3 backdrop-blur-xl">
          <nav className="space-y-1">
            {fleetPages.map(item => (
              <button
                key={item.id}
                type="button"
                className={classNames(
                  'h-11 w-full flex items-center gap-2 rounded-lg px-2.5 text-left text-sm font-700 transition',
                  activePage === item.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:bg-white/65 hover:text-gray-900',
                )}
                onClick={() => setActivePage(item.id)}>
                <span className={`${item.icon} text-5`} />
                <span>{item.label}</span>
                {item.id === 'tasks' && tasks.length > 0 && (
                  <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{tasks.length}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-5 space-y-3">
            <Surface className="p-3">
              <div className="text-xs text-gray-500">Robots</div>
              <div className="mt-1 text-6 font-800">{robots.length}</div>
            </Surface>
            <Surface className="p-3">
              <div className="text-xs text-gray-500">Active tasks</div>
              <div className="mt-1 text-6 font-800">{activeTaskCount}</div>
            </Surface>
            <Surface className="p-3">
              <div className="text-xs text-gray-500">Storage use</div>
              <div className="mt-1 text-6 font-800">{storageUseLabel}</div>
            </Surface>
          </div>

          <div className="sticky bottom-0 z-40 mt-auto bg-white/55 pt-3 backdrop-blur-xl">
            {isJoystickOpen && (
              <div className="mb-2">
                <FleetJoystickPopup
                  robots={allRobots}
                  dido={dido}
                  host={nestControllerIp}
                  onClose={() => setIsJoystickOpen(false)}
                />
              </div>
            )}
            <Button
              className="w-full"
              icon="i-material-symbols-gamepad-rounded"
              disabled={!nestControllerIp || allRobots.length === 0}
              onClick={() => setIsJoystickOpen(current => !current)}
            >
              Joystick
            </Button>
          </div>
        </aside>

        <section className="min-w-0 p-5">
          <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Surface className="p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">Robots</div>
                <span className="i-material-symbols-smart-toy-outline-rounded text-5 text-gray-400" />
              </div>
              <div className="mt-1 text-6 font-800">{robots.length}</div>
              <div className="text-xs text-gray-500">{pendingRobots.length} pending</div>
            </Surface>
            <Surface className="p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">Tasks</div>
                <span className="i-material-symbols-task-alt-rounded text-5 text-gray-400" />
              </div>
              <div className="mt-1 text-6 font-800">{tasks.length}</div>
              <div className="text-xs text-gray-500">{activeTaskCount} active</div>
            </Surface>
            <Surface className="p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">Motor faults</div>
                <span className="i-material-symbols-warning-outline-rounded text-5 text-gray-400" />
              </div>
              <div className={`mt-1 text-6 font-800 ${faultedMotorCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{faultedMotorCount}</div>
              <div className="text-xs text-gray-500">wheel motors</div>
            </Surface>
            <Surface className="p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">Updated</div>
                <span className="i-material-symbols-update-rounded text-5 text-gray-400" />
              </div>
              <div className="mt-1 text-5 font-800">{formatTime(fleet.updatedAt)}</div>
              {fleet.data && <div className="text-xs text-gray-500">seq {formatInteger(fleet.data.seq)}</div>}
            </Surface>
          </div>

          {renderActivePage()}
        </section>
      </div>
      <Toaster />
    </main>
  )
}

export default FleetView
