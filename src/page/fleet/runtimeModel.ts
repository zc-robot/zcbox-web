import type { FleetDataMessage, FleetRobotDataMessage } from '../../types.js'

export const FLEET_STATE_STALE_MS = 3000

export type FleetRobotNetworkState = 'live' | 'poor-network'

export interface FleetViewRuntimeRobot {
  id: string
  name: string
  ip: string
  commandPathAvailable: boolean
  networkState: FleetRobotNetworkState
  lastUpdateAgeMs: number
}

export interface FleetViewRuntimeState {
  robots: FleetViewRuntimeRobot[]
  selectedRobotId: string
  lastFleetStateReceivedAt: number | null
  taskDispatchAvailable: boolean
  manualControlAvailable: boolean
}

export type FleetViewRuntimeEffect =
  | { type: 'none' }

export interface FleetViewRuntimeResult {
  state: FleetViewRuntimeState
  effects: FleetViewRuntimeEffect[]
}

export type FleetViewRuntimeEvent =
  | { type: 'fleet-state-received'; data: FleetDataMessage; receivedAt: number }
  | { type: 'clock-tick'; now: number }
  | { type: 'select-robot'; robotId: string }

export interface FleetViewRuntimeOptions {
  now: number
}

export const emptyFleetViewRuntimeState: FleetViewRuntimeState = {
  robots: [],
  selectedRobotId: '',
  lastFleetStateReceivedAt: null,
  taskDispatchAvailable: false,
  manualControlAvailable: false,
}

function robotId(robot: FleetRobotDataMessage) {
  return robot.name || robot.robot || robot.ip
}

function toRuntimeRobot(robot: FleetRobotDataMessage): FleetViewRuntimeRobot {
  return {
    id: robotId(robot),
    name: robot.name || robot.robot || '--',
    ip: robot.ip || '',
    commandPathAvailable: Boolean((robot.zenohNamespace || '').trim()),
    networkState: 'live',
    lastUpdateAgeMs: 0,
  }
}

export function nextFleetViewRuntime(
  state: FleetViewRuntimeState,
  event: FleetViewRuntimeEvent,
  _options: FleetViewRuntimeOptions,
): FleetViewRuntimeResult {
  if (event.type === 'fleet-state-received') {
    const robots = event.data.robots.map(toRuntimeRobot)
    const selectedRobot = robots.find(robot => robot.id === state.selectedRobotId)

    return {
      state: {
        robots,
        selectedRobotId: state.selectedRobotId,
        lastFleetStateReceivedAt: event.receivedAt,
        taskDispatchAvailable: true,
        manualControlAvailable: Boolean(selectedRobot?.commandPathAvailable),
      },
      effects: [],
    }
  }

  if (event.type === 'select-robot') {
    const selectedRobot = state.robots.find(robot => robot.id === event.robotId)
    return {
      state: {
        ...state,
        selectedRobotId: event.robotId,
        manualControlAvailable: Boolean(selectedRobot?.commandPathAvailable),
      },
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
    const isStale = lastUpdateAgeMs > FLEET_STATE_STALE_MS
    const robots = state.robots.map(robot => ({
      ...robot,
      networkState: isStale ? 'poor-network' as const : 'live' as const,
      lastUpdateAgeMs,
    }))
    const selectedRobot = robots.find(robot => robot.id === state.selectedRobotId)

    return {
      state: {
        ...state,
        robots,
        taskDispatchAvailable: !isStale,
        manualControlAvailable: Boolean(selectedRobot?.commandPathAvailable),
      },
      effects: [],
    }
  }

  return {
    state,
    effects: [],
  }
}
