import type { FleetDataMessage, FleetDiagnosticStateMessage, FleetDiagnosticStatusMessage, FleetRobotDataMessage, TwistCommand } from '../../types.js'

export const FLEET_STATE_STALE_MS = 3000
export const FLEET_DISCONNECTED_MS = 10000
export const HARDWARE_DIAGNOSTICS_STALE_MS = 5000

export type FleetRobotNetworkState = 'live' | 'poor-network' | 'disconnected' | 'last-known'
export type FleetRobotOverallHealth = 'normal' | 'warning' | 'fault' | 'unknown'
export type FleetRobotActivityKind = 'task' | 'unit-task' | 'manual-control' | 'deployment' | 'peripheral' | 'hardware'
export type FleetRobotActivitySeverity = 'normal' | 'warning' | 'fault'
export type FleetPeripheralGroupId = 'power' | 'motion' | 'fork-lift' | 'shelf-pallet' | 'io'
export type FleetDigitalObservedState = 'unknown' | 'on' | 'off'
export type FleetDigitalOutputCommandStatus = 'idle' | 'pending' | 'sent' | 'failed'
export type FleetHardwareDiagnosticState = 'normal' | 'warning' | 'fault' | 'unknown' | 'stale'
export type FleetHardwareDiagnosticGroupId = 'compute' | 'sensors' | 'interfaces' | 'power' | 'motion' | 'other' | 'unknown'

export interface FleetPeripheralGroup {
  id: FleetPeripheralGroupId
  title: string
}

export interface FleetDigitalInputValue {
  id: string
  label: string
  index: number
  value: boolean
  observedState: Exclude<FleetDigitalObservedState, 'unknown'>
  readOnly: true
}

export interface FleetDigitalOutputValue {
  id: string
  label: string
  index: number
  value: boolean | null
  observedState: FleetDigitalObservedState
}

export interface FleetDigitalOutputServiceResponse {
  success: boolean
  message: string
}

export interface FleetDigitalOutputControlState {
  id: string
  label: string
  groupId: FleetPeripheralGroupId
  outputId: string
  disabled: boolean
  observedValue: boolean | null
  observedState: FleetDigitalObservedState
  commandStatus: FleetDigitalOutputCommandStatus
  serviceResponse: FleetDigitalOutputServiceResponse | null
}

export interface FleetRobotPeripheralIoState {
  inputs: FleetDigitalInputValue[]
  outputs: FleetDigitalOutputValue[]
  controls: FleetDigitalOutputControlState[]
  arbitraryAddressEntryAvailable: false
}

export interface FleetRobotPeripheralState {
  robotId: string
  groups: FleetPeripheralGroup[]
  io: FleetRobotPeripheralIoState
  updatedAt: number | null
}

export interface FleetHardwareDiagnosticValue {
  label: string
  value: string
}

export interface FleetHardwareDiagnosticItem {
  id: string
  label: string
  rawName: string
  groupId: FleetHardwareDiagnosticGroupId
  state: FleetHardwareDiagnosticState
  message: string
  hardwareId: string
  values: FleetHardwareDiagnosticValue[]
}

export interface FleetHardwareDiagnosticGroup {
  id: FleetHardwareDiagnosticGroupId
  title: string
  items: FleetHardwareDiagnosticItem[]
}

export interface FleetHardwareDiagnosticSummary {
  state: FleetHardwareDiagnosticState
  totalCount: number
  abnormalCount: number
  updatedAt: number | null
}

export interface FleetRobotHardwareDiagnosticsState {
  showNormal: boolean
  summary: FleetHardwareDiagnosticSummary
  groups: FleetHardwareDiagnosticGroup[]
  updatedAt: number | null
}

interface FleetRobotHardwareDiagnosticsRecord {
  diagnostics: FleetDiagnosticStateMessage | null
  receivedAt: number | null
  showNormal: boolean
}

export interface FleetRobotPose {
  x: number
  y: number
  yaw: number
}

export interface FleetViewRuntimeRobot {
  id: string
  name: string
  ip: string
  commandPath: string
  levelName: string
  pose: FleetRobotPose | null
  batteryPercent: number | null
  currentTaskId: string
  currentUnitTaskId: string
  mode: string
  overallHealth: FleetRobotOverallHealth
  commandPathAvailable: boolean
  networkState: FleetRobotNetworkState
  lastUpdateAgeMs: number
  lastSeenAt: number
}

export interface FleetViewDashboardMapState {
  panX: number
  panY: number
  zoom: number
  centeredRobotId: string
}

export interface FleetRobotActivityEntry {
  id: string
  robotId: string
  kind: FleetRobotActivityKind
  title: string
  detail: string
  occurredAt: number
  severity: FleetRobotActivitySeverity
}

export interface FleetViewRuntimeRobotDetail extends FleetViewRuntimeRobot {
  isLastKnown: boolean
  activity: FleetRobotActivityEntry[]
  peripheral: FleetRobotPeripheralState
  hardwareDiagnostics: FleetRobotHardwareDiagnosticsState
}

export interface FleetManualControlPanelState {
  placement: 'fleet-sidebar'
  availableInPages: Array<'dashboard' | 'robots' | 'tasks' | 'storage' | 'sites'>
  selectedRobotId: string
  commandPath: string
  available: boolean
  networkState: FleetRobotNetworkState | 'unknown'
  warning: string
}

export interface FleetTaskReadiness {
  canDispatch: boolean
  message: string
}

export type FleetUnitTask =
  | { type: 'go_to'; robotId: string; levelName: string; destinationName: string }
  | { type: 'action'; robotId: string; actionName: string }

export interface FleetTaskSequencePreview {
  templateId: string
  unitTasks: FleetUnitTask[]
  canSubmit: boolean
  readinessMessage: string
}

export interface FleetTaskSequenceDraft {
  templateId: 'go_to_level'
  robotId: string
  levelName: string
  destinationName: string
}

export const PACKAGED_TASK_TEMPLATES = [{
  id: 'go_to_level',
  label: 'Go To Level',
}] as const

export interface FleetViewRuntimeState {
  robots: FleetViewRuntimeRobot[]
  selectedRobotId: string
  selectedRobotDetail: FleetViewRuntimeRobotDetail | null
  robotActivity: FleetRobotActivityEntry[]
  robotPeripheralState: Record<string, FleetRobotPeripheralState>
  robotHardwareDiagnostics: Record<string, FleetRobotHardwareDiagnosticsRecord>
  manualControlPanel: FleetManualControlPanelState
  dashboardMap: FleetViewDashboardMapState
  lastFleetStateReceivedAt: number | null
  deploymentActivationInProgress: boolean
  taskDispatchAvailable: boolean
  taskReadiness: FleetTaskReadiness
  taskSequencePreview: FleetTaskSequencePreview | null
  manualControlAvailable: boolean
}

