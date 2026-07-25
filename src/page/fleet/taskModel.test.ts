import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMultiGoToPoseUnitTasks } from './taskModel.js'

test('builds ordered Go To Unit Tasks from the selected Waypoints', () => {
  const result = buildMultiGoToPoseUnitTasks(
    [' Loading_A ', 'Dropoff_B', 'Return_C'],
    ['Loading_A', 'Dropoff_B', 'Return_C'],
  )

  assert.deepEqual(result, {
    ok: true,
    unitTasks: [
      {
        seq: 0,
        waypoint: 'Loading_A',
        action_name: '',
        action_params_json: '{}',
      },
      {
        seq: 1,
        waypoint: 'Dropoff_B',
        action_name: '',
        action_params_json: '{}',
      },
      {
        seq: 2,
        waypoint: 'Return_C',
        action_name: '',
        action_params_json: '{}',
      },
    ],
  })
})

test('requires at least two Waypoints for a multi-stop Task', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks(['Only_Stop'], ['Only_Stop']), {
    ok: false,
    error: 'Add at least two Waypoints.',
  })
})

test('rejects an empty Waypoint without changing the operator-defined order', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks(['Start', '  ', 'Finish'], ['Start', 'Finish']), {
    ok: false,
    error: 'Select Waypoint #1.',
  })
})

test('rejects a Waypoint that is no longer in the live navigation catalog', () => {
  assert.deepEqual(buildMultiGoToPoseUnitTasks(['Start', 'Removed_Stop'], ['Start', 'Finish']), {
    ok: false,
    error: 'Waypoint #1 is no longer available.',
  })
})
