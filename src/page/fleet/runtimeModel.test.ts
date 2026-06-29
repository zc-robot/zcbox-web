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

test('Robot Detail Hardware Diagnostics defaults to abnormal friendly names and can show normal items', () => {
  const selected = nextFleetViewRuntime(nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot()]),
    receivedAt: 1000,
  }, { now: 1000 }).state, {
    type: 'select-robot',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  const withDiagnostics = nextFleetViewRuntime(selected, {
    type: 'hardware-diagnostics-received',
    robotId: 'forklift_1',
    receivedAt: 1100,
    diagnostics: {
      stamp: { sec: 1, nanosec: 0 },
      status: [
        {
          level: 0,
          name: 'cpu',
          message: 'CPU health normal',
          hardwareId: 'system',
          values: [{ key: 'cpu_temp_celsius', value: '53.6' }],
        },
        {
          level: 1,
          name: 'scan1',
          message: 'No data received',
          hardwareId: 'sensor',
          values: [],
        },
        {
          level: 0,
          name: 'imu/data_raw',
          message: 'Sensor data active',
          hardwareId: 'sensor',
          values: [],
        },
        {
          level: 2,
          name: 'hardware/can/can1',
          message: 'CAN interface missing',
          hardwareId: 'hardware',
          values: [{ key: 'interface', value: 'can1' }],
        },
      ],
    },
  }, { now: 1100 }).state

  assert.equal(withDiagnostics.selectedRobotDetail?.hardwareDiagnostics.showNormal, false)
  assert.equal(withDiagnostics.selectedRobotDetail?.hardwareDiagnostics.summary.state, 'fault')
  assert.deepEqual(withDiagnostics.selectedRobotDetail?.hardwareDiagnostics.groups.map(group => ({
    title: group.title,
    items: group.items.map(item => ({ label: item.label, state: item.state, message: item.message })),
  })), [
    {
      title: 'Sensors',
      items: [{ label: 'Lidar 1', state: 'warning', message: 'No data received' }],
    },
    {
      title: 'Interfaces',
      items: [{ label: 'CAN can1', state: 'fault', message: 'CAN interface missing' }],
    },
  ])

  const showNormal = nextFleetViewRuntime(withDiagnostics, {
    type: 'hardware-diagnostics-show-normal-changed',
    robotId: 'forklift_1',
    showNormal: true,
  }, { now: 1100 }).state

  assert.deepEqual(showNormal.selectedRobotDetail?.hardwareDiagnostics.groups.map(group => ({
    title: group.title,
    labels: group.items.map(item => item.label),
  })), [
    { title: 'Compute', labels: ['CPU'] },
    { title: 'Sensors', labels: ['Lidar 1', 'IMU'] },
    { title: 'Interfaces', labels: ['CAN can1'] },
  ])

  const stale = nextFleetViewRuntime(showNormal, {
    type: 'clock-tick',
    now: 6101,
  }, { now: 6101 }).state
  const staleItems = stale.selectedRobotDetail?.hardwareDiagnostics.groups.flatMap(group => group.items) ?? []

  assert.equal(stale.selectedRobotDetail?.hardwareDiagnostics.summary.state, 'stale')
  assert.equal(staleItems.every(item => item.state === 'stale'), true)
  assert.deepEqual(staleItems.map(item => item.label), ['CPU', 'Lidar 1', 'IMU', 'CAN can1'])
  assert.equal(stale.manualControlAvailable, true)
})

test('Velocity Control under Poor Network emits command, toast, and activity without changing robot pose', () => {
  const received = nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot({
      location: { map: 'L1', levelName: 'L1', hasPose: true, x: 1, y: 2, yaw: 0.5 },
    })]),
    receivedAt: 1000,
  }, { now: 1000 }).state

  const selected = nextFleetViewRuntime(received, {
    type: 'manual-control-robot-selected',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  const stale = nextFleetViewRuntime(selected, {
    type: 'clock-tick',
    now: 1000 + FLEET_STATE_STALE_MS + 1,
  }, { now: 1000 + FLEET_STATE_STALE_MS + 1 }).state

  const commanded = nextFleetViewRuntime(stale, {
    type: 'velocity-control-command-requested',
    command: { linearX: 0.35, angularZ: -0.35 },
    occurredAt: 5000,
  }, { now: 5000 })

  assert.deepEqual(commanded.effects, [
    {
      type: 'send-velocity-command',
      robotId: 'forklift_1',
      commandPath: 'forklift_1/cmd_vel_collision',
      command: { linearX: 0.35, angularZ: -0.35 },
    },
    {
      type: 'show-toast',
      tone: 'warning',
      message: 'Command sent - Poor Network',
    },
  ])
  assert.equal(commanded.state.manualControlAvailable, true)
  assert.equal(commanded.state.manualControlPanel.placement, 'fleet-sidebar')
  assert.equal(commanded.state.manualControlPanel.networkState, 'poor-network')
  assert.equal(commanded.state.manualControlPanel.warning, 'Poor Network')
  assert.equal(commanded.state.selectedRobotDetail?.networkState, 'poor-network')
  assert.equal(commanded.state.selectedRobotDetail?.pose?.x, 1)
  assert.equal(commanded.state.selectedRobotDetail?.pose?.y, 2)
  assert.equal(commanded.state.selectedRobotDetail?.pose?.yaw, 0.5)
  assert.deepEqual(commanded.state.selectedRobotDetail?.activity.slice(-1), [{
    id: 'manual-control:forklift_1:5000',
    robotId: 'forklift_1',
    kind: 'manual-control',
    title: 'Manual control',
    detail: 'Velocity command sent while Poor Network',
    occurredAt: 5000,
    severity: 'warning',
  }])
})

