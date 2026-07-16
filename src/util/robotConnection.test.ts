import assert from 'node:assert/strict'
import test from 'node:test'
import {
  UNKNOWN_ROBOT_NAME,
  bindConnectionHistory,
  normalizeConnectionHistory,
  parseRobotNameResponse,
} from './robotConnection.js'

test('robot name is read from supported getRobotName response shapes', () => {
  assert.equal(parseRobotNameResponse({ code: 0, data: 'nest-01' }), 'nest-01')
  assert.equal(parseRobotNameResponse({ data: { robot_name: 'nest-02' } }), 'nest-02')
  assert.equal(parseRobotNameResponse({ robotName: 'nest-03' }), 'nest-03')
  assert.equal(parseRobotNameResponse('nest-04'), 'nest-04')
})

test('missing or unsuccessful robot names fall back to Unknown', () => {
  assert.equal(parseRobotNameResponse({ code: 1, data: 'stale-name' }), UNKNOWN_ROBOT_NAME)
  assert.equal(parseRobotNameResponse({ data: { robot_name: '   ' } }), UNKNOWN_ROBOT_NAME)
  assert.equal(parseRobotNameResponse('<!doctype html><html>Login</html>'), UNKNOWN_ROBOT_NAME)
  assert.equal(parseRobotNameResponse(null), UNKNOWN_ROBOT_NAME)
})

test('legacy IP-only history is migrated to name and IP entries', () => {
  assert.deepEqual(
    normalizeConnectionHistory([
      '10.0.0.2',
      { ip: '10.0.0.3', name: 'nest-03' },
      { ip: '', name: 'invalid' },
    ]),
    [
      { ip: '10.0.0.2', name: UNKNOWN_ROBOT_NAME },
      { ip: '10.0.0.3', name: 'nest-03' },
    ],
  )
})

test('binding a robot name and IP moves that pair to the front and de-duplicates by IP', () => {
  assert.deepEqual(
    bindConnectionHistory([
      { ip: '10.0.0.2', name: 'old-name' },
      { ip: '10.0.0.3', name: 'nest-03' },
    ], '10.0.0.2', 'nest-02'),
    [
      { ip: '10.0.0.2', name: 'nest-02' },
      { ip: '10.0.0.3', name: 'nest-03' },
    ],
  )
})

test('a non-Robot connection can preserve the name already bound to its IP', () => {
  assert.deepEqual(
    bindConnectionHistory(
      [{ ip: '10.0.0.2', name: 'nest-02' }],
      '10.0.0.2',
      UNKNOWN_ROBOT_NAME,
      { preserveExistingName: true },
    ),
    [{ ip: '10.0.0.2', name: 'nest-02' }],
  )
})
