import React, { useEffect, useMemo, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { buildRobotHardwareDiagnosticsView } from './runtimeModel'
import type { FleetHardwareDiagnosticState, FleetRobotHardwareDiagnosticsState } from './runtimeModel'
import { useBuildingMapZenoh, useFleetDataZenoh, useFleetDidoZenoh, useFleetHardwareDiagnosticsZenoh, useInterval } from '@/hooks'
import apiServer from '@/service/apiServer'
import { useParamsStore } from '@/store'
import type { BuildingMapGraphMessage, BuildingMapImageMessage, BuildingMapLevelMessage, BuildingMapMessage, FleetRobotDataMessage, TwistCommand } from '@/types'
import type { ComposeMapSiteWithFiles, FleetConfigResponse, FleetConfigWriteResponse } from '@/service/apiServer'
import type { DidoValue, FleetDidoZenohState, RobotDidoValues } from '@/hooks/useFleetDidoZenoh'
import type { FleetHardwareDiagnosticsZenohState, HardwareDiagnosticsValue } from '@/hooks/useFleetHardwareDiagnosticsZenoh'

type FleetPage = 'dashboard' | 'robots' | 'tasks' | 'storage' | 'sites'
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
]

const defaultStorageAreas: StorageArea[] = []
const digitalOutputAddressBase = 800

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

