import type { TaskManagerUnitTaskSpec } from '../../types.js'

export type MultiGoToPoseUnitTasksResult =
  | {
    ok: true
    unitTasks: TaskManagerUnitTaskSpec[]
  }
  | {
    ok: false
    error: string
  }

export function buildMultiGoToPoseUnitTasks(
  waypoints: string[],
  availableWaypoints: readonly string[],
): MultiGoToPoseUnitTasksResult {
  if (waypoints.length < 2) {
    return {
      ok: false,
      error: 'Add at least two Waypoints.',
    }
  }

  const normalizedWaypoints = waypoints.map(waypoint => waypoint.trim())
  const emptyWaypointIndex = normalizedWaypoints.findIndex(waypoint => !waypoint)
  if (emptyWaypointIndex >= 0) {
    return {
      ok: false,
      error: `Select Waypoint #${emptyWaypointIndex}.`,
    }
  }

  const availableWaypointNames = new Set(availableWaypoints.map(waypoint => waypoint.trim()))
  const unavailableWaypointIndex = normalizedWaypoints.findIndex(waypoint => !availableWaypointNames.has(waypoint))
  if (unavailableWaypointIndex >= 0) {
    return {
      ok: false,
      error: `Waypoint #${unavailableWaypointIndex} is no longer available.`,
    }
  }

  return {
    ok: true,
    unitTasks: normalizedWaypoints.map((waypoint, seq) => ({
      seq,
      waypoint,
      action_name: '',
      action_params_json: '{}',
    })),
  }
}
