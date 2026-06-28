import assert from 'node:assert/strict'
import test from 'node:test'
import type { FleetDataMessage, FleetRobotDataMessage } from '../../types.js'
import {
  FLEET_DISCONNECTED_MS,
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

test('selected Robot Detail stays pinned with Last Known State when fresh Fleet State no longer includes the robot', () => {
  const received = nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot({
      batteryPercent: 82,
      hasBatteryPercent: true,
      mode: 'moving',
      taskId: 'task-42',
      activityId: 'go-to-loading-zone',
      location: { map: 'L1', levelName: 'L1', hasPose: true, x: 1.25, y: 2.5, yaw: 0.75 },
    })]),
    receivedAt: 1000,
  }, { now: 1000 }).state

  const selected = nextFleetViewRuntime(received, {
    type: 'dashboard-robot-clicked',
    robotId: 'forklift_1',
  }, { now: 1000 })

  assert.deepEqual(selected.effects, [{ type: 'center-dashboard-on-robot', robotId: 'forklift_1' }])
  assert.equal(selected.state.selectedRobotDetail?.name, 'forklift_1')
  assert.equal(selected.state.selectedRobotDetail?.batteryPercent, 82)
  assert.equal(selected.state.selectedRobotDetail?.currentTaskId, 'task-42')
  assert.equal(selected.state.selectedRobotDetail?.currentUnitTaskId, 'go-to-loading-zone')
  assert.equal(selected.state.selectedRobotDetail?.levelName, 'L1')
  assert.deepEqual(selected.state.selectedRobotDetail?.pose, { x: 1.25, y: 2.5, yaw: 0.75 })
  assert.equal(selected.state.dashboardMap.centeredRobotId, 'forklift_1')

  const disappeared = nextFleetViewRuntime(selected.state, {
    type: 'fleet-state-received',
    data: fleetData([]),
    receivedAt: 2500,
  }, { now: 2500 }).state

  assert.equal(disappeared.robots.length, 0)
  assert.equal(disappeared.selectedRobotId, 'forklift_1')
  assert.equal(disappeared.selectedRobotDetail?.networkState, 'last-known')
  assert.equal(disappeared.selectedRobotDetail?.isLastKnown, true)
  assert.equal(disappeared.selectedRobotDetail?.lastUpdateAgeMs, 1500)
  assert.equal(disappeared.selectedRobotDetail?.name, 'forklift_1')
  assert.equal(disappeared.selectedRobotDetail?.ip, '10.148.165.8')
  assert.equal(disappeared.selectedRobotDetail?.levelName, 'L1')
})

test('Dashboard map view changes are represented as operator-facing pan and zoom state', () => {
  const changed = nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'dashboard-map-view-changed',
    panX: 120,
    panY: -45,
    zoom: 2.25,
  }, { now: 1000 }).state

  assert.deepEqual(changed.dashboardMap, {
    panX: 120,
    panY: -45,
    zoom: 2.25,
    centeredRobotId: '',
  })

  const clamped = nextFleetViewRuntime(changed, {
    type: 'dashboard-map-view-changed',
    panX: 0,
    panY: 0,
    zoom: 0,
  }, { now: 1000 }).state

  assert.equal(clamped.dashboardMap.zoom, 0.1)
})

test('stale Fleet State disables task dispatch while preserving generated Unit Task preview', () => {
  const received = nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot()]),
    receivedAt: 1000,
  }, { now: 1000 }).state

  const selected = nextFleetViewRuntime(received, {
    type: 'select-robot',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  const previewed = nextFleetViewRuntime(selected, {
    type: 'task-sequence-preview-requested',
    draft: {
      templateId: 'go_to_level',
      robotId: 'forklift_1',
      levelName: 'L1',
      destinationName: 'loading_zone',
    },
  }, { now: 1000 }).state

  assert.equal(previewed.taskSequencePreview?.canSubmit, true)
  assert.deepEqual(previewed.taskSequencePreview?.unitTasks, [{
    type: 'go_to',
    robotId: 'forklift_1',
    levelName: 'L1',
    destinationName: 'loading_zone',
  }])

  const stale = nextFleetViewRuntime(previewed, {
    type: 'clock-tick',
    now: 1000 + FLEET_STATE_STALE_MS + 1,
  }, { now: 1000 + FLEET_STATE_STALE_MS + 1 }).state

  assert.equal(stale.taskDispatchAvailable, false)
  assert.equal(stale.manualControlAvailable, true)
  assert.equal(stale.taskSequencePreview?.canSubmit, false)
  assert.deepEqual(stale.taskSequencePreview?.unitTasks, previewed.taskSequencePreview?.unitTasks)
  assert.equal(stale.taskReadiness.message, 'Waiting for fresh fleet state')
  assert.doesNotMatch(stale.taskReadiness.message, /zenoh|namespace|topic/i)
})