test('Velocity Control release emits a zero velocity command for the selected robot', () => {
  const selected = nextFleetViewRuntime(nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot()]),
    receivedAt: 1000,
  }, { now: 1000 }).state, {
    type: 'manual-control-robot-selected',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  const released = nextFleetViewRuntime(selected, {
    type: 'velocity-control-released',
    occurredAt: 1100,
  }, { now: 1100 })

  assert.deepEqual(released.effects, [{
    type: 'send-velocity-command',
    robotId: 'forklift_1',
    commandPath: 'forklift_1/cmd_vel_collision',
    command: {
      linearX: 0,
      linearY: 0,
      linearZ: 0,
      angularX: 0,
      angularY: 0,
      angularZ: 0,
    },
  }])
  assert.equal(released.state.manualControlAvailable, true)
  assert.equal(released.state.selectedRobotDetail?.activity.slice(-1)[0]?.detail, 'Zero velocity sent')
})

test('Velocity Control stays available when the selected robot has a hardware fault', () => {
  const received = nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot({
      hasDiagnostics: true,
      diagnostics: {
        stamp: { sec: 1, nanosec: 0 },
        status: [{
          level: 2,
          name: 'hardware/can/can1',
          message: 'CAN interface missing',
          hardwareId: 'hardware',
          values: [],
        }],
      },
    })]),
    receivedAt: 1000,
  }, { now: 1000 }).state

  const selected = nextFleetViewRuntime(received, {
    type: 'manual-control-robot-selected',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  assert.equal(selected.selectedRobotDetail?.overallHealth, 'fault')
  assert.equal(selected.manualControlAvailable, true)
  assert.equal(selected.manualControlPanel.available, true)
  assert.equal(selected.manualControlPanel.commandPath, 'forklift_1/cmd_vel_collision')
})

test('Digital Output command response does not change the observed O value before an output update arrives', () => {
  const selected = nextFleetViewRuntime(nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot()]),
    receivedAt: 1000,
  }, { now: 1000 }).state, {
    type: 'select-robot',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  const observedOff = nextFleetViewRuntime(selected, {
    type: 'digital-output-state-received',
    robotId: 'forklift_1',
    values: [false, false, false, false, false, false, false, false],
    receivedAt: 1100,
  }, { now: 1100 }).state

  assert.equal(observedOff.selectedRobotDetail?.peripheral.io.outputs[0]?.label, 'O0')
  assert.equal(observedOff.selectedRobotDetail?.peripheral.io.outputs[5]?.label, 'O5')
  assert.equal(observedOff.selectedRobotDetail?.peripheral.io.outputs[5]?.value, false)
  assert.equal(observedOff.selectedRobotDetail?.peripheral.io.controls[0]?.disabled, false)
  assert.equal(observedOff.selectedRobotDetail?.peripheral.io.controls[0]?.outputId, 'O5')

  const requested = nextFleetViewRuntime(observedOff, {
    type: 'digital-output-command-requested',
    robotId: 'forklift_1',
    controlId: 'fork-extend',
    value: true,
    occurredAt: 1200,
  }, { now: 1200 })

  assert.deepEqual(requested.effects, [{
    type: 'send-digital-output-command',
    robotId: 'forklift_1',
    servicePath: 'forklift_1/dido/write_coil',
    controlId: 'fork-extend',
    address: 805,
    value: true,
    requestId: 'digital-output:forklift_1:fork-extend:1200',
  }])
  assert.equal(requested.state.selectedRobotDetail?.peripheral.io.outputs[5]?.value, false)
  assert.equal(requested.state.selectedRobotDetail?.peripheral.io.controls[0]?.commandStatus, 'pending')

  const responded = nextFleetViewRuntime(requested.state, {
    type: 'digital-output-command-response-received',
    robotId: 'forklift_1',
    controlId: 'fork-extend',
    requestId: 'digital-output:forklift_1:fork-extend:1200',
    success: true,
    message: 'success',
    occurredAt: 1250,
  }, { now: 1250 }).state

  assert.equal(responded.selectedRobotDetail?.peripheral.io.outputs[5]?.value, false)
  assert.equal(responded.selectedRobotDetail?.peripheral.io.controls[0]?.commandStatus, 'sent')
  assert.deepEqual(responded.selectedRobotDetail?.peripheral.io.controls[0]?.serviceResponse, {
    success: true,
    message: 'success',
  })

  const observedOn = nextFleetViewRuntime(responded, {
    type: 'digital-output-state-received',
    robotId: 'forklift_1',
    values: [false, false, false, false, false, true, false, false],
    receivedAt: 1300,
  }, { now: 1300 }).state

  assert.equal(observedOn.selectedRobotDetail?.peripheral.io.outputs[5]?.value, true)
  assert.equal(observedOn.selectedRobotDetail?.peripheral.io.controls[0]?.observedState, 'on')
  assert.equal(observedOn.selectedRobotDetail?.activity.slice(-1)[0]?.detail, 'Fork extend accepted')
})

