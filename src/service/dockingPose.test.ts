import assert from 'node:assert/strict'
import test from 'node:test'
import { createDockingPoseRequest, createDockingWaypoint } from './dockingPose.js'

test('converts the selected final docked waypoint into the ROS map frame', () => {
  const request = createDockingPoseRequest({
    uid: 'Point_docked',
    name: '最终停靠位姿',
    x: 22.63,
    y: 57.76,
    rotation: -0.07 * 180 / Math.PI,
  })

  assert.deepEqual({
    ...request,
    docked_pose: {
      ...request.docked_pose,
      yaw: Number(request.docked_pose.yaw.toFixed(12)),
    },
  }, {
    frame_id: 'map',
    docked_pose: {
      x: 22.63,
      y: -57.76,
      yaw: 0.07,
    },
  })
})

test('creates a charger waypoint at the calculated docking-start pose', () => {
  const waypoint = createDockingWaypoint('Point_abc123', {
    frame_id: 'map',
    docking_start_pose: {
      x: 21.88183675010208,
      y: -57.81245713550348,
      yaw: 0.07,
    },
    charger_side: 'front',
    offset_distance: 0.75,
  })

  assert.deepEqual(waypoint, {
    uid: 'Point_abc123',
    name: '对接起点 123',
    x: 21.88183675010208,
    y: 57.81245713550348,
    rotation: -0.07 * 180 / Math.PI,
    is_charger: true,
    is_parking_spot: false,
  })
})
