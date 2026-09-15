import type { TaskManagerLifecycleHookSpec, TaskManagerRecoveryAction, TaskManagerTaskDetail, TaskManagerTaskInfo, TaskManagerUnitTaskInfo, TaskManagerUnitTaskSpec } from '../../types.js'

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
const legacyCancelableTaskManagerStatuses = new Set(['PENDING', 'RUNNING'])

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
  if (task.status === 'RECOVERY_REQUIRED')
    return false

  if (task.allowed_controls !== undefined)
    return task.allowed_controls.includes('CANCEL')

  return legacyCancelableTaskManagerStatuses.has(task.status)
}

export interface TaskManagerRecoveryActionOption {
  action: TaskManagerRecoveryAction
  label: string
  description: string
  requiresConfirmation?: boolean
}

const operatorRecoveryActions: Array<TaskManagerRecoveryActionOption & { control: string }> = [
  {
    control: 'RETRY_LIFECYCLE_HOOK',
    action: 'retry_lifecycle_hook',
    label: 'Retry lifecycle hook',
    description: 'Restart the failed required lifecycle hook from its first Unit Task.',
  },
  {
    control: 'CREATE_RETRY_EXECUTION',
    action: 'create_retry_execution',
    label: 'Create retry execution',
    description: 'Create a new Task Execution, optionally starting from a selected Unit Task.',
  },
  {
    control: 'CANCEL',
    action: 'cancel',
    label: 'Cancel execution',
    description: 'End the recovery-required Task Execution as canceled.',
  },
]

const failedOnCancelLifecycleHookRecoveryActions: TaskManagerRecoveryActionOption[] = [
  {
    action: 'retry_lifecycle_hook',
    label: 'Retry on-cancel cleanup',
    description: 'Run the required on-cancel cleanup hook again.',
    requiresConfirmation: false,
  },
  {
    action: 'accept_lifecycle_failure',
    label: 'Skip cleanup and finish cancellation',
    description: 'Accept the failed on-cancel cleanup hook and finish this Task Execution as canceled.',
    requiresConfirmation: true,
  },
]

export function getTaskManagerRecoveryActions(task: TaskManagerTaskInfo): TaskManagerRecoveryActionOption[] {
  if (task.status !== 'RECOVERY_REQUIRED' || task.allowed_controls === undefined)
    return []

  return operatorRecoveryActions
    .filter(option => task.allowed_controls?.includes(option.control))
    .map(({ action, label, description, requiresConfirmation }) => ({ action, label, description, requiresConfirmation }))
}

export interface TaskManagerRecoveryFailureSummary {
  stage: string
  error: string
}

interface RecoveryFailureCandidate extends TaskManagerRecoveryFailureSummary {
  updatedAt: number
}

function unitTaskFailure(unitTasks: TaskManagerUnitTaskInfo[]) {
  return [...unitTasks]
    .reverse()
    .find(unitTask => unitTask.last_error.trim())
}

function explicitFailureState(...values: string[]) {
  return values.find((value) => {
    const normalized = value.trim().toUpperCase()
    return normalized.includes('FAIL')
      || normalized.includes('ERROR')
      || normalized.includes('TIMEOUT')
      || normalized.includes('EXHAUST')
      || normalized.includes('REJECT')
      || normalized === 'RECOVERY_REQUIRED'
  })?.trim() ?? ''
}

export function hasFailedRequiredOnCancelLifecycleHook(detail: TaskManagerTaskDetail) {
  if (detail.task.status !== 'RECOVERY_REQUIRED')
    return false

  const taskExecutionId = detail.task.active_task_execution_id || detail.task.latest_task_execution_id
  return (detail.lifecycle_task_executions ?? []).some((execution) => {
    if (taskExecutionId && execution.parent_task_execution_id !== taskExecutionId)
      return false

    return execution.phase.trim() === 'on_cancel'
      && execution.policy.trim() === 'required'
      && execution.status.trim().toUpperCase() === 'FAILED'
  })
}