export type FleetViewRuntimeEffect =
  | { type: 'center-dashboard-on-robot'; robotId: string }
  | { type: 'send-velocity-command'; robotId: string; commandPath: string; command: TwistCommand }
  | { type: 'send-digital-output-command'; robotId: string; servicePath: string; controlId: string; address: number; value: boolean; requestId: string }
  | { type: 'show-toast'; tone: 'info' | 'warning' | 'error'; message: string }

export interface FleetViewRuntimeResult {
  state: FleetViewRuntimeState
  effects: FleetViewRuntimeEffect[]
}

export type FleetViewRuntimeEvent =
  | { type: 'fleet-state-received'; data: FleetDataMessage; receivedAt: number }
  | { type: 'clock-tick'; now: number }
  | { type: 'select-robot'; robotId: string }
  | { type: 'dashboard-robot-clicked'; robotId: string }
  | { type: 'dashboard-map-view-changed'; panX: number; panY: number; zoom: number }
  | { type: 'task-sequence-preview-requested'; draft: FleetTaskSequenceDraft }
  | { type: 'task-activity-received'; robotId: string; taskId: string; status: string; occurredAt: number }
  | { type: 'unit-task-activity-received'; robotId: string; unitTaskId: string; status: string; occurredAt: number }
  | { type: 'manual-control-activity-received'; robotId: string; commandName: string; occurredAt: number }
  | { type: 'manual-control-robot-selected'; robotId: string }
  | { type: 'velocity-control-command-requested'; command: TwistCommand; occurredAt: number }
  | { type: 'velocity-control-released'; occurredAt: number }
  | { type: 'digital-input-state-received'; robotId: string; values: boolean[]; receivedAt: number }
  | { type: 'digital-output-state-received'; robotId: string; values: boolean[]; receivedAt: number }
  | { type: 'digital-output-command-requested'; robotId: string; controlId: string; value: boolean; occurredAt: number }
  | { type: 'digital-output-command-response-received'; robotId: string; controlId: string; requestId: string; success: boolean; message: string; occurredAt: number }
  | { type: 'hardware-diagnostics-received'; robotId: string; diagnostics: FleetDiagnosticStateMessage; receivedAt: number }
  | { type: 'hardware-diagnostics-show-normal-changed'; robotId: string; showNormal: boolean }
  | { type: 'deployment-activity-received'; robotId: string; levelName: string; occurredAt: number }
  | { type: 'peripheral-activity-received'; robotId: string; label: string; value: string; occurredAt: number }
  | { type: 'hardware-diagnostics-activity-received'; robotId: string; diagnosticName: string; level: FleetRobotActivitySeverity; message: string; occurredAt: number }
  | { type: 'raw-transport-log-received'; message: string; occurredAt: number }
  | { type: 'deployment-activation-started' }
  | { type: 'deployment-activation-finished'; now: number }

export interface FleetViewRuntimeOptions {
  now: number
}

const readyTaskReadiness: FleetTaskReadiness = {
  canDispatch: true,
  message: 'Ready',
}

const waitingForFleetStateReadiness: FleetTaskReadiness = {
  canDispatch: false,
  message: 'Waiting for fresh fleet state',
}

const disconnectedReadiness: FleetTaskReadiness = {
  canDispatch: false,
  message: 'Fleet disconnected',
}

const deploymentActivationReadiness: FleetTaskReadiness = {
  canDispatch: false,
  message: 'Deployment activation in progress',
}

export const emptyFleetViewRuntimeState: FleetViewRuntimeState = {
  robots: [],
  selectedRobotId: '',
  selectedRobotDetail: null,
  robotActivity: [],
  robotPeripheralState: {},
  robotHardwareDiagnostics: {},
  manualControlPanel: {
    placement: 'fleet-sidebar',
    availableInPages: ['dashboard', 'robots', 'tasks', 'storage', 'sites'],
    selectedRobotId: '',
    commandPath: '',
    available: false,
    networkState: 'unknown',
    warning: '',
  },
  dashboardMap: {
    panX: 0,
    panY: 0,
    zoom: 1,
    centeredRobotId: '',
  },
  lastFleetStateReceivedAt: null,
  deploymentActivationInProgress: false,
  taskDispatchAvailable: false,
  taskReadiness: waitingForFleetStateReadiness,
  taskSequencePreview: null,
  manualControlAvailable: false,
}

const peripheralGroups: FleetPeripheralGroup[] = [
  { id: 'power', title: 'Power' },
  { id: 'motion', title: 'Motion' },
  { id: 'fork-lift', title: 'Fork/Lift' },
  { id: 'shelf-pallet', title: 'Shelf/Pallet' },
  { id: 'io', title: 'I/O' },
]

interface PredefinedDigitalOutputControl {
  id: string
  label: string
  groupId: FleetPeripheralGroupId
  outputIndex: number
  address: number
}

interface DigitalOutputCommandFeedback {
  commandStatus: FleetDigitalOutputCommandStatus
  serviceResponse: FleetDigitalOutputServiceResponse | null
}

const DIGITAL_OUTPUT_ADDRESS_BASE = 800

function digitalOutputIndexForAddress(address: number) {
  return address - DIGITAL_OUTPUT_ADDRESS_BASE
}

const predefinedDigitalOutputControls: PredefinedDigitalOutputControl[] = [
  { id: 'fork-extend', label: 'Fork extend', groupId: 'fork-lift', outputIndex: digitalOutputIndexForAddress(805), address: 805 },
  { id: 'fork-retract', label: 'Fork retract', groupId: 'fork-lift', outputIndex: digitalOutputIndexForAddress(806), address: 806 },
  { id: 'fork-power', label: 'Fork power', groupId: 'power', outputIndex: digitalOutputIndexForAddress(807), address: 807 },
]

function robotId(robot: FleetRobotDataMessage) {
  return robot.name || robot.robot || robot.ip
}