test('deployment activation and Fleet Disconnected block task dispatch without disabling Manual Control', () => {
  const received = nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot()]),
    receivedAt: 1000,
  }, { now: 1000 }).state

  const selected = nextFleetViewRuntime(received, {
    type: 'select-robot',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  const previewed = nextFleetViewRuntime(selected, {
    type: 'task-sequence-preview-requested',
    draft: {
      templateId: 'go_to_level',
      robotId: 'forklift_1',
      levelName: 'L1',
      destinationName: 'loading_zone',
    },
  }, { now: 1000 }).state

  const activating = nextFleetViewRuntime(previewed, {
    type: 'deployment-activation-started',
  }, { now: 1000 }).state

  assert.equal(activating.taskDispatchAvailable, false)
  assert.equal(activating.taskSequencePreview?.canSubmit, false)
  assert.equal(activating.taskReadiness.message, 'Deployment activation in progress')
  assert.equal(activating.manualControlAvailable, true)

  const disconnected = nextFleetViewRuntime(previewed, {
    type: 'clock-tick',
    now: 1000 + FLEET_DISCONNECTED_MS + 1,
  }, { now: 1000 + FLEET_DISCONNECTED_MS + 1 }).state

  assert.equal(disconnected.robots[0]?.networkState, 'disconnected')
  assert.equal(disconnected.taskDispatchAvailable, false)
  assert.equal(disconnected.taskSequencePreview?.canSubmit, false)
  assert.equal(disconnected.taskReadiness.message, 'Fleet disconnected')
  assert.equal(disconnected.manualControlAvailable, true)
})

test('Robot Detail shows selected Robot Activity from Unit Task events only for that robot', () => {
  const received = nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([
      robot(),
      robot({
        robot: 'forklift_2',
        name: 'forklift_2',
        ip: '10.148.165.9',
        zenohNamespace: 'forklift_2',
      }),
    ]),
    receivedAt: 1000,
  }, { now: 1000 }).state

  const selected = nextFleetViewRuntime(received, {
    type: 'select-robot',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  const withOtherRobotActivity = nextFleetViewRuntime(selected, {
    type: 'unit-task-activity-received',
    robotId: 'forklift_2',
    unitTaskId: 'go-to-storage',
    status: 'started',
    occurredAt: 1100,
  }, { now: 1100 }).state

  const withSelectedActivity = nextFleetViewRuntime(withOtherRobotActivity, {
    type: 'unit-task-activity-received',
    robotId: 'forklift_1',
    unitTaskId: 'go-to-loading-zone',
    status: 'finished',
    occurredAt: 1200,
  }, { now: 1200 }).state

  assert.deepEqual(withSelectedActivity.selectedRobotDetail?.activity, [{
    id: 'unit-task:forklift_1:go-to-loading-zone:finished:1200',
    robotId: 'forklift_1',
    kind: 'unit-task',
    title: 'Unit task finished',
    detail: 'go-to-loading-zone',
    occurredAt: 1200,
    severity: 'normal',
  }])
})

test('Robot Activity accepts operator events and ignores raw transport logs', () => {
  const selected = nextFleetViewRuntime(nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot()]),
    receivedAt: 1000,
  }, { now: 1000 }).state, {
    type: 'select-robot',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  const withTask = nextFleetViewRuntime(selected, {
    type: 'task-activity-received',
    robotId: 'forklift_1',
    taskId: 'task-42',
    status: 'active',
    occurredAt: 1100,
  }, { now: 1100 }).state

  const withManualControl = nextFleetViewRuntime(withTask, {
    type: 'manual-control-activity-received',
    robotId: 'forklift_1',
    commandName: 'Velocity command sent',
    occurredAt: 1200,
  }, { now: 1200 }).state

  const withDeployment = nextFleetViewRuntime(withManualControl, {
    type: 'deployment-activity-received',
    robotId: 'forklift_1',
    levelName: 'L2',
    occurredAt: 1300,
  }, { now: 1300 }).state

  const withPeripheral = nextFleetViewRuntime(withDeployment, {
    type: 'peripheral-activity-received',
    robotId: 'forklift_1',
    label: 'Fork height',
    value: 'raised',
    occurredAt: 1400,
  }, { now: 1400 }).state

  const withHardware = nextFleetViewRuntime(withPeripheral, {
    type: 'hardware-diagnostics-activity-received',
    robotId: 'forklift_1',
    diagnosticName: 'CAN can1',
    level: 'fault',
    message: 'CAN interface missing',
    occurredAt: 1500,
  }, { now: 1500 }).state

  const afterRawLog = nextFleetViewRuntime(withHardware, {
    type: 'raw-transport-log-received',
    message: 'zenoh namespace /debug/topic failed',
    occurredAt: 1600,
  }, { now: 1600 }).state

  assert.deepEqual(afterRawLog.selectedRobotDetail?.activity.map(entry => entry.kind), [
    'task',
    'manual-control',
    'deployment',
    'peripheral',
    'hardware',
  ])
  assert.deepEqual(afterRawLog.selectedRobotDetail?.activity.map(entry => entry.title), [
    'Task active',
    'Manual control',
    'Level changed',
    'Peripheral state changed',
    'Hardware fault',
  ])
  assert.equal(afterRawLog.selectedRobotDetail?.activity[4]?.severity, 'fault')
  assert.equal(afterRawLog.selectedRobotDetail?.activity.some(entry => /zenoh|namespace|topic|debug/i.test(`${entry.title} ${entry.detail}`)), false)
})