export function getTaskManagerRecoveryActionsForDetail(detail: TaskManagerTaskDetail): TaskManagerRecoveryActionOption[] {
  if (hasFailedRequiredOnCancelLifecycleHook(detail))
    return failedOnCancelLifecycleHookRecoveryActions

  return getTaskManagerRecoveryActions(detail.task)
}

export function getTaskManagerRecoveryFailureSummary(detail: TaskManagerTaskDetail): TaskManagerRecoveryFailureSummary {
  const taskExecutionId = detail.task.active_task_execution_id || detail.task.latest_task_execution_id
  const failedRequiredOnCancelLifecycleHook = (detail.lifecycle_task_executions ?? []).find((execution) => {
    if (taskExecutionId && execution.parent_task_execution_id !== taskExecutionId)
      return false

    return execution.phase.trim() === 'on_cancel'
      && execution.policy.trim() === 'required'
      && execution.status.trim().toUpperCase() === 'FAILED'
  })
  if (detail.task.status === 'RECOVERY_REQUIRED' && failedRequiredOnCancelLifecycleHook) {
    const failedUnitTask = unitTaskFailure(failedRequiredOnCancelLifecycleHook.unit_tasks)
    return {
      stage: 'Lifecycle hook: on_cancel',
      error: failedRequiredOnCancelLifecycleHook.recovery_reason.trim()
        || failedUnitTask?.last_error.trim()
        || explicitFailureState(failedRequiredOnCancelLifecycleHook.result, failedRequiredOnCancelLifecycleHook.status)
        || 'Required on-cancel cleanup failed.',
    }
  }

  const candidates: RecoveryFailureCandidate[] = []

  for (const execution of detail.lifecycle_task_executions ?? []) {
    if (taskExecutionId && execution.parent_task_execution_id !== taskExecutionId)
      continue

    const failedUnitTask = unitTaskFailure(execution.unit_tasks)
    const error = execution.recovery_reason.trim()
      || failedUnitTask?.last_error.trim()
      || explicitFailureState(execution.result, execution.status)
    if (!error)
      continue

    candidates.push({
      stage: execution.phase ? `Lifecycle hook: ${execution.phase}` : 'Lifecycle hook',
      error,
      updatedAt: execution.updated_at_unix_ms,
    })
  }

  for (const interruption of detail.recovery_interruptions ?? []) {
    if (taskExecutionId && interruption.task_execution_id !== taskExecutionId)
      continue

    const latestAttempt = [...interruption.attempts]
      .sort((left, right) => right.updated_at_unix_ms - left.updated_at_unix_ms)[0]
    const failedUnitTask = latestAttempt ? unitTaskFailure(latestAttempt.unit_tasks) : undefined
    const error = failedUnitTask?.last_error.trim()
      || latestAttempt?.supersession_reason.trim()
      || interruption.supersession_reason.trim()
      || explicitFailureState(latestAttempt?.result ?? '', latestAttempt?.status ?? '')
      || interruption.lifecycle_state.trim()
    const interruptedStage = interruption.interrupted_lifecycle_phase.trim()
      || interruption.interrupted_work_kind.trim()
      || interruption.lifecycle_state.trim()
    const recoveryLabel = interruption.recovery_task_index > 0
      ? `Recovery #${interruption.recovery_task_index}`
      : 'Recovery'

    candidates.push({
      stage: interruptedStage ? `${recoveryLabel}: ${interruptedStage}` : recoveryLabel,
      error: error || 'No detailed error was included in the Task Manager snapshot.',
      updatedAt: Math.max(interruption.updated_at_unix_ms, latestAttempt?.updated_at_unix_ms ?? 0),
    })
  }

  for (const unitTask of detail.unit_tasks) {
    if (!unitTask.last_error.trim())
      continue
    candidates.push({
      stage: `Unit Task #${unitTask.seq}`,
      error: unitTask.last_error.trim(),
      updatedAt: 0,
    })
  }

  const latest = candidates.sort((left, right) => right.updatedAt - left.updatedAt)[0]
  return latest
    ? { stage: latest.stage, error: latest.error }
    : {
        stage: 'Recovery',
        error: 'No detailed recovery error was included in the Task Manager snapshot.',
      }
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
  return { ...unitTask }
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
