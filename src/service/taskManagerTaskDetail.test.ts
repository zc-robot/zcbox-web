import assert from 'node:assert/strict'
import test from 'node:test'
import type { TaskManagerTaskDetail, TaskManagerTaskInfo } from '../types.js'
import { projectTaskManagerTaskDetail } from './taskManagerTaskDetail.js'

test('preserves stored Unit Task parameters across the desktop service boundary', () => {
  const response: TaskManagerTaskDetail = {
    found: true,
    task: {} as TaskManagerTaskInfo,
    unit_tasks: [],
    unit_task_specs: [{
      seq: 0,
      waypoint: '',
      action_name: 'perform_plc_task',
      action_params_json: '{"timeout":200,"task_index":1}',
    }],
    recovery_task_mappings: [],
    message: 'ok',
  }

  const detail = projectTaskManagerTaskDetail(response)

  assert.deepEqual(detail.unit_task_specs, response.unit_task_specs)
})