function normalizeCommandNamespace(value: string) {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function digitalId(prefix: 'I' | 'O', index: number) {
  return `${prefix}${index}`
}

function digitalObservedState(value: boolean | null): FleetDigitalObservedState {
  if (value == null)
    return 'unknown'

  return value ? 'on' : 'off'
}

function buildDigitalInputs(values: boolean[] | undefined): FleetDigitalInputValue[] {
  return (values ?? []).map((value, index) => ({
    id: digitalId('I', index),
    label: digitalId('I', index),
    index,
    value,
    observedState: value ? 'on' : 'off',
    readOnly: true,
  }))
}

function buildDigitalOutputs(values: Array<boolean | null> | undefined): FleetDigitalOutputValue[] {
  const minimumOutputCount = predefinedDigitalOutputControls.reduce(
    (highestIndex, control) => Math.max(highestIndex, control.outputIndex + 1),
    0,
  )
  const outputCount = Math.max(values?.length ?? 0, minimumOutputCount)

  return Array.from({ length: outputCount }, (_, index) => {
    const value = values && index < values.length ? values[index] : null
    return {
      id: digitalId('O', index),
      label: digitalId('O', index),
      index,
      value,
      observedState: digitalObservedState(value),
    }
  })
}

function digitalOutputCommandFeedback(
  commandStatus: FleetDigitalOutputCommandStatus = 'idle',
  serviceResponse: FleetDigitalOutputServiceResponse | null = null,
): DigitalOutputCommandFeedback {
  return {
    commandStatus,
    serviceResponse,
  }
}

function commandFeedbackByControl(peripheral?: FleetRobotPeripheralState): Record<string, DigitalOutputCommandFeedback> {
  return Object.fromEntries((peripheral?.io.controls ?? []).map(control => [
    control.id,
    digitalOutputCommandFeedback(control.commandStatus, control.serviceResponse),
  ]))
}

function inputValuesFromPeripheral(peripheral?: FleetRobotPeripheralState) {
  return peripheral?.io.inputs.map(input => input.value)
}

function outputValuesFromPeripheral(peripheral?: FleetRobotPeripheralState): Array<boolean | null> | undefined {
  return peripheral?.io.outputs.map(output => output.value)
}

function buildDigitalOutputControls(
  outputs: FleetDigitalOutputValue[],
  feedbackByControl: Record<string, DigitalOutputCommandFeedback>,
): FleetDigitalOutputControlState[] {
  return predefinedDigitalOutputControls.map((control) => {
    const output = outputs[control.outputIndex]
    const observedState = output?.observedState ?? 'unknown'
    const feedback = feedbackByControl[control.id] ?? digitalOutputCommandFeedback()

    return {
      id: control.id,
      label: control.label,
      groupId: control.groupId,
      outputId: digitalId('O', control.outputIndex),
      disabled: observedState === 'unknown',
      observedValue: output?.value ?? null,
      observedState,
      commandStatus: feedback.commandStatus,
      serviceResponse: feedback.serviceResponse,
    }
  })
}

function buildPeripheralState(
  robotIdValue: string,
  options: {
    inputValues?: boolean[]
    outputValues?: Array<boolean | null>
    feedbackByControl?: Record<string, DigitalOutputCommandFeedback>
    updatedAt?: number | null
  } = {},
): FleetRobotPeripheralState {
  const outputs = buildDigitalOutputs(options.outputValues)
  return {
    robotId: robotIdValue,
    groups: peripheralGroups,
    io: {
      inputs: buildDigitalInputs(options.inputValues),
      outputs,
      controls: buildDigitalOutputControls(outputs, options.feedbackByControl ?? {}),
      arbitraryAddressEntryAvailable: false,
    },
    updatedAt: options.updatedAt ?? null,
  }
}

function peripheralForRobot(state: FleetViewRuntimeState, robotIdValue: string) {
  return state.robotPeripheralState[robotIdValue] ?? buildPeripheralState(robotIdValue)
}

function rebuildPeripheralState(
  current: FleetRobotPeripheralState,
  patch: {
    inputValues?: boolean[]
    outputValues?: Array<boolean | null>
    feedbackByControl?: Record<string, DigitalOutputCommandFeedback>
    updatedAt?: number | null
  },
) {
  return buildPeripheralState(current.robotId, {
    inputValues: patch.inputValues ?? inputValuesFromPeripheral(current),
    outputValues: patch.outputValues ?? outputValuesFromPeripheral(current),
    feedbackByControl: patch.feedbackByControl ?? commandFeedbackByControl(current),
    updatedAt: patch.updatedAt ?? current.updatedAt,
  })
}

function withRobotPeripheralState(
  state: FleetViewRuntimeState,
  robotIdValue: string,
  peripheral: FleetRobotPeripheralState,
): FleetViewRuntimeState {
  return {
    ...state,
    robotPeripheralState: {
      ...state.robotPeripheralState,
      [robotIdValue]: peripheral,
    },
    selectedRobotDetail: state.selectedRobotDetail?.id === robotIdValue
      ? {
          ...state.selectedRobotDetail,
          peripheral,
        }
      : state.selectedRobotDetail,
  }
}

const hardwareDiagnosticGroupOrder: FleetHardwareDiagnosticGroupId[] = [
  'compute',
  'sensors',
  'interfaces',
  'power',
  'motion',
  'other',
  'unknown',
]

const hardwareDiagnosticGroupTitles: Record<FleetHardwareDiagnosticGroupId, string> = {
  compute: 'Compute',
  sensors: 'Sensors',
  interfaces: 'Interfaces',
  power: 'Power',
  motion: 'Motion',
  other: 'Other',
  unknown: 'Hardware',
}

function normalizeDiagnosticName(value: string) {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function titleCaseWords(value: string) {
  return value
    .split(/[\s_/.-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function friendlyDiagnosticLabel(status: FleetDiagnosticStatusMessage) {
  const name = normalizeDiagnosticName(status.name)
  const lowerName = name.toLowerCase()

  if (lowerName === 'cpu')
    return 'CPU'
  if (lowerName === 'memory')
    return 'Memory'
  if (lowerName === 'swap')
    return 'Swap'

  const scanMatch = lowerName.match(/^scan(\d*)$/)
  if (scanMatch)
    return scanMatch[1] ? `Lidar ${scanMatch[1]}` : 'Lidar'

  const lidarMatch = lowerName.match(/^lidar[_/-]?(\d*)$/)
  if (lidarMatch)
    return lidarMatch[1] ? `Lidar ${lidarMatch[1]}` : 'Lidar'

  if (lowerName.includes('imu'))
    return 'IMU'

  const cameraMatch = lowerName.match(/^camera_(\d+)\/(color|depth)\//)
  if (cameraMatch)
    return `Camera ${cameraMatch[1]} ${cameraMatch[2] === 'color' ? 'Color' : 'Depth'}`

  const ethernetMatch = lowerName.match(/^hardware\/ethernet\/(.+)$/)
  if (ethernetMatch)
    return `Ethernet ${ethernetMatch[1]}`

  const canMatch = lowerName.match(/^hardware\/can\/(.+)$/)
  if (canMatch)
    return `CAN ${canMatch[1]}`

  const uartMatch = lowerName.match(/^hardware\/uart\/(.+)$/)
  if (uartMatch)
    return `UART ${uartMatch[1]}`

  if (name)
    return titleCaseWords(name)

  return 'Hardware diagnostics'
}

function hardwareDiagnosticGroupId(status: FleetDiagnosticStatusMessage): FleetHardwareDiagnosticGroupId {
  const name = normalizeDiagnosticName(status.name).toLowerCase()
  const hardwareId = status.hardwareId.toLowerCase()

  if (['cpu', 'memory', 'swap'].includes(name) || hardwareId === 'system')
    return 'compute'
  if (name.includes('battery') || hardwareId === 'power')
    return 'power'
  if (name.includes('motor') || name.includes('wheel') || name.includes('lift') || hardwareId === 'motion')
    return 'motion'
  if (
    hardwareId === 'sensor'
    || (name.startsWith('scan') && /^scan\d*$/.test(name))
    || name.startsWith('lidar')
    || name.includes('imu')
    || name.includes('camera')
  )
    return 'sensors'
  if (
    hardwareId === 'hardware'
    || name.startsWith('hardware/ethernet/')
    || name.startsWith('hardware/can/')
    || name.startsWith('hardware/uart/')
  )
    return 'interfaces'

  return 'other'
}

function hardwareDiagnosticState(level: number): FleetHardwareDiagnosticState {
  if (level >= 2)
    return 'fault'
  if (level === 1)
    return 'warning'
  if (level === 0)
    return 'normal'

  return 'unknown'
}

function hardwareDiagnosticValueLabel(key: string) {
  return titleCaseWords(key.replace(/_percent$/i, '').replace(/_celsius$/i, ''))
}

function hardwareSummaryState(items: FleetHardwareDiagnosticItem[]): FleetHardwareDiagnosticState {
  if (items.some(item => item.state === 'fault'))
    return 'fault'
  if (items.some(item => item.state === 'warning'))
    return 'warning'
  if (items.some(item => item.state === 'stale'))
    return 'stale'
  if (items.some(item => item.state === 'unknown'))
    return 'unknown'

  return 'normal'
}

function unknownHardwareDiagnostics(showNormal: boolean): FleetRobotHardwareDiagnosticsState {
  return {
    showNormal,
    updatedAt: null,
    summary: {
      state: 'unknown',
      totalCount: 1,
      abnormalCount: 1,
      updatedAt: null,
    },
    groups: [{
      id: 'unknown',
      title: hardwareDiagnosticGroupTitles.unknown,
      items: [{
        id: 'hardware-diagnostics',
        label: 'Hardware diagnostics',
        rawName: '',
        groupId: 'unknown',
        state: 'unknown',
        message: 'No diagnostics received this session',
        hardwareId: '',
        values: [],
      }],
    }],
  }
}

function buildHardwareDiagnosticsState(
  record: FleetRobotHardwareDiagnosticsRecord | undefined,
  now: number,
): FleetRobotHardwareDiagnosticsState {
  const showNormal = record?.showNormal ?? false
  if (!record?.diagnostics || record.receivedAt == null)
    return unknownHardwareDiagnostics(showNormal)

  const stale = now - record.receivedAt > HARDWARE_DIAGNOSTICS_STALE_MS
  const allItems = record.diagnostics.status.map((status, index): FleetHardwareDiagnosticItem => {
    const groupId = hardwareDiagnosticGroupId(status)
    const state = stale ? 'stale' : hardwareDiagnosticState(status.level)
    const rawName = normalizeDiagnosticName(status.name)
    return {
      id: rawName || `${groupId}-${index}`,
      label: friendlyDiagnosticLabel(status),
      rawName,
      groupId,
      state,
      message: stale ? 'Diagnostic data stale' : (status.message || '--'),
      hardwareId: status.hardwareId,
      values: status.values.map(value => ({
        label: hardwareDiagnosticValueLabel(value.key),
        value: value.value,
      })),
    }
  })
  const visibleItems = allItems.filter(item => showNormal || item.state !== 'normal')
  const groups = hardwareDiagnosticGroupOrder
    .map((groupId) => {
      const items = visibleItems.filter(item => item.groupId === groupId)
      return {
        id: groupId,
        title: hardwareDiagnosticGroupTitles[groupId],
        items,
      }
    })
    .filter(group => group.items.length > 0)
  const abnormalCount = allItems.filter(item => item.state !== 'normal').length

  return {
    showNormal,
    groups,
    updatedAt: record.receivedAt,
    summary: {
      state: hardwareSummaryState(allItems),
      totalCount: allItems.length,
      abnormalCount,
      updatedAt: record.receivedAt,
    },
  }
}

export function buildRobotHardwareDiagnosticsView(
  diagnostics: FleetDiagnosticStateMessage | null | undefined,
  receivedAt: number | null | undefined,
  showNormal: boolean,
  now: number,
): FleetRobotHardwareDiagnosticsState {
  return buildHardwareDiagnosticsState({
    diagnostics: diagnostics ?? null,
    receivedAt: receivedAt ?? null,
    showNormal,
  }, now)
}

function hardwareDiagnosticsForRobot(state: FleetViewRuntimeState, robotIdValue: string, now: number) {
  return buildHardwareDiagnosticsState(state.robotHardwareDiagnostics[robotIdValue], now)
}

function detailOverallHealth(
  robot: FleetViewRuntimeRobot,
  hardwareDiagnostics: FleetRobotHardwareDiagnosticsState,
): FleetRobotOverallHealth {
  if (hardwareDiagnostics.summary.state === 'fault')
    return 'fault'
  if (hardwareDiagnostics.summary.state === 'warning' || hardwareDiagnostics.summary.state === 'stale')
    return 'warning'
  if (hardwareDiagnostics.summary.state === 'unknown' && robot.overallHealth === 'normal')
    return 'unknown'

  return robot.overallHealth
}

function withRobotHardwareDiagnosticsRecord(
  state: FleetViewRuntimeState,
  robotIdValue: string,
  record: FleetRobotHardwareDiagnosticsRecord,
  now: number,
): FleetViewRuntimeState {
  const nextState = {
    ...state,
    robotHardwareDiagnostics: {
      ...state.robotHardwareDiagnostics,
      [robotIdValue]: record,
    },
  }

  if (nextState.selectedRobotDetail?.id !== robotIdValue)
    return nextState

  const hardwareDiagnostics = hardwareDiagnosticsForRobot(nextState, robotIdValue, now)
  return {
    ...nextState,
    selectedRobotDetail: {
      ...nextState.selectedRobotDetail,
      overallHealth: detailOverallHealth(nextState.selectedRobotDetail, hardwareDiagnostics),
      hardwareDiagnostics,
    },
  }
}

function robotOverallHealth(robot: FleetRobotDataMessage): FleetRobotOverallHealth {
  if (!robot.hasDiagnostics)
    return 'unknown'

  const highestLevel = robot.diagnostics.status.reduce((level, status) => Math.max(level, status.level), 0)
  if (highestLevel >= 2)
    return 'fault'
  if (highestLevel >= 1)
    return 'warning'

  return 'normal'
}

function toRuntimeRobot(robot: FleetRobotDataMessage, receivedAt: number): FleetViewRuntimeRobot {
  return {
    id: robotId(robot),
    name: robot.name || robot.robot || '--',
    ip: robot.ip || '',
    commandPath: normalizeCommandNamespace(robot.zenohNamespace)
      ? `${normalizeCommandNamespace(robot.zenohNamespace)}/cmd_vel_collision`
      : '',
    levelName: robot.location.levelName || robot.location.map || robot.map || '',
    pose: robot.location.hasPose
      ? { x: robot.location.x, y: robot.location.y, yaw: robot.location.yaw }
      : null,
    batteryPercent: robot.hasBatteryPercent ? robot.batteryPercent : null,
    currentTaskId: robot.taskId || '',
    currentUnitTaskId: robot.activityId || '',
    mode: robot.mode || robot.status || '',
    overallHealth: robotOverallHealth(robot),
    commandPathAvailable: Boolean(normalizeCommandNamespace(robot.zenohNamespace)),
    networkState: 'live',
    lastUpdateAgeMs: 0,
    lastSeenAt: receivedAt,
  }
}

function robotActivity(state: FleetViewRuntimeState, robotIdValue: string) {
  return state.robotActivity.filter(entry => entry.robotId === robotIdValue)
}

function toRobotDetail(
  robot: FleetViewRuntimeRobot,
  isLastKnown: boolean,
  activity: FleetRobotActivityEntry[],
  peripheral: FleetRobotPeripheralState,
  hardwareDiagnostics: FleetRobotHardwareDiagnosticsState,
): FleetViewRuntimeRobotDetail {
  return {
    ...robot,
    overallHealth: detailOverallHealth(robot, hardwareDiagnostics),
    isLastKnown,
    activity,
    peripheral,
    hardwareDiagnostics,
  }
}

function markLastKnown(
  detail: FleetViewRuntimeRobotDetail,
  now: number,
  activity: FleetRobotActivityEntry[],
  peripheral: FleetRobotPeripheralState,
  hardwareDiagnostics: FleetRobotHardwareDiagnosticsState,
): FleetViewRuntimeRobotDetail {
  return {
    ...detail,
    overallHealth: detailOverallHealth(detail, hardwareDiagnostics),
    isLastKnown: true,
    networkState: 'last-known',
    lastUpdateAgeMs: Math.max(0, now - detail.lastSeenAt),
    activity,
    peripheral,
    hardwareDiagnostics,
  }
}

function freshnessReadiness(ageMs: number, deploymentActivationInProgress: boolean): FleetTaskReadiness {
  if (deploymentActivationInProgress)
    return deploymentActivationReadiness
  if (ageMs > FLEET_DISCONNECTED_MS)
    return disconnectedReadiness
  if (ageMs > FLEET_STATE_STALE_MS)
    return waitingForFleetStateReadiness

  return readyTaskReadiness
}

function networkStateForAge(ageMs: number): FleetRobotNetworkState {
  if (ageMs > FLEET_DISCONNECTED_MS)
    return 'disconnected'
  if (ageMs > FLEET_STATE_STALE_MS)
    return 'poor-network'

  return 'live'
}

function withTaskReadiness(
  state: FleetViewRuntimeState,
  taskReadiness: FleetTaskReadiness,
): FleetViewRuntimeState {
  return {
    ...state,
    taskDispatchAvailable: taskReadiness.canDispatch,
    taskReadiness,
    taskSequencePreview: state.taskSequencePreview
      ? {
          ...state.taskSequencePreview,
          canSubmit: taskReadiness.canDispatch,
          readinessMessage: taskReadiness.message,
        }
      : null,
  }
}

function selectedDetailFromRobots(
  state: FleetViewRuntimeState,
  robots: FleetViewRuntimeRobot[],
  now: number,
): FleetViewRuntimeRobotDetail | null {
  if (!state.selectedRobotId)
    return null

  const selectedRobot = robots.find(robot => robot.id === state.selectedRobotId)
  if (selectedRobot) {
    return toRobotDetail(
      selectedRobot,
      false,
      robotActivity(state, selectedRobot.id),
      peripheralForRobot(state, selectedRobot.id),
      hardwareDiagnosticsForRobot(state, selectedRobot.id, now),
    )
  }

  if (state.selectedRobotDetail?.id === state.selectedRobotId) {
    return markLastKnown(
      state.selectedRobotDetail,
      now,
      robotActivity(state, state.selectedRobotId),
      peripheralForRobot(state, state.selectedRobotId),
      hardwareDiagnosticsForRobot(state, state.selectedRobotId, now),
    )
  }

  return null
}

function manualControlAvailableFor(detail: FleetViewRuntimeRobotDetail | null) {
  return Boolean(detail?.commandPathAvailable)
}

function poorNetworkWarning(networkState: FleetRobotNetworkState | 'unknown') {
  if (networkState === 'poor-network' || networkState === 'disconnected' || networkState === 'last-known')
    return 'Poor Network'

  return ''
}

function manualControlPanelFor(detail: FleetViewRuntimeRobotDetail | null): FleetManualControlPanelState {
  const networkState = detail?.networkState ?? 'unknown'
  return {
    placement: 'fleet-sidebar',
    availableInPages: ['dashboard', 'robots', 'tasks', 'storage', 'sites'],
    selectedRobotId: detail?.id ?? '',
    commandPath: detail?.commandPath ?? '',
    available: manualControlAvailableFor(detail),
    networkState,
    warning: poorNetworkWarning(networkState),
  }
}

function zeroVelocityCommand(): Required<TwistCommand> {
  return {
    linearX: 0,
    linearY: 0,
    linearZ: 0,
    angularX: 0,
    angularY: 0,
    angularZ: 0,
  }
}

function buildTaskSequencePreview(
  draft: FleetTaskSequenceDraft,
  taskReadiness: FleetTaskReadiness,
): FleetTaskSequencePreview {
  return {
    templateId: draft.templateId,
    unitTasks: [{
      type: 'go_to',
      robotId: draft.robotId,
      levelName: draft.levelName,
      destinationName: draft.destinationName,
    }],
    canSubmit: taskReadiness.canDispatch,
    readinessMessage: taskReadiness.message,
  }
}

function selectRobot(
  state: FleetViewRuntimeState,
  robotIdValue: string,
  now: number,
): FleetViewRuntimeState {
  const selectedRobot = state.robots.find(robot => robot.id === robotIdValue)
  const selectedRobotDetail = selectedRobot
    ? toRobotDetail(
      selectedRobot,
      false,
      robotActivity(state, robotIdValue),
      peripheralForRobot(state, robotIdValue),
      hardwareDiagnosticsForRobot(state, robotIdValue, now),
    )
    : state.selectedRobotDetail?.id === robotIdValue
      ? {
          ...state.selectedRobotDetail,
          activity: robotActivity(state, robotIdValue),
          peripheral: peripheralForRobot(state, robotIdValue),
          hardwareDiagnostics: hardwareDiagnosticsForRobot(state, robotIdValue, now),
        }
      : null

  return {
    ...state,
    selectedRobotId: robotIdValue,
    selectedRobotDetail,
    manualControlPanel: manualControlPanelFor(selectedRobotDetail),
    manualControlAvailable: manualControlAvailableFor(selectedRobotDetail),
  }
}

function detailForRobotCommand(state: FleetViewRuntimeState, robotIdValue: string) {
  if (state.selectedRobotDetail?.id === robotIdValue)
    return state.selectedRobotDetail

  const robot = state.robots.find(candidate => candidate.id === robotIdValue)
  if (!robot)
    return null

  return toRobotDetail(
    robot,
    false,
    robotActivity(state, robotIdValue),
    peripheralForRobot(state, robotIdValue),
    hardwareDiagnosticsForRobot(state, robotIdValue, state.lastFleetStateReceivedAt ?? Date.now()),
  )
}

function activityTitle(kind: FleetRobotActivityKind, statusOrLevel: string) {
  if (kind === 'task')
    return `Task ${statusOrLevel}`
  if (kind === 'unit-task')
    return `Unit task ${statusOrLevel}`
  if (kind === 'manual-control')
    return 'Manual control'
  if (kind === 'deployment')
    return 'Level changed'
  if (kind === 'peripheral')
    return 'Peripheral state changed'
  if (statusOrLevel === 'fault')
    return 'Hardware fault'
  if (statusOrLevel === 'warning')
    return 'Hardware warning'

  return 'Hardware state changed'
}

function withActivity(
  state: FleetViewRuntimeState,
  entry: FleetRobotActivityEntry,
): FleetViewRuntimeState {
  const robotActivityEntries = [...state.robotActivity, entry]
  const selectedRobotDetail = state.selectedRobotDetail
    ? {
        ...state.selectedRobotDetail,
        activity: robotActivityEntries.filter(activityEntry => activityEntry.robotId === state.selectedRobotDetail?.id),
      }
    : null

  return {
    ...state,
    robotActivity: robotActivityEntries,
    selectedRobotDetail,
  }
}

function normalActivityEntry(
  id: string,
  robotIdValue: string,
  kind: FleetRobotActivityKind,
  title: string,
  detail: string,
  occurredAt: number,
  severity: FleetRobotActivitySeverity = 'normal',
): FleetRobotActivityEntry {
  return {
    id,
    robotId: robotIdValue,
    kind,
    title,
    detail,
    occurredAt,
    severity,
  }
}

function withManualControlActivity(
  state: FleetViewRuntimeState,
  detail: FleetViewRuntimeRobotDetail,
  detailText: string,
  occurredAt: number,
  severity: FleetRobotActivitySeverity,
) {
  return withActivity(state, normalActivityEntry(
    `manual-control:${detail.id}:${occurredAt}`,
    detail.id,
    'manual-control',
    activityTitle('manual-control', ''),
    detailText,
    occurredAt,
    severity,
  ))
}

function velocityCommandEffects(
  detail: FleetViewRuntimeRobotDetail,
  command: TwistCommand,
  includePoorNetworkToast: boolean,
): FleetViewRuntimeEffect[] {
  const effects: FleetViewRuntimeEffect[] = [{
    type: 'send-velocity-command',
    robotId: detail.id,
    commandPath: detail.commandPath,
    command,
  }]

  if (includePoorNetworkToast) {
    effects.push({
      type: 'show-toast',
      tone: 'warning',
      message: 'Command sent - Poor Network',
    })
  }

  return effects
}

function predefinedDigitalOutputControl(controlId: string) {
  return predefinedDigitalOutputControls.find(control => control.id === controlId) ?? null
}

function digitalOutputCommandRequestId(robotIdValue: string, controlId: string, occurredAt: number) {
  return `digital-output:${robotIdValue}:${controlId}:${occurredAt}`
}

function digitalOutputServicePath(detail: FleetViewRuntimeRobotDetail) {
  return detail.commandPath.replace(/\/cmd_vel_collision$/, '/dido/write_coil')
}

function digitalOutputCommandEffect(
  detail: FleetViewRuntimeRobotDetail,
  control: PredefinedDigitalOutputControl,
  value: boolean,
  requestId: string,
): FleetViewRuntimeEffect {
  return {
    type: 'send-digital-output-command',
    robotId: detail.id,
    servicePath: digitalOutputServicePath(detail),
    controlId: control.id,
    address: control.address,
    value,
    requestId,
  }
}

function withDigitalOutputActivity(
  state: FleetViewRuntimeState,
  robotIdValue: string,
  controlLabel: string,
  status: 'requested' | 'accepted' | 'failed',
  occurredAt: number,
) {
  return withActivity(state, normalActivityEntry(
    `digital-output:${robotIdValue}:${controlLabel}:${status}:${occurredAt}`,
    robotIdValue,
    'peripheral',
    'Digital output command',
    `${controlLabel} ${status}`,
    occurredAt,
    status === 'failed' ? 'warning' : 'normal',
  ))
}

function mostImportantHardwareItem(diagnostics: FleetRobotHardwareDiagnosticsState) {
  return diagnostics.groups
    .flatMap(group => group.items)
    .find(item => item.state === 'fault')
    ?? diagnostics.groups.flatMap(group => group.items).find(item => item.state === 'warning')
    ?? null
}

export function nextFleetViewRuntime(
  state: FleetViewRuntimeState,
  event: FleetViewRuntimeEvent,
  options: FleetViewRuntimeOptions,
): FleetViewRuntimeResult {
  if (event.type === 'fleet-state-received') {
    const robots = event.data.robots.map(robot => toRuntimeRobot(robot, event.receivedAt))
    const selectedRobotDetail = selectedDetailFromRobots(state, robots, event.receivedAt)
    const taskReadiness = state.deploymentActivationInProgress
      ? deploymentActivationReadiness
      : readyTaskReadiness

    return {
      state: withTaskReadiness({
        ...state,
        robots,
        selectedRobotDetail,
        lastFleetStateReceivedAt: event.receivedAt,
        manualControlPanel: manualControlPanelFor(selectedRobotDetail),
        manualControlAvailable: manualControlAvailableFor(selectedRobotDetail),
      }, taskReadiness),
      effects: [],
    }
  }

  if (event.type === 'select-robot') {
    return {
      state: selectRobot(state, event.robotId, options.now),
      effects: [],
    }
  }

  if (event.type === 'manual-control-robot-selected') {
    return {
      state: selectRobot(state, event.robotId, options.now),
      effects: [],
    }
  }

  if (event.type === 'dashboard-robot-clicked') {
    const selectedState = selectRobot(state, event.robotId, options.now)
    return {
      state: {
        ...selectedState,
        dashboardMap: {
          ...selectedState.dashboardMap,
          centeredRobotId: event.robotId,
        },
      },
      effects: [{ type: 'center-dashboard-on-robot', robotId: event.robotId }],
    }
  }

  if (event.type === 'dashboard-map-view-changed') {
    return {
      state: {
        ...state,
        dashboardMap: {
          ...state.dashboardMap,
          panX: event.panX,
          panY: event.panY,
          zoom: Math.max(0.1, event.zoom),
        },
      },
      effects: [],
    }
  }

  if (event.type === 'task-sequence-preview-requested') {
    return {
      state: {
        ...state,
        taskSequencePreview: buildTaskSequencePreview(event.draft, state.taskReadiness),
      },
      effects: [],
    }
  }

  if (event.type === 'task-activity-received') {
    return {
      state: withActivity(state, normalActivityEntry(
        `task:${event.robotId}:${event.taskId}:${event.status}:${event.occurredAt}`,
        event.robotId,
        'task',
        activityTitle('task', event.status),
        event.taskId,
        event.occurredAt,
      )),
      effects: [],
    }
  }

  if (event.type === 'unit-task-activity-received') {
    return {
      state: withActivity(state, normalActivityEntry(
        `unit-task:${event.robotId}:${event.unitTaskId}:${event.status}:${event.occurredAt}`,
        event.robotId,
        'unit-task',
        activityTitle('unit-task', event.status),
        event.unitTaskId,
        event.occurredAt,
      )),
      effects: [],
    }
  }

  if (event.type === 'manual-control-activity-received') {
    return {
      state: withActivity(state, normalActivityEntry(
        `manual-control:${event.robotId}:${event.occurredAt}`,
        event.robotId,
        'manual-control',
        activityTitle('manual-control', ''),
        event.commandName,
        event.occurredAt,
      )),
      effects: [],
    }
  }

  if (event.type === 'velocity-control-command-requested') {
    const detail = state.selectedRobotDetail
    if (!detail?.commandPathAvailable) {
      return {
        state,
        effects: [],
      }
    }

    const isPoorNetwork = detail.networkState !== 'live'
    const nextState = withManualControlActivity(
      state,
      detail,
      isPoorNetwork ? 'Velocity command sent while Poor Network' : 'Velocity command sent',
      event.occurredAt,
      isPoorNetwork ? 'warning' : 'normal',
    )

    return {
      state: {
        ...nextState,
        manualControlPanel: manualControlPanelFor(nextState.selectedRobotDetail),
        manualControlAvailable: true,
      },
      effects: velocityCommandEffects(detail, event.command, isPoorNetwork),
    }
  }

  if (event.type === 'velocity-control-released') {
    const detail = state.selectedRobotDetail
    if (!detail?.commandPathAvailable) {
      return {
        state,
        effects: [],
      }
    }

    const nextState = withManualControlActivity(
      state,
      detail,
      'Zero velocity sent',
      event.occurredAt,
      detail.networkState === 'live' ? 'normal' : 'warning',
    )

    return {
      state: {
        ...nextState,
        manualControlPanel: manualControlPanelFor(nextState.selectedRobotDetail),
        manualControlAvailable: true,
      },
      effects: velocityCommandEffects(detail, zeroVelocityCommand(), false),
    }
  }

  if (event.type === 'digital-input-state-received') {
    const currentPeripheral = peripheralForRobot(state, event.robotId)
    return {
      state: withRobotPeripheralState(state, event.robotId, rebuildPeripheralState(currentPeripheral, {
        inputValues: event.values,
        updatedAt: event.receivedAt,
      })),
      effects: [],
    }
  }

  if (event.type === 'digital-output-state-received') {
    const currentPeripheral = peripheralForRobot(state, event.robotId)
    return {
      state: withRobotPeripheralState(state, event.robotId, rebuildPeripheralState(currentPeripheral, {
        outputValues: event.values,
        updatedAt: event.receivedAt,
      })),
      effects: [],
    }
  }

  if (event.type === 'digital-output-command-requested') {
    const detail = detailForRobotCommand(state, event.robotId)
    const control = predefinedDigitalOutputControl(event.controlId)
    if (!detail?.commandPathAvailable || !control) {
      return {
        state,
        effects: [],
      }
    }

    const currentPeripheral = peripheralForRobot(state, event.robotId)
    const currentControl = currentPeripheral.io.controls.find(candidate => candidate.id === event.controlId)
    if (!currentControl || currentControl.disabled) {
      return {
        state,
        effects: [],
      }
    }

    const feedbackByControl = commandFeedbackByControl(currentPeripheral)
    feedbackByControl[event.controlId] = digitalOutputCommandFeedback('pending')
    const nextPeripheral = rebuildPeripheralState(currentPeripheral, { feedbackByControl })
    const requestId = digitalOutputCommandRequestId(event.robotId, event.controlId, event.occurredAt)
    const nextState = withDigitalOutputActivity(
      withRobotPeripheralState(state, event.robotId, nextPeripheral),
      event.robotId,
      control.label,
      'requested',
      event.occurredAt,
    )

    return {
      state: nextState,
      effects: [digitalOutputCommandEffect(detail, control, event.value, requestId)],
    }
  }

  if (event.type === 'digital-output-command-response-received') {
    const control = predefinedDigitalOutputControl(event.controlId)
    if (!control) {
      return {
        state,
        effects: [],
      }
    }

    const currentPeripheral = peripheralForRobot(state, event.robotId)
    const feedbackByControl = commandFeedbackByControl(currentPeripheral)
    feedbackByControl[event.controlId] = digitalOutputCommandFeedback(
      event.success ? 'sent' : 'failed',
      {
        success: event.success,
        message: event.message,
      },
    )
    const nextPeripheral = rebuildPeripheralState(currentPeripheral, { feedbackByControl })
    const nextState = withDigitalOutputActivity(
      withRobotPeripheralState(state, event.robotId, nextPeripheral),
      event.robotId,
      control.label,
      event.success ? 'accepted' : 'failed',
      event.occurredAt,
    )

    return {
      state: nextState,
      effects: [],
    }
  }

  if (event.type === 'hardware-diagnostics-received') {
    const currentRecord = state.robotHardwareDiagnostics[event.robotId]
    const nextRecord: FleetRobotHardwareDiagnosticsRecord = {
      diagnostics: event.diagnostics,
      receivedAt: event.receivedAt,
      showNormal: currentRecord?.showNormal ?? false,
    }
    const nextState = withRobotHardwareDiagnosticsRecord(state, event.robotId, nextRecord, event.receivedAt)
    const diagnostics = hardwareDiagnosticsForRobot(nextState, event.robotId, event.receivedAt)
    const importantItem = mostImportantHardwareItem(diagnostics)

    return {
      state: importantItem
        ? withActivity(nextState, normalActivityEntry(
          `hardware:${event.robotId}:${importantItem.id}:${importantItem.state}:${event.receivedAt}`,
          event.robotId,
          'hardware',
          activityTitle('hardware', importantItem.state === 'fault' ? 'fault' : 'warning'),
          `${importantItem.label}: ${importantItem.message}`,
          event.receivedAt,
          importantItem.state === 'fault' ? 'fault' : 'warning',
        ))
        : nextState,
      effects: [],
    }
  }

  if (event.type === 'hardware-diagnostics-show-normal-changed') {
    const currentRecord = state.robotHardwareDiagnostics[event.robotId] ?? {
      diagnostics: null,
      receivedAt: null,
      showNormal: false,
    }
    return {
      state: withRobotHardwareDiagnosticsRecord(state, event.robotId, {
        ...currentRecord,
        showNormal: event.showNormal,
      }, options.now),
      effects: [],
    }
  }

  if (event.type === 'deployment-activity-received') {
    return {
      state: withActivity(state, normalActivityEntry(
        `deployment:${event.robotId}:${event.levelName}:${event.occurredAt}`,
        event.robotId,
        'deployment',
        activityTitle('deployment', ''),
        event.levelName,
        event.occurredAt,
      )),
      effects: [],
    }
  }

  if (event.type === 'peripheral-activity-received') {
    return {
      state: withActivity(state, normalActivityEntry(
        `peripheral:${event.robotId}:${event.label}:${event.occurredAt}`,
        event.robotId,
        'peripheral',
        activityTitle('peripheral', ''),
        `${event.label}: ${event.value}`,
        event.occurredAt,
      )),
      effects: [],
    }
  }

  if (event.type === 'hardware-diagnostics-activity-received') {
    return {
      state: withActivity(state, normalActivityEntry(
        `hardware:${event.robotId}:${event.diagnosticName}:${event.level}:${event.occurredAt}`,
        event.robotId,
        'hardware',
        activityTitle('hardware', event.level),
        `${event.diagnosticName}: ${event.message}`,
        event.occurredAt,
        event.level,
      )),
      effects: [],
    }
  }

  if (event.type === 'raw-transport-log-received') {
    return {
      state,
      effects: [],
    }
  }

  if (event.type === 'deployment-activation-started') {
    return {
      state: withTaskReadiness({
        ...state,
        deploymentActivationInProgress: true,
      }, deploymentActivationReadiness),
      effects: [],
    }
  }

  if (event.type === 'deployment-activation-finished') {
    const ageMs = state.lastFleetStateReceivedAt == null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, event.now - state.lastFleetStateReceivedAt)

    return {
      state: withTaskReadiness({
        ...state,
        deploymentActivationInProgress: false,
      }, freshnessReadiness(ageMs, false)),
      effects: [],
    }
  }

  if (event.type === 'clock-tick') {
    if (state.lastFleetStateReceivedAt == null) {
      return {
        state,
        effects: [],
      }
    }

    const lastUpdateAgeMs = Math.max(0, event.now - state.lastFleetStateReceivedAt)
    const fleetNetworkState = networkStateForAge(lastUpdateAgeMs)
    const robots = state.robots.map(robot => ({
      ...robot,
      networkState: fleetNetworkState,
      lastUpdateAgeMs,
    }))
    const selectedRobotDetail = selectedDetailFromRobots({
      ...state,
      robots,
    }, robots, event.now)
    const taskReadiness = freshnessReadiness(lastUpdateAgeMs, state.deploymentActivationInProgress)

    return {
      state: withTaskReadiness({
        ...state,
        robots,
        selectedRobotDetail,
        manualControlPanel: manualControlPanelFor(selectedRobotDetail),
        manualControlAvailable: manualControlAvailableFor(selectedRobotDetail),
      }, taskReadiness),
      effects: [],
    }
  }

  return {
    state,
    effects: [],
  }
}