test('Peripheral State shows grouped read-only I values and disabled Unknown predefined O controls', () => {
  const selected = nextFleetViewRuntime(nextFleetViewRuntime(emptyFleetViewRuntimeState, {
    type: 'fleet-state-received',
    data: fleetData([robot()]),
    receivedAt: 1000,
  }, { now: 1000 }).state, {
    type: 'select-robot',
    robotId: 'forklift_1',
  }, { now: 1000 }).state

  assert.deepEqual(selected.selectedRobotDetail?.peripheral.groups.map(group => group.id), [
    'power',
    'motion',
    'fork-lift',
    'shelf-pallet',
    'io',
  ])
  assert.equal(selected.selectedRobotDetail?.peripheral.io.arbitraryAddressEntryAvailable, false)
  assert.deepEqual(selected.selectedRobotDetail?.peripheral.io.outputs.map(output => ({
    label: output.label,
    value: output.value,
    observedState: output.observedState,
  })), [
    { label: 'O0', value: null, observedState: 'unknown' },
    { label: 'O1', value: null, observedState: 'unknown' },
    { label: 'O2', value: null, observedState: 'unknown' },
    { label: 'O3', value: null, observedState: 'unknown' },
    { label: 'O4', value: null, observedState: 'unknown' },
    { label: 'O5', value: null, observedState: 'unknown' },
    { label: 'O6', value: null, observedState: 'unknown' },
    { label: 'O7', value: null, observedState: 'unknown' },
  ])
  assert.deepEqual(selected.selectedRobotDetail?.peripheral.io.controls.map(control => ({
    id: control.id,
    outputId: control.outputId,
    disabled: control.disabled,
    observedState: control.observedState,
  })), [
    { id: 'fork-extend', outputId: 'O5', disabled: true, observedState: 'unknown' },
    { id: 'fork-retract', outputId: 'O6', disabled: true, observedState: 'unknown' },
    { id: 'fork-power', outputId: 'O7', disabled: true, observedState: 'unknown' },
  ])

  const ignoredCommand = nextFleetViewRuntime(selected, {
    type: 'digital-output-command-requested',
    robotId: 'forklift_1',
    controlId: 'fork-extend',
    value: true,
    occurredAt: 1050,
  }, { now: 1050 })

  assert.deepEqual(ignoredCommand.effects, [])
  assert.equal(ignoredCommand.state.selectedRobotDetail?.peripheral.io.controls[0]?.commandStatus, 'idle')

  const withInputs = nextFleetViewRuntime(selected, {
    type: 'digital-input-state-received',
    robotId: 'forklift_1',
    values: [true, false, true],
    receivedAt: 1100,
  }, { now: 1100 }).state

  assert.deepEqual(withInputs.selectedRobotDetail?.peripheral.io.inputs, [
    { id: 'I0', label: 'I0', index: 0, value: true, observedState: 'on', readOnly: true },
    { id: 'I1', label: 'I1', index: 1, value: false, observedState: 'off', readOnly: true },
    { id: 'I2', label: 'I2', index: 2, value: true, observedState: 'on', readOnly: true },
  ])
})
