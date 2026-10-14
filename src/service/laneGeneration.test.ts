import assert from 'node:assert/strict'
import test from 'node:test'
import type { NavPoint } from '../types.js'
import { createGeneratedLanePaths, createLaneGenerationRequest } from './laneGeneration.js'

const points: NavPoint[] = [
  { uid: 'Point-a', name: 'A', x: 3, y: 5, rotation: 0 },
  { uid: 'Point-b', name: 'B', x: 9, y: 8, rotation: 0 },
  { uid: 'Point-c', name: 'C', x: 12, y: 8, rotation: 0 },
]

test('converts editor coordinates to ROS and requests bidirectional lanes', () => {
  assert.deepEqual(createLaneGenerationRequest(7, points, {
    safety_margin: 0.05, max_distance: null,
  }), {
    map_id: 7,
    frame_id: 'map',
    bidirectional: true,
    safety_margin: 0.05,
    max_distance: null,
    waypoints: [
      { uid: 'Point-a', name: 'A', x: 3, y: -5 },
      { uid: 'Point-b', name: 'B', x: 9, y: -8 },
      { uid: 'Point-c', name: 'C', x: 12, y: -8 },
    ],
  })
  assert.equal(points[0].y, 5)
})

test('merges directed pairs into straight editor lanes and preserves existing lanes', () => {
  const existing = createGeneratedLanePaths(points, [[1, 0, {}]], [], () => 'Path-existing')
  const before = structuredClone(existing)
  const paths = createGeneratedLanePaths(points,
    [[0, 1, {}], [1, 0, {}], [1, 2, {}], [2, 1, {}]], existing, () => 'Path-new')
  assert.equal(paths.length, 1)
  assert.deepEqual(paths[0], {
    uid: 'Path-new',
    name: 'B → C',
    thickness: 2,
    start: { uid: 'Point-b', x: 9, y: 8 },
    end: { uid: 'Point-c', x: 12, y: 8 },
    controls: [{ x: 10, y: 8 }, { x: 11, y: 8 }],
  })
  assert.deepEqual(existing, before)
  assert.deepEqual(createGeneratedLanePaths(points, [], existing, () => 'unused'), [])
})

test('rejects invalid lane references before applying a proposal', () => {
  for (const pair of [[0, 3], [-1, 1], [0.5, 1], [1, 1]])
    assert.throws(() => createGeneratedLanePaths(points, [[pair[0], pair[1], {}]], [], () => 'unused'))
})
