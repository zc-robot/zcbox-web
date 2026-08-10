import assert from 'node:assert/strict'
import test from 'node:test'
import type { TaskManagerTaskInfo } from '../../types.js'
import { buildMultiGoToPoseUnitTasks, getActiveTaskManagerTasks, getOngoingTaskManagerExecutions, hasActiveTaskManagerExecution, isCancelableTaskManagerTask } from './taskModel.js'

function taskManagerTask(
  status: string,
  name: string,
  allowedControls?: TaskManagerTaskInfo['allowed_controls'],
  activeTaskExecutionId = '',
): TaskManagerTaskInfo {
  return {
    task_id: `task-${name}`,
    task_definition_id: `definition-${name}`,
    latest_task_execution_id: `latest-${name}`,
    active_task_execution_id: activeTaskExecutionId,
    name,
    description: '',
    robot_name: 'forklift_1',
    fleet_name: 'forklift',
    status,
    created_at_unix_ms: 1,
    updated_at_unix_ms: 2,
    execution_created_at_unix_ms: 3,
    execution_updated_at_unix_ms: 4,
    ...(allowedControls === undefined ? {} : { allowed_controls: allowedControls }),
  }
}

test('returns operator-active Tasks without labeling paused or transitional executions as Active', () => {
  const tasks = [
    taskManagerTask('CREATED', 'created'),
    taskManagerTask('PENDING', 'pending'),
    taskManagerTask('RUNNING', 'running'),
    taskManagerTask('PAUSING', 'pausing'),
    taskManagerTask('PAUSED', 'paused'),
    taskManagerTask('RESUMING', 'resuming'),
    taskManagerTask('CANCELING', 'canceling'),
    taskManagerTask('RECOVERY_REQUIRED', 'recovery'),
    taskManagerTask('SUCCEEDED', 'succeeded'),
    taskManagerTask('FAILED', 'failed'),
    taskManagerTask('CANCELED', 'canceled'),
  ]

  assert.deepEqual(
    getActiveTaskManagerTasks(tasks).map(task => task.name),
    ['running'],
  )
})

test('recognizes V2 states that still own an active execution', () => {
  assert.deepEqual(
    ['CREATED', 'PENDING', 'RUNNING', 'PAUSING', 'PAUSED', 'RESUMING', 'CANCELING', 'RECOVERY_REQUIRED', 'SUCCEEDED']
      .filter(status => hasActiveTaskManagerExecution(taskManagerTask(status, status))),
    ['PENDING', 'RUNNING', 'PAUSING', 'PAUSED', 'RESUMING', 'CANCELING', 'RECOVERY_REQUIRED'],
  )
})

test('treats an unknown status with an active execution id conservatively', () => {
  assert.equal(
    hasActiveTaskManagerExecution(taskManagerTask('WAITING_FOR_OPERATOR', 'future', [], 'execution-future')),
    true,
  )
})

test('returns ongoing executions without relabeling them as operator-active Tasks', () => {
  const tasks = [
    taskManagerTask('CREATED', 'created'),
    taskManagerTask('RUNNING', 'running'),
    taskManagerTask('PAUSED', 'paused'),
    taskManagerTask('WAITING_FOR_OPERATOR', 'future', [], 'execution-future'),
    taskManagerTask('SUCCEEDED', 'succeeded'),
  ]

  assert.deepEqual(
    getOngoingTaskManagerExecutions(tasks).map(task => task.name),
    ['running', 'paused', 'future'],
  )
})

test('allows cancellation while a Task is submitted, active, or awaiting recovery', () => {
  assert.deepEqual(
    ['CREATED', 'PENDING', 'RUNNING', 'RECOVERY_REQUIRED', 'SUCCEEDED', 'FAILED', 'CANCELED']
      .filter(status => isCancelableTaskManagerTask(taskManagerTask(status, status))),
    ['PENDING', 'RUNNING', 'RECOVERY_REQUIRED'],
  )
})

test('uses the Task Manager allowed controls instead of reconstructing V2 lifecycle rules', () => {
  assert.equal(isCancelableTaskManagerTask(taskManagerTask('RUNNING', 'blocked', [])), false)
  assert.equal(isCancelableTaskManagerTask(taskManagerTask('PAUSED', 'cancelable', ['CANCEL', 'RESUME'])), true)
})

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
