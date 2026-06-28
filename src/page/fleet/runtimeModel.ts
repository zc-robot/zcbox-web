import type { FleetDataMessage, FleetRobotDataMessage } from '../../types.js'

export const FLEET_STATE_STALE_MS = 3000
export const FLEET_DISCONNECTED_MS = 10000

export type FleetRobotNetworkState = 'live' | 'poor-network' | 'disconnected' | 'last-known'
export type FleetRobotOverallHealth = 'normal' | 'warning' | 'fault' | 'unknown'

export interface FleetRobotPose {
  x: number
  y: number
  yaw: number
}

export interface FleetViewRuntimeRobot {
  id: string
  name: string
  ip: string
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

export interface FleetViewRuntimeRobotDetail extends FleetViewRuntimeRobot {
  isLastKnown: boolean
}

export interface FleetViewDashboardMapState {
  panX: number
  panY: number
  zoom: number
  centeredRobotId: string
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

function robotId(robot: FleetRobotDataMessage) {
  return robot.name || robot.robot || robot.ip
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
    levelName: robot.location.levelName || robot.location.map || robot.map || '',
    pose: robot.location.hasPose
      ? { x: robot.location.x, y: robot.location.y, yaw: robot.location.yaw }
      : null,
    batteryPercent: robot.hasBatteryPercent ? robot.batteryPercent : null,
    currentTaskId: robot.taskId || '',
    currentUnitTaskId: robot.activityId || '',
    mode: robot.mode || robot.status || '',
    overallHealth: robotOverallHealth(robot),
    commandPathAvailable: Boolean((robot.zenohNamespace || '').trim()),
    networkState: 'live',
    lastUpdateAgeMs: 0,
    lastSeenAt: receivedAt,
  }
}

function toRobotDetail(robot: FleetViewRuntimeRobot, isLastKnown: boolean): FleetViewRuntimeRobotDetail {
  return {
    ...robot,
    isLastKnown,
  }
}

function markLastKnown(detail: FleetViewRuntimeRobotDetail, now: number): FleetViewRuntimeRobotDetail {
  return {
    ...detail,
    isLastKnown: true,
    networkState: 'last-known',
    lastUpdateAgeMs: Math.max(0, now - detail.lastSeenAt),
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
  if (selectedRobot)
    return toRobotDetail(selectedRobot, false)

  if (state.selectedRobotDetail?.id === state.selectedRobotId)
    return markLastKnown(state.selectedRobotDetail, now)

  return null
}

function manualControlAvailableFor(detail: FleetViewRuntimeRobotDetail | null) {
  return Boolean(detail?.commandPathAvailable)
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
): FleetViewRuntimeState {
  const selectedRobot = state.robots.find(robot => robot.id === robotIdValue)
  const selectedRobotDetail = selectedRobot
    ? toRobotDetail(selectedRobot, false)
    : state.selectedRobotDetail?.id === robotIdValue
      ? state.selectedRobotDetail
      : null

  return {
    ...state,
    selectedRobotId: robotIdValue,
    selectedRobotDetail,
    manualControlAvailable: manualControlAvailableFor(selectedRobotDetail),
  }
}

export function nextFleetViewRuntime(
  state: FleetViewRuntimeState,
  event: FleetViewRuntimeEvent,
  _options: FleetViewRuntimeOptions,
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
        manualControlAvailable: manualControlAvailableFor(selectedRobotDetail),
      }, taskReadiness),
      effects: [],
    }
  }

  if (event.type === 'select-robot') {
    return {
      state: selectRobot(state, event.robotId),
      effects: [],
    }
  }

  if (event.type === 'dashboard-robot-clicked') {
    const selectedState = selectRobot(state, event.robotId)
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
