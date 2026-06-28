import assert from 'node:assert/strict'
import test from 'node:test'
import type { FleetDataMessage, FleetRobotDataMessage } from '../../types.js'
import {
  FLEET_STATE_STALE_MS,
  emptyFleetViewRuntimeState,
  nextFleetViewRuntime,
} from './runtimeModel.js'

function robot(patch: Partial<FleetRobotDataMessage> = {}): FleetRobotDataMessage {
  return {
    robot: 'forklift_1',
    name: 'forklift_1',
    model: 'forklift',
    ip: '10.148.165.8',
    zenohNamespace: 'forklift_1',
    status: 'idle',
    statusDetail: '',
    lastAttemptTime: 0,
    retryPeriodSec: 0,
    mode: 'idle',
    taskId: '',
    activityId: '',
    map: 'L1',
    location: { map: 'L1', levelName: 'L1', hasPose: true, x: 0, y: 0, yaw: 0 },
    hasFootprint: false,
    footprint: {
      isRound: false,
      radius: 0,
      robotLength: 0,
      robotWidth: 0,
      navCenterToRobotCenter: 0,
    },
    hasBattery: false,
    battery: 0,
    hasBatteryPercent: false,
    batteryPercent: 0,
    hasBatteryCurrent: false,
    batteryCurrent: 0,
    hasWheelState: false,
    wheels: { stamp: { sec: 0, nanosec: 0 }, motors: [] },
    hasDiagnostics: false,
    diagnostics: { stamp: { sec: 0, nanosec: 0 }, status: [] },
    hasPalletState: false,
    palletState: {
      palletPresent: false,
      bufferPresent: false,
      palletStock: 0,
      bufferStock: 0,
      raw: [],
    },
    ...patch,
  }
}

function fleetData(robots: FleetRobotDataMessage[]): FleetDataMessage {
  return {
    header: { stamp: { sec: 0, nanosec: 0 }, frameId: '' },
    fleetType: 'forklift',
    name: 'test_fleet',
    seq: 1,
    unixMillisTime: 1000,
    robots,
    pendingRobots: [],
  }
}

test('stale Fleet State becomes Poor Network while task dispatch blocks and Manual Control remains available', () => {
  const received = nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot()]),
    receivedAt: 1000,
  }, { now: 1000 }).state

  const selected = nextFleetViewRuntime(received, {
    type: 'select-robot',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  const stale = nextFleetViewRuntime(selected, {
    type: 'clock-tick',
    now: 1000 + FLEET_STATE_STALE_MS + 1,
  }, { now: 1000 + FLEET_STATE_STALE_MS + 1 }).state

  assert.equal(stale.robots[0]?.networkState, 'poor-network')
  assert.equal(stale.robots[0]?.lastUpdateAgeMs, FLEET_STATE_STALE_MS + 1)
  assert.equal(stale.taskDispatchAvailable, false)
  assert.equal(stale.manualControlAvailable, true)
  assert.deepEqual(stale.robots.map(({ id, name, ip, networkState }) => ({ id, name, ip, networkState })), [{
    id: 'forklift_1',
    name: 'forklift_1',
    ip: '10.148.165.8',
    networkState: 'poor-network',
  }])
})