function getStorageStatusClass(status: StorageStatus) {
  const classes: Record<StorageStatus, string> = {
    available: 'bg-emerald-50 text-emerald-700',
    reserved: 'bg-blue-50 text-blue-700',
    occupied: 'bg-amber-50 text-amber-700',
    blocked: 'bg-red-50 text-red-700',
  }
  return classes[status]
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

function isChargerVertex(vertex: { name: string, params: Array<{ name: string, valueBool: boolean, valueString?: string }> }) {
  return vertex.params.some(param => param.name === 'is_charger' && param.valueBool)
    || /^c\d+$/i.test(vertex.name)
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

function DashboardPage({
  buildingMap,
  mapStatus,
  mapConnected,
  mapUpdatedAt,
  mapError,
  robots,
}: {
  buildingMap: BuildingMapMessage | null
  mapStatus: string
  mapConnected: boolean
  mapUpdatedAt: number | null
  mapError: string | null
  robots: FleetRobotDataMessage[]
}) {
  const [selectedLevelName, setSelectedLevelName] = useState('')
  const [selectedGraphName, setSelectedGraphName] = useState('')
  const [selectedRobotKey, setSelectedRobotKey] = useState('')
  const [selectedWaypointKey, setSelectedWaypointKey] = useState('')
  const [hoveredWaypointKey, setHoveredWaypointKey] = useState('')
  const [mapZoom, setMapZoom] = useState(1)
  const [layers, setLayers] = useState({
    images: true,
    nav: true,
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
    selectedGraph?.vertices.map((vertex, index) => ({ vertex, index, key: `${index}:${vertex.name}` })) ?? []
  ), [selectedGraph])
  const selectedWaypointItem = graphWaypoints.find(item => item.key === selectedWaypointKey) ?? null
  const selectedWaypoint = selectedWaypointItem?.vertex ?? null
  const namedWaypoints = useMemo(() => (
    graphWaypoints
      .filter(item => item.vertex.name)
      .sort((a, b) => a.vertex.name.localeCompare(b.vertex.name))
  ), [graphWaypoints])
  const levelLifts = selectedLevel && buildingMap
    ? buildingMap.lifts.filter(lift => lift.levels.includes(selectedLevel.name))
    : []
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Surface className="p-4">
          <div className="text-xs font-700 uppercase tracking-wide text-gray-500">Map source</div>
          <div className="mt-2 flex items-center gap-2">
            <span className={classNames('h-2.5 w-2.5 rounded-full', mapConnected ? 'bg-emerald-500' : 'bg-red-500')} />
            <span className="font-800 text-gray-900">{formatStatus(mapStatus, mapConnected)}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">{buildingMap?.key || '/map'} · {formatTime(mapUpdatedAt)}</div>
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

      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-(b-solid 1px gray-200) p-4">
          <div>
            <div className="font-800 text-gray-900">Dashboard</div>
            <div className="text-xs text-gray-500">Map images + nav graph from Zenoh /map</div>
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
                      return (
                        <g key={door.name}>
                          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#f59e0b" strokeWidth={4} strokeLinecap="round" />
                          {layers.labels && <text x={(p1.x + p2.x) / 2 + 5} y={(p1.y + p2.y) / 2 - 5} className="fill-amber-700 text-[11px] font-700">{door.name}</text>}
                        </g>
                      )
                    })}

                    {layers.lifts && levelLifts.map((lift) => {
                      const points = liftFootprintPoints(lift).map(point => projector.project(point.x, point.y))
                      const center = projector.project(lift.refX, lift.refY)
                      return (
                        <g key={lift.name}>
                          <polygon
                            points={points.map(point => `${point.x},${point.y}`).join(' ')}
                            fill="#7c3aed26"
                            stroke="#7c3aed"
                            strokeWidth={2}
                          />
                          {layers.labels && <text x={center.x + 6} y={center.y - 6} className="fill-violet-700 text-[11px] font-800">{lift.name}</text>}
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
                      const waypointKey = `${index}:${vertex.name}`
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
                                  setSelectedWaypointKey(item.key)
                                  setSelectedRobotKey('')
                                }}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0 truncate font-800 text-gray-900">{item.vertex.name}</div>
                                  <Badge className={getWaypointToneClass(item.vertex)}>{getWaypointKind(item.vertex)}</Badge>
                                </div>
                                <div className="mt-1 text-xs text-gray-500">x {formatNumber(item.vertex.x)} · y {formatNumber(item.vertex.y)}</div>
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
                        {selectedLevel.doors.slice(0, 8).map(door => (
                          <div key={door.name} className="rounded-lg border-(solid 1px gray-200) bg-white/85 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 truncate font-800 text-gray-900">{door.name}</div>
                              <Badge className="bg-amber-50 text-amber-700">Door</Badge>
                            </div>
                            <div className="mt-1 text-xs text-gray-500">range {formatNumber(door.motionRange)} · direction {formatInteger(door.motionDirection)}</div>
                          </div>
                        ))}
                        {levelLifts.slice(0, 8).map(lift => (
                          <div key={lift.name} className="rounded-lg border-(solid 1px gray-200) bg-white/85 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 truncate font-800 text-gray-900">{lift.name}</div>
                              <Badge className="bg-violet-50 text-violet-700">Lift</Badge>
                            </div>
                            <div className="mt-1 text-xs text-gray-500">levels {lift.levels.join(', ') || '--'}</div>
                          </div>
                        ))}
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
              <div className="px-4 py-16 text-center text-sm text-gray-500">Waiting for BuildingMap from Zenoh /map</div>
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
  hardwareDiagnostics,
  now,
  selected = false,
  onSelect,
}: {
  robot: FleetRobotDataMessage
  pending?: boolean
  dido?: RobotDidoValues
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
      <td className="px-3 py-2 align-top">{getWheelSummary(robot)}</td>
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
  hardwareDiagnostics,
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
  hardwareDiagnostics: FleetHardwareDiagnosticsZenohState
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
  const selectedHardwareDiagnostics = selectedRobot ? getRobotHardwareDiagnosticsValue(selectedRobot, hardwareDiagnostics, didoRobots) : undefined
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
          <div className={classNames('text-xs font-700', hardwareDiagnostics.connected ? 'text-emerald-700' : 'text-gray-500')}>
            Hardware {formatStatus(hardwareDiagnostics.status, hardwareDiagnostics.connected)}
          </div>
          {dido.error && <div className="text-sm text-red-700">{dido.error}</div>}
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
      <HardwareDiagnosticsPanel
        robot={selectedRobot}
        diagnostics={selectedHardwareDiagnostics}
        stream={hardwareDiagnostics}
        now={now}
      />
    </div>
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
}) {
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === b.status)
      return new Date(a.scheduleAt).getTime() - new Date(b.scheduleAt).getTime()
    if (a.status === 'active')
      return -1
    if (b.status === 'active')
      return 1
    return a.createdAt - b.createdAt
  })

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      <Surface className="p-4">
        <form className="space-y-4" onSubmit={createTask}>
          <div>
            <div className="text-4 font-800">Create task</div>
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
      </Surface>

      <Surface>
        <div className="flex items-center justify-between border-(b-solid 1px gray-200) px-4 py-3">
          <div>
            <div className="font-800">Tasks</div>
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
              <div className="px-4 py-14 text-center text-sm text-gray-500">No tasks</div>
            )}
      </Surface>
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
}: {
  areas: StorageArea[]
  storageDraft: StorageDraft
  setStorageDraft: React.Dispatch<React.SetStateAction<StorageDraft>>
  createStorageArea: (event: React.FormEvent<HTMLFormElement>) => void
  updateStorageArea: (id: string, patch: Partial<StorageArea>) => void
  deleteStorageArea: (id: string) => void
  mapOptions: string[]
}) {
  return (
    <div className="space-y-4">
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
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const changeNestController = useParamsStore(state => state.changeNestController)
  const robots = fleet.data?.robots ?? []
  const pendingRobots = fleet.data?.pendingRobots ?? []
  const allRobots = useMemo(() => [...robots, ...pendingRobots], [robots, pendingRobots])
  const dido = useFleetDidoZenoh(allRobots)
  const hardwareDiagnostics = useFleetHardwareDiagnosticsZenoh(allRobots)
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
  const faultedMotorCount = allRobots.reduce((sum, robot) => (
    sum + (robot.hasWheelState ? robot.wheels.motors.filter(motor => motor.isFaulted).length : 0)
  ), 0)
  const activeTaskCount = tasks.filter(task => task.status === 'active').length
  const occupiedStorageCount = storageAreas.reduce((sum, area) => sum + area.occupied, 0)

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
          mapStatus={buildingMap.status}
          mapConnected={buildingMap.connected}
          mapUpdatedAt={buildingMap.updatedAt}
          mapError={buildingMap.error}
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
        hardwareDiagnostics={hardwareDiagnostics}
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
            <div className="text-xs text-gray-500">{fleet.key || 'fleet_data'}</div>
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
              <div className="mt-1 text-6 font-800">{occupiedStorageCount}</div>
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
