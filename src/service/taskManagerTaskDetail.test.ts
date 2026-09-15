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
      use_precise_nav: true,
      distance_goal_tolerance: 0.08,
      yaw_goal_tolerance: 0.16,
      target_tf_frame: 'cleaning_target',
      min_linear_velocity: 0.04,
    }],
    recovery_task_mappings: [],
    lifecycle_task_executions: [],
    recovery_interruptions: [],
    message: 'ok',
  }

  const detail = projectTaskManagerTaskDetail(response)

  assert.deepEqual(detail.unit_task_specs, response.unit_task_specs)
  assert.equal(detail.lifecycle_task_executions, response.lifecycle_task_executions)
  assert.equal(detail.recovery_interruptions, response.recovery_interruptions)
})
