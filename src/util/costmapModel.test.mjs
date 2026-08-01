import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { applyCostmapMessage, createCostmapPixels, getCostmapCanvasPlacement } from './costmapModel.ts'

function fullMessage(overrides = {}) {
  return {
    type: 'costmap',
    layer: 'global',
    kind: 'full',
    key: 'robot/global_costmap/costmap',
    frameId: 'map',
    stamp: { sec: 12, nanosec: 34 },
    info: {
      width: 3,
      height: 2,
      resolution: 0.05,
      origin: {
        position: { x: 1.5, y: -2, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    },
    dataBase64: Buffer.from([255, 0, 1, 50, 99, 100]).toString('base64'),
    ...overrides,
  }
}

test('a valid full message establishes a renderable costmap base', () => {
  const result = applyCostmapMessage(null, fullMessage(), 1_000)

  assert.equal(result.kind, 'applied')
  assert.equal(result.grid.frameId, 'map')
  assert.equal(result.grid.info.width, 3)
  assert.equal(result.grid.info.height, 2)
  assert.equal(result.grid.info.origin.pyr.yaw, 0)
  assert.deepEqual(Array.from(result.grid.data), [255, 0, 1, 50, 99, 100])
  assert.equal(result.grid.updatedAt, 1_000)
})

test('an update patches a copy of the current base within its declared bounds', () => {
  const base = applyCostmapMessage(null, fullMessage(), 1_000).grid
  const result = applyCostmapMessage(base, {
    type: 'costmap',
    layer: 'global',
    kind: 'update',
    key: 'robot/global_costmap/costmap_updates',
    frameId: 'map',
    stamp: { sec: 13, nanosec: 35 },
    x: 1,
    y: 1,
    width: 2,
    height: 1,
    dataBase64: Buffer.from([7, 8]).toString('base64'),
  }, 2_000)

  assert.equal(result.kind, 'applied')
  assert.deepEqual(Array.from(result.grid.data), [255, 0, 1, 50, 7, 8])
  assert.deepEqual(Array.from(base.data), [255, 0, 1, 50, 99, 100])
  assert.deepEqual(result.grid.stamp, { sec: 13, nanosec: 35 })
  assert.equal(result.grid.updatedAt, 2_000)
})

test('an update arriving before a full base is ignored', () => {
  const result = applyCostmapMessage(null, {
    type: 'costmap',
    layer: 'local',
    kind: 'update',
    key: 'robot/local_costmap/costmap_updates',
    frameId: 'map',
    stamp: { sec: 13, nanosec: 35 },
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    dataBase64: Buffer.from([100]).toString('base64'),
  }, 2_000)

  assert.deepEqual(result, { kind: 'ignored', reason: 'missing-base', grid: null })
})

test('a full costmap outside the map frame is rejected', () => {
  assert.throws(
    () => applyCostmapMessage(null, fullMessage({ frameId: 'odom' })),
    /unsupported costmap frame: odom/,
  )
})

test('a full costmap with a missing origin coordinate is rejected', () => {
  const message = fullMessage()
  delete message.info.origin.position.y

  assert.throws(
    () => applyCostmapMessage(null, message),
    /costmap origin position y must be finite/,
  )
})

test('costmap pixels flip ROS rows and encode cost as layer-colored opacity', () => {
  const base = applyCostmapMessage(null, fullMessage({
    info: {
      width: 2,
      height: 2,
      resolution: 0.05,
      origin: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    },
    dataBase64: Buffer.from([0, 100, 255, 50]).toString('base64'),
  }), 1_000).grid

  const pixels = createCostmapPixels(base, 'global')

  assert.deepEqual(Array.from(pixels.slice(0, 4)), [0, 0, 0, 0])
  assert.deepEqual(Array.from(pixels.slice(4, 7)), [245, 158, 11])
  assert.equal(pixels[7], 128)
  assert.equal(pixels[11], 0)
  assert.deepEqual(Array.from(pixels.slice(12, 15)), [245, 158, 11])
  assert.equal(pixels[15], 224)
})

test('costmap canvas placement maps a rotated ROS origin into screen coordinates', () => {
  const base = applyCostmapMessage(null, fullMessage({
    info: {
      width: 2,
      height: 3,
      resolution: 0.5,
      origin: {
        position: { x: 4, y: 5, z: 0 },
        orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
      },
    },
    dataBase64: Buffer.from([0, 0, 0, 0, 0, 0]).toString('base64'),
  }), 1_000).grid

  const placement = getCostmapCanvasPlacement(base.info)

  assert.ok(Math.abs(placement.x - 2.5) < 1e-9)
  assert.ok(Math.abs(placement.y + 5) < 1e-9)
  assert.equal(placement.width, 1)
  assert.equal(placement.height, 1.5)
  assert.ok(Math.abs(placement.rotation + 90) < 1e-9)
})
