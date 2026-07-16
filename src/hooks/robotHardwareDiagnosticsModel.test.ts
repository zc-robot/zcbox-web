import assert from 'node:assert/strict'
import test from 'node:test'
import type { FleetDiagnosticStateMessage } from '../types.js'
import {
  buildRobotHardwareDiagnosticsTopic,
  emptyRobotDiagnosticsState,
  nextRobotDiagnosticsState,
} from './robotHardwareDiagnosticsModel.js'
import {
  startRobotHardwareDiagnosticsSubscription,
} from './robotHardwareDiagnosticsSubscription.js'
import type {
  RobotHardwareDiagnosticsAdapter,
  RobotHardwareDiagnosticsMessage,
} from './robotHardwareDiagnosticsSubscription.js'

test('Robot View subscribes to the hardware diagnostics topic under the normalized robot namespace', () => {
  assert.equal(buildRobotHardwareDiagnosticsTopic('/forklift_1/'), 'forklift_1/diagnostics/hardware')
  assert.equal(buildRobotHardwareDiagnosticsTopic(''), 'diagnostics/hardware')
})

test('Robot View keeps the latest hardware diagnostics snapshot', () => {
  const diagnostics: FleetDiagnosticStateMessage = {
    stamp: { sec: 12, nanosec: 34 },
    status: [{
      level: 1,
      name: 'hardware/cpu',
      message: 'Hot',
      hardwareId: 'system',
      values: [{ key: 'temperature_celsius', value: '82' }],
    }],
  }

  const updated = nextRobotDiagnosticsState(emptyRobotDiagnosticsState, {
    type: 'hardware-diagnostics',
    key: 'forklift_1/diagnostics/hardware',
    namespace: 'forklift_1',
    receivedAt: 5000,
    diagnostics,
  })

  assert.equal(updated.connected, true)
  assert.equal(updated.status, 'subscribed')
  assert.equal(updated.topic, 'forklift_1/diagnostics/hardware')
  assert.equal(updated.namespace, 'forklift_1')
  assert.equal(updated.updatedAt, 5000)
  assert.deepEqual(updated.diagnostics, diagnostics)
})

test('closing Robot View diagnostics removes its listener and stops the Zenoh subscription', async () => {
  const listenerRef: { current: ((message: RobotHardwareDiagnosticsMessage) => void) | null } = { current: null }
  let listenerRemoved = false
  let stopCalls = 0
  let startedWith: { host: string; topics: string[] } | null = null
  const adapter: RobotHardwareDiagnosticsAdapter = {
    onMessage(callback) {
      listenerRef.current = callback
      return () => {
        listenerRemoved = true
      }
    },
    async start(options) {
      startedWith = options
      return { ok: true }
    },
    async stop() {
      stopCalls += 1
      return { ok: true }
    },
  }
  const events: string[] = []

  const dispose = startRobotHardwareDiagnosticsSubscription({
    adapter,
    host: '10.148.165.8',
    fetchNamespace: async () => '/forklift_1/',
    onEvent: event => events.push(event.type),
    now: () => 5000,
  })

  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(startedWith, {
    host: '10.148.165.8',
    topics: ['forklift_1/diagnostics/hardware'],
  })
  assert.deepEqual(events, ['starting'])

  assert.ok(listenerRef.current)
  listenerRef.current({
    type: 'hardware-diagnostics',
    key: 'forklift_1/diagnostics/hardware',
    namespace: 'forklift_1',
    stamp: { sec: 1, nanosec: 2 },
    status: [],
  })
  assert.deepEqual(events, ['starting', 'hardware-diagnostics'])

  dispose()
  await Promise.resolve()

  assert.equal(listenerRemoved, true)
  assert.equal(stopCalls, 1)
})
