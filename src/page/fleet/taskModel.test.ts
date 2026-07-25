import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMultiGoToPoseUnitTasks } from './taskModel.js'

test('builds ordered go_to_pose Unit Tasks from X, Y, and yaw inputs', () => {
  const result = buildMultiGoToPoseUnitTasks(
    [
      { x: ' 1.25 ', y: '-2', yaw: '0.5' },
      { x: '0', y: '3.75', yaw: '-1.57' },
      { x: '10', y: '20', yaw: '3.14159' },
    ],
  )

  assert.deepEqual(result, {
    ok: true,
    unitTasks: [
      {
        seq: 0,
        waypoint: '',
        action_name: 'go_to_pose',
        action_params_json: '{"x":1.25,"y":-2,"yaw":0.5}',
      },
      {
        seq: 1,
        waypoint: '',
        action_name: 'go_to_pose',
        action_params_json: '{"x":0,"y":3.75,"yaw":-1.57}',
      },
      {
        seq: 2,
        waypoint: '',
        action_name: 'go_to_pose',
        action_params_json: '{"x":10,"y":20,"yaw":3.14159}',
      },
    ],
  })
})

test('requires at least two poses for a multi-pose Task', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks([{ x: '1', y: '2', yaw: '0' }]), {
    ok: false,
    error: 'Add at least two poses.',
  })
})

test('requires every coordinate without changing the operator-defined order', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks([
    { x: '1', y: '2', yaw: '0' },
    { x: '3', y: ' ', yaw: '1' },
  ]), {
    ok: false,
    error: 'Enter Y for Pose #1.',
  })
})

test('rejects non-finite pose coordinates', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks([
    { x: '1', y: '2', yaw: '0' },
    { x: 'Infinity', y: '4', yaw: '1' },
  ]), {
    ok: false,
    error: 'X for Pose #1 must be a finite number.',
  })
})
