import type { TaskManagerTaskInfo, TaskManagerUnitTaskSpec } from '../../types.js'

const taskManagerActiveExecutionStatuses = new Set([
  'PENDING',
  'RUNNING',
  'PAUSING',
  'PAUSED',
  'RESUMING',
  'FINISHING',
  'CANCELING',
  'RECOVERING',
  'RECOVERY_REQUIRED',
])
const legacyCancelableTaskManagerStatuses = new Set(['PENDING', 'RUNNING', 'RECOVERY_REQUIRED'])

export function isActiveTaskManagerTask(task: TaskManagerTaskInfo) {
  return task.status === 'RUNNING'
}

export function getActiveTaskManagerTasks(tasks: TaskManagerTaskInfo[]) {
  return tasks.filter(isActiveTaskManagerTask)
}

export function hasActiveTaskManagerExecution(task: TaskManagerTaskInfo) {
  return Boolean(task.active_task_execution_id) || taskManagerActiveExecutionStatuses.has(task.status)
}

export function getOngoingTaskManagerExecutions(tasks: TaskManagerTaskInfo[]) {
  return tasks.filter(hasActiveTaskManagerExecution)
}

export function isCancelableTaskManagerTask(task: TaskManagerTaskInfo) {
  if (task.allowed_controls !== undefined)
    return task.allowed_controls.includes('CANCEL')

  return legacyCancelableTaskManagerStatuses.has(task.status)
}

export type MultiGoToPoseUnitTasksResult =
  | {
    ok: true
    unitTasks: TaskManagerUnitTaskSpec[]
  }
  | {
    ok: false
    error: string
  }

export interface MultiGoToPoseInput {
  mapName: string
  x: string
  y: string
  heading: string
}

export function buildMultiGoToPoseUnitTasks(
  poses: MultiGoToPoseInput[],
): MultiGoToPoseUnitTasksResult {
  if (poses.length < 2) {
    return {
      ok: false,
      error: 'Add at least two poses.',
    }
  }

  const parsedPoses: Array<{ map_name: string; x: number; y: number; heading: number }> = []
  const coordinateLabels = {
    x: 'X',
    y: 'Y',
    heading: 'Heading',
  } as const

  for (const [index, pose] of poses.entries()) {
    const mapName = pose.mapName.trim()
    if (!mapName) {
      return {
        ok: false,
        error: `Enter a map name for Pose #${index}.`,
      }
    }

    const parsedPose = { map_name: mapName, x: 0, y: 0, heading: 0 }
    for (const coordinate of ['x', 'y', 'heading'] as const) {
      const value = pose[coordinate].trim()
      const label = coordinateLabels[coordinate]
      if (!value) {
        return {
          ok: false,
          error: `Enter ${label} for Pose #${index}.`,
        }
      }

      const parsedValue = Number(value)
      if (!Number.isFinite(parsedValue)) {
        return {
          ok: false,
          error: `${label} for Pose #${index} must be a finite number.`,
        }
      }
      parsedPose[coordinate] = parsedValue
    }

    parsedPoses.push(parsedPose)
  }

  return {
    ok: true,
    unitTasks: parsedPoses.map((pose, seq) => ({
      seq,
      waypoint: '',
      action_name: 'go_to_pose',
      action_params_json: JSON.stringify(pose),
    })),
  }
}
