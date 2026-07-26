import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMultiGoToPoseUnitTasks } from './taskModel.js'

test('builds ordered go_to_pose Unit Tasks with the live action parameters', () => {
  const result = buildMultiGoToPoseUnitTasks(
    [
      { mapName: ' L3 ', x: '15.5', y: '-58.5', heading: '0' },
      { mapName: 'L3', x: '22.1', y: '-57.6', heading: '0' },
    ],
  )

  assert.deepEqual(result, {
    ok: true,
    unitTasks: [
      {
        seq: 0,
        waypoint: '',
        action_name: 'go_to_pose',
        action_params_json: '{"map_name":"L3","x":15.5,"y":-58.5,"heading":0}',
      },
      {
        seq: 1,
        waypoint: '',
        action_name: 'go_to_pose',
        action_params_json: '{"map_name":"L3","x":22.1,"y":-57.6,"heading":0}',
      },
    ],
  })
})

test('requires at least two poses for a multi-pose Task', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks([
    { mapName: 'L3', x: '1', y: '2', heading: '0' },
  ]), {
    ok: false,
    error: 'Add at least two poses.',
  })
})

test('requires a map name for every pose', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks([
    { mapName: 'L3', x: '1', y: '2', heading: '0' },
    { mapName: ' ', x: '3', y: '4', heading: '1' },
  ]), {
    ok: false,
    error: 'Enter a map name for Pose #1.',
  })
})

test('requires every coordinate without changing the operator-defined order', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks([
    { mapName: 'L3', x: '1', y: '2', heading: '0' },
    { mapName: 'L3', x: '3', y: ' ', heading: '1' },
  ]), {
    ok: false,
    error: 'Enter Y for Pose #1.',
  })
})

test('rejects non-finite pose coordinates', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks([
    { mapName: 'L3', x: '1', y: '2', heading: '0' },
    { mapName: 'L3', x: 'Infinity', y: '4', heading: '1' },
  ]), {
    ok: false,
    error: 'X for Pose #1 must be a finite number.',
  })
})
