import type { NavPoint, PoseMessage } from '../types.js'

export interface CalculateDockingPoseRequest {
  frame_id: 'map'
  docked_pose: {
    x: number
    y: number
    yaw: number
  }
}

export interface CalculateDockingPoseData {
  frame_id: 'map'
  docking_start_pose: {
    x: number
    y: number
    yaw: number
  }
  charger_side: 'front' | 'back' | 'left' | 'right'
  offset_distance: number
}

export function createDockingPoseRequest(pose: PoseMessage): CalculateDockingPoseRequest {
  const sinYaw = 2 * (pose.orientation.w * pose.orientation.z + pose.orientation.x * pose.orientation.y)
  const cosYaw = 1 - 2 * (pose.orientation.y ** 2 + pose.orientation.z ** 2)
  const yaw = Number.isFinite(pose.pyr.yaw)
    ? pose.pyr.yaw
    : Math.atan2(sinYaw, cosYaw)

  return {
    frame_id: 'map',
    docked_pose: {
      x: pose.position.x,
      y: pose.position.y,
      yaw,
    },
  }
}

export function createDockingWaypoint(uid: string, result: CalculateDockingPoseData): NavPoint {
  return {
    uid,
    name: `对接起点 ${uid.slice(-3)}`,
    x: result.docking_start_pose.x,
    y: -result.docking_start_pose.y,
    rotation: -result.docking_start_pose.yaw * 180 / Math.PI,
    is_charger: true,
    is_parking_spot: false,
  }
}
