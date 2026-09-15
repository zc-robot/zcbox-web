import type { TaskManagerTaskDetail } from '../types.js'

export function projectTaskManagerTaskDetail(response: TaskManagerTaskDetail): TaskManagerTaskDetail {
  return {
    found: response.found,
    task: response.task,
    unit_tasks: response.unit_tasks,
    unit_task_specs: response.unit_task_specs,
    recovery_task_mappings: response.recovery_task_mappings,
    on_cancel: response.on_cancel,
    on_pause: response.on_pause,
    on_finish: response.on_finish,
    on_resume: response.on_resume,
    lifecycle_configuration_valid: response.lifecycle_configuration_valid,
    lifecycle_configuration_error: response.lifecycle_configuration_error,
    lifecycle_task_executions: response.lifecycle_task_executions,
    recovery_interruptions: response.recovery_interruptions,
    message: response.message,
  }
}
