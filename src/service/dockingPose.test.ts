import assert from 'node:assert/strict'
import test from 'node:test'
import { createDockingPoseRequest, createDockingWaypoint } from './dockingPose.js'

test('uses the Robot current pose as the final docked pose in the ROS map frame', () => {
  const request = createDockingPoseRequest({
    position: { x: 22.63, y: -57.76, z: 0 },
    orientation: { x: 0, y: 0, z: 0.0349928546, w: 0.9993875625 },
    pyr: { pitch: 0, roll: 0, yaw: 0.07 },
  })

  assert.deepEqual(request, {
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
