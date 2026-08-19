import type { NavPoint } from '../types.js'

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

export function createDockingPoseRequest(waypoint: NavPoint): CalculateDockingPoseRequest {
  return {
    frame_id: 'map',
    docked_pose: {
      x: waypoint.x,
      y: -waypoint.y,
      yaw: -waypoint.rotation * Math.PI / 180,
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
