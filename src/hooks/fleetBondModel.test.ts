import assert from 'node:assert/strict'
import test from 'node:test'
import type { BondStatusMessage } from '../types.js'
import { buildFleetBondTopics, getFleetBondHealth, upsertFleetBond } from './fleetBondModel.js'

function bond(id: string, patch: Partial<BondStatusMessage> = {}): BondStatusMessage {
  return {
    header: {
      stamp: { sec: 621144, nanosec: 576033451 },
      frameId: '',
    },
    id,
    instanceId: `${id}-instance`,
    active: true,
    heartbeatTimeout: 10_000_000_000,
    heartbeatPeriod: 100_000_000,
    ...patch,
  }
}

test('bond heartbeats add new node ids and replace existing ids for the same robot', () => {
  const first = upsertFleetBond({}, 'robot_1', bond('behavior_server'), 1_000)
  const second = upsertFleetBond(first, 'robot_1', bond('controller_server'), 1_100)
  const updated = upsertFleetBond(second, 'robot_1', bond('behavior_server', {
    active: false,
    instanceId: 'replacement-instance',
  }), 1_200)

  assert.deepEqual(Object.keys(updated.robot_1).sort(), ['behavior_server', 'controller_server'])
  assert.equal(updated.robot_1.behavior_server.active, false)
  assert.equal(updated.robot_1.behavior_server.instanceId, 'replacement-instance')
  assert.equal(updated.robot_1.behavior_server.updatedAt, 1_200)
  assert.equal(updated.robot_1.controller_server.updatedAt, 1_100)
})

test('fleet bond topics include one bond subscription per unique robot namespace', () => {
  const robots = [
    { zenohNamespace: '/robot_2/' },
    { zenohNamespace: 'robot_1' },
    { zenohNamespace: 'robot_2' },
    { zenohNamespace: '' },
  ]

  assert.deepEqual(buildFleetBondTopics(robots), ['robot_1/bond', 'robot_2/bond'])
  assert.deepEqual(buildFleetBondTopics(robots, 'robot_fallback'), [
    'robot_1/bond',
    'robot_2/bond',
    'robot_fallback/bond',
  ])
})

test('bond health uses a fixed ten-second stale threshold for every node', () => {
  const fresh = upsertFleetBond({}, 'robot_1', bond('behavior_server', {
    heartbeatTimeout: 4_000_000_000,
  }), 1_000).robot_1.behavior_server

  assert.equal(getFleetBondHealth(fresh, 10_999), 'healthy')
  assert.equal(getFleetBondHealth(fresh, 11_001), 'stale')
  assert.equal(getFleetBondHealth({ ...fresh, active: false }, 1_001), 'inactive')
})
