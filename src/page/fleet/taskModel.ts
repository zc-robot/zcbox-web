import type { TaskManagerLifecycleHookSpec, TaskManagerTaskDetail, TaskManagerTaskInfo, TaskManagerUnitTaskSpec } from '../../types.js'

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

export type TaskManagerEditableLifecycleHookKey = 'on_cancel' | 'on_pause' | 'on_finish' | 'on_resume'

export interface TaskManagerConfigurationDraft {
  unit_tasks: TaskManagerUnitTaskSpec[]
  on_cancel: TaskManagerLifecycleHookSpec
  on_pause: TaskManagerLifecycleHookSpec
  on_finish: TaskManagerLifecycleHookSpec
  on_resume: TaskManagerLifecycleHookSpec
}

function emptyLifecycleHook(): TaskManagerLifecycleHookSpec {
  return {
    policy: '',
    unit_tasks: [],
  }
}

function copyUnitTaskSpec(unitTask: TaskManagerUnitTaskSpec): TaskManagerUnitTaskSpec {
  return {
    seq: unitTask.seq,
    waypoint: unitTask.waypoint,
    action_name: unitTask.action_name,
    action_params_json: unitTask.action_params_json,
  }
}

function copyLifecycleHook(hook: TaskManagerLifecycleHookSpec | undefined) {
  return hook
    ? {
        policy: hook.policy,
        unit_tasks: hook.unit_tasks.map(copyUnitTaskSpec),
      }
    : emptyLifecycleHook()
}

export function buildTaskManagerConfigurationDraft(detail: TaskManagerTaskDetail): TaskManagerConfigurationDraft {
  const storedUnitTasks = detail.unit_task_specs ?? detail.unit_tasks.map(unitTask => ({
    seq: unitTask.seq,
    waypoint: unitTask.waypoint,
    action_name: unitTask.action_name,
    action_params_json: unitTask.action_params_json ?? (unitTask.action_name ? '' : '{}'),
  }))

  return {
    unit_tasks: storedUnitTasks.map(copyUnitTaskSpec),
    on_cancel: copyLifecycleHook(detail.on_cancel),
    on_pause: copyLifecycleHook(detail.on_pause),
    on_finish: copyLifecycleHook(detail.on_finish),
    on_resume: copyLifecycleHook(detail.on_resume),
  }
}

function validateUnitTaskSequence(unitTasks: TaskManagerUnitTaskSpec[], label: string, required: boolean) {
  if (required && unitTasks.length === 0)
    return `${label} requires at least one Unit Task.`

  const sequences = new Set<number>()
  for (const [index, unitTask] of unitTasks.entries()) {
    if (!Number.isInteger(unitTask.seq) || unitTask.seq < 0)
      return `${label} Unit Task ${index + 1} needs a non-negative integer sequence.`
    if (sequences.has(unitTask.seq))
      return `${label} has more than one Unit Task with sequence ${unitTask.seq}.`
    sequences.add(unitTask.seq)

    const waypoint = unitTask.waypoint.trim()
    const actionName = unitTask.action_name.trim()
    if (!waypoint && !actionName)
      return `${label} Unit Task #${unitTask.seq} needs a waypoint or Action.`

    if (actionName && !unitTask.action_params_json.trim())
      return `${label} Unit Task #${unitTask.seq} needs Action parameters. Re-enter them before saving this configuration.`

    const parameters = unitTask.action_params_json.trim() || '{}'
    try {
      const parsed = JSON.parse(parameters)
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))
        return `${label} Unit Task #${unitTask.seq} Action parameters must be a JSON object.`
    }
    catch {
      return `${label} Unit Task #${unitTask.seq} Action parameters must be valid JSON.`
    }
  }

  return ''
}

export function validateTaskManagerConfigurationDraft(draft: TaskManagerConfigurationDraft) {
  const mainError = validateUnitTaskSequence(draft.unit_tasks, 'Main sequence', true)
  if (mainError)
    return mainError

  const lifecycleHooks: Array<[TaskManagerEditableLifecycleHookKey, string]> = [
    ['on_cancel', 'On cancel'],
    ['on_pause', 'On pause'],
    ['on_finish', 'On finish'],
    ['on_resume', 'On resume'],
  ]
  for (const [key, label] of lifecycleHooks) {
    const hook = draft[key]
    if (hook.unit_tasks.length > 0 && hook.policy !== 'required' && hook.policy !== 'best_effort')
      return `${label} needs a required or best-effort policy.`

    const hookError = validateUnitTaskSequence(hook.unit_tasks, label, false)
    if (hookError)
      return hookError
  }

  return ''
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
