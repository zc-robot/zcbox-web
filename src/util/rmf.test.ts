import assert from 'node:assert/strict'
import test from 'node:test'
import type { GridInfoMessage, NavLift, NavProfile } from '../types.js'
import {
  applyRmfPixelTransform,
  buildRmfBuildingYaml,
  createAlignedMapImageLayout,
  createGridInfoWithImageDimensions,
  createVisualLiftAlignmentGeometry,
  createVisualMapAlignmentGeometry,
  getLiftRectangleCorners,
  mapToPixel,
  transformNavProfileToAlignedMapFrame,
  transformRmfMapImageAlignmentPoint,
  updateRmfMapImageAlignmentRotation,
} from './rmf.js'

function gridInfo(): GridInfoMessage {
  return {
    resolution: 0.05,
    width: 400,
    height: 400,
    origin: {
      position: { x: 0, y: -20, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      pyr: { pitch: 0, roll: 0, yaw: 0 },
    },
  }
}

function lift(patch: Partial<NavLift> = {}): NavLift {
  return {
    uid: 'lift-a',
    name: 'Main Lift',
    x: 4,
    y: 5,
    rotation: 0,
    width: 2,
    depth: 3,
    level_name: 'L1',
    ...patch,
  }
}

function profile(levelName: string, profileLift: NavLift): NavProfile {
  return {
    uid: `${levelName}-profile`,
    map_id: levelName === 'L1' ? 1 : 2,
    name: `${levelName} deployment`,
    description: '',
    data: {
      waypoints: [],
      paths: [],
      doors: [],
      lifts: [profileLift],
    },
    tasks: [],
  }
}

test('visual lift alignment geometry uses the operator-selected lift rectangle for each level', () => {
  const levelOneLift = lift({ uid: 'lift-l1', level_name: 'L1', x: 4, y: 5, rotation: 0 })
  const levelTwoLift = lift({ uid: 'lift-l2', level_name: 'L2', x: 8, y: 6, rotation: 90 })
  const levels = [
    {
      levelName: 'L1',
      drawingFilename: 'L1.png',
      gridInfo: gridInfo(),
      profile: profile('L1', levelOneLift),
    },
    {
      levelName: 'L2',
      drawingFilename: 'L2.png',
      gridInfo: gridInfo(),
      profile: profile('L2', levelTwoLift),
    },
  ]

  const geometry = createVisualLiftAlignmentGeometry(levels, {
    method: 'visual-lift',
    referenceLevelName: 'L1',
    levels: [
      { levelName: 'L1', liftUid: 'lift-l1', ...levelOneLift },
      { levelName: 'L2', liftUid: 'lift-l2', ...levelTwoLift },
    ],
  })

  assert.notEqual(geometry, null)
  const levelOneGeometry = geometry?.get('L1')
  const levelTwoGeometry = geometry?.get('L2')
  assert.ok(levelOneGeometry)
  assert.ok(levelTwoGeometry)
  assert.equal(levelOneGeometry.measurementDistance, 2)
  assert.equal(levelTwoGeometry.measurementDistance, 2)
  assert.deepEqual(
    levelOneGeometry.fiducials.map(fiducial => fiducial.label),
    ['ALIGN_LIFT_FRONT_LEFT', 'ALIGN_LIFT_FRONT_RIGHT', 'ALIGN_LIFT_BACK_RIGHT', 'ALIGN_LIFT_BACK_LEFT'],
  )
  assert.deepEqual(
    levelTwoGeometry.fiducials.map(fiducial => fiducial.label),
    ['ALIGN_LIFT_FRONT_LEFT', 'ALIGN_LIFT_FRONT_RIGHT', 'ALIGN_LIFT_BACK_RIGHT', 'ALIGN_LIFT_BACK_LEFT'],
  )
  assert.notDeepEqual(levelOneGeometry.fiducials, levelTwoGeometry.fiducials)
})

test('lift rectangle corners preserve the deployment lift orientation', () => {
  assert.deepEqual(getLiftRectangleCorners(lift({ x: 10, y: 20, rotation: 0, width: 4, depth: 6 })), [
    { x: 8, y: 23 },
    { x: 12, y: 23 },
    { x: 12, y: 17 },
    { x: 8, y: 17 },
  ])
})

test('RMF export writes visual lift alignment fiducials per level', () => {
  const levelOneLift = lift({ uid: 'lift-l1', level_name: 'L1', x: 4, y: 5, rotation: 0 })
  const levelTwoLift = lift({ uid: 'lift-l2', level_name: 'L2', x: 8, y: 6, rotation: 90 })

  const yaml = buildRmfBuildingYaml([
    {
      levelName: 'L1',
      drawingFilename: 'L1.png',
      gridInfo: gridInfo(),
      profile: profile('L1', levelOneLift),
    },
    {
      levelName: 'L2',
      drawingFilename: 'L2.png',
      gridInfo: gridInfo(),
      profile: profile('L2', levelTwoLift),
    },
  ], {
    buildingName: 'Aligned Site',
    alignment: {
      method: 'visual-lift',
      referenceLevelName: 'L1',
      levels: [
        { levelName: 'L1', liftUid: 'lift-l1', ...levelOneLift },
        { levelName: 'L2', liftUid: 'lift-l2', ...levelTwoLift },
      ],
    },
  })

  assert.match(yaml, /"L1":[\s\S]*ALIGN_LIFT_FRONT_LEFT[\s\S]*"L2":[\s\S]*ALIGN_LIFT_FRONT_LEFT/)
  assert.doesNotMatch(yaml, /- \[\d+(?:\.\d+)?, \d+(?:\.\d+)?, F1\]/)
})

test('visual map alignment geometry uses operator-aligned image fiducials directly', () => {
  const levelOneLift = lift({ uid: 'lift-l1', level_name: 'L1' })
  const levelTwoLift = lift({ uid: 'lift-l2', level_name: 'L2' })
  const levels = [
    {
      levelName: 'L1',
      drawingFilename: 'L1.png',
      gridInfo: gridInfo(),
      profile: profile('L1', levelOneLift),
    },
    {
      levelName: 'L2',
      drawingFilename: 'L2.png',
      gridInfo: gridInfo(),
      profile: profile('L2', levelTwoLift),
    },
  ]

  const geometry = createVisualMapAlignmentGeometry(levels, {
    method: 'visual-map',
    referenceLevelName: 'L1',
    measurementDistance: 2,
    levels: [
      {
        levelName: 'L1',
        liftUid: 'lift-l1',
        fiducials: [
          { x: 10, y: 20 },
          { x: 50, y: 20 },
          { x: 50, y: 80 },
          { x: 10, y: 80 },
        ],
        measurementVertices: [
          { x: 10, y: 20 },
          { x: 50, y: 20 },
        ],
      },
      {
        levelName: 'L2',
        liftUid: 'lift-l2',
        fiducials: [
          { x: 110, y: 120 },
          { x: 150, y: 120 },
          { x: 150, y: 180 },
          { x: 110, y: 180 },
        ],
        measurementVertices: [
          { x: 110, y: 120 },
          { x: 150, y: 120 },
        ],
      },
    ],
  })

  assert.notEqual(geometry, null)
  assert.deepEqual(geometry?.get('L1')?.fiducials, [
    { x: 10, y: 20, label: 'ALIGN_LIFT_FRONT_LEFT' },
    { x: 50, y: 20, label: 'ALIGN_LIFT_FRONT_RIGHT' },
    { x: 50, y: 80, label: 'ALIGN_LIFT_BACK_RIGHT' },
    { x: 10, y: 80, label: 'ALIGN_LIFT_BACK_LEFT' },
  ])
  assert.deepEqual(geometry?.get('L2')?.measurementVertices, [
    { x: 110, y: 120 },
    { x: 150, y: 120 },
  ])
  assert.equal(geometry?.get('L2')?.measurementDistance, 2)
})

test('visual map alignment layout gives every level the same aligned canvas', () => {
  const layout = createAlignedMapImageLayout([
    {
      levelName: 'L1',
      width: 100,
      height: 80,
      transform: { x: 0, y: 0, rotation: 0 },
    },
    {
      levelName: 'L2',
      width: 40,
      height: 30,
      transform: { x: 20, y: 10, rotation: 0 },
    },
  ])

  assert.equal(layout.width, 100)
  assert.equal(layout.height, 80)
  const levelTwoLayout = layout.levels.find(level => level.levelName === 'L2')
  assert.ok(levelTwoLayout)
  assert.deepEqual(applyRmfPixelTransform({ x: 0, y: 0 }, levelTwoLayout.pixelTransform), { x: 20, y: 10 })
})

test('visual map rotation edits keep the selected lift center anchored', () => {
  const image = { width: 100, height: 80 }
  const selectedLiftCenter = { x: 20, y: 20 }
  const initialTransform = { x: 30, y: 30, rotation: 0 }
  const anchoredCenter = transformRmfMapImageAlignmentPoint(selectedLiftCenter, image, initialTransform)
  const nextTransform = updateRmfMapImageAlignmentRotation(initialTransform, image, selectedLiftCenter, 90)
  const nextCenter = transformRmfMapImageAlignmentPoint(selectedLiftCenter, image, nextTransform)

  assert.deepEqual(anchoredCenter, { x: 50, y: 50 })
  assert.ok(Math.abs(nextCenter.x - anchoredCenter.x) < 1e-9)
  assert.ok(Math.abs(nextCenter.y - anchoredCenter.y) < 1e-9)
  assert.notDeepEqual(nextTransform, { ...initialTransform, rotation: 90 })
})

test('visual map lift projection uses decoded image dimensions with the source origin preserved', () => {
  const apiGridInfo = {
    ...gridInfo(),
    width: 502,
    height: 1442,
    origin: {
      ...gridInfo().origin,
      position: { x: 0, y: -204.55, z: 0 },
    },
  }
  const previewGridInfo = createGridInfoWithImageDimensions(apiGridInfo, {
    width: 1442,
    height: 502,
  })
  const l5LiftCenter = { x: 69.26182151943331, y: 180.39773227914995 }
  const staleProjection = mapToPixel(l5LiftCenter, apiGridInfo)
  const previewProjection = mapToPixel(l5LiftCenter, previewGridInfo)

  assert.equal(previewGridInfo.origin.position.y, apiGridInfo.origin.position.y)
  assert.ok(staleProjection.y > previewGridInfo.height)
  assert.ok(previewProjection.x > 0 && previewProjection.x < previewGridInfo.width)
  assert.ok(previewProjection.y > 0 && previewProjection.y < previewGridInfo.height)
})

test('visual map alignment transforms saved lift locations into the aligned map frame', () => {
  const sourceGridInfo = {
    ...gridInfo(),
    width: 100,
    height: 80,
    origin: {
      ...gridInfo().origin,
      position: { x: 0, y: -4, z: 0 },
    },
  }
  const targetGridInfo = {
    ...gridInfo(),
    width: 140,
    height: 120,
    origin: {
      ...gridInfo().origin,
      position: { x: 0, y: -6, z: 0 },
    },
  }
  const sourceProfile = profile('L2', lift({
    uid: 'lift-l2',
    level_name: 'L2',
    x: 1,
    y: 1,
    rotation: 10,
    width: 2,
    depth: 3,
  }))
  const alignedProfile = transformNavProfileToAlignedMapFrame(sourceProfile, sourceGridInfo, targetGridInfo, {
    translateX: 30,
    translateY: 10,
    rotation: 0,
    centerX: 50,
    centerY: 40,
  })

  assert.deepEqual(alignedProfile.data.lifts[0], {
    ...sourceProfile.data.lifts[0],
    x: 2.5,
    y: 1.5,
  })
  assert.deepEqual(sourceProfile.data.lifts[0], {
    uid: 'lift-l2',
    name: 'Main Lift',
    x: 1,
    y: 1,
    rotation: 10,
    width: 2,
    depth: 3,
    level_name: 'L2',
  })
})

test('RMF visual map export shifts fiducials into the shared aligned canvas frame', () => {
  const levelOneLift = lift({ uid: 'lift-l1', level_name: 'L1' })
  const levelTwoLift = lift({ uid: 'lift-l2', level_name: 'L2' })
  const layout = createAlignedMapImageLayout([
    {
      levelName: 'L1',
      width: 100,
      height: 80,
      transform: { x: 0, y: 0, rotation: 0 },
    },
    {
      levelName: 'L2',
      width: 40,
      height: 30,
      transform: { x: 20, y: 10, rotation: 0 },
    },
  ])
  const layoutByLevel = new Map(layout.levels.map(level => [level.levelName, level]))

  const yaml = buildRmfBuildingYaml([
    {
      levelName: 'L1',
      drawingFilename: 'L1.png',
      gridInfo: { ...gridInfo(), width: 100, height: 80 },
      pixelTransform: layoutByLevel.get('L1')?.pixelTransform,
      profile: profile('L1', levelOneLift),
    },
    {
      levelName: 'L2',
      drawingFilename: 'L2.png',
      gridInfo: { ...gridInfo(), width: 40, height: 30 },
      pixelTransform: layoutByLevel.get('L2')?.pixelTransform,
      profile: profile('L2', levelTwoLift),
    },
  ], {
    buildingName: 'Aligned Site',
    alignment: {
      method: 'visual-map',
      referenceLevelName: 'L1',
      measurementDistance: 2,
      levels: [
        {
          levelName: 'L1',
          liftUid: 'lift-l1',
          fiducials: [
            { x: 30, y: 20 },
            { x: 40, y: 20 },
            { x: 40, y: 30 },
            { x: 30, y: 30 },
          ],
          measurementVertices: [
            { x: 30, y: 20 },
            { x: 40, y: 20 },
          ],
        },
        {
          levelName: 'L2',
          liftUid: 'lift-l2',
          fiducials: [
            { x: 10, y: 10 },
            { x: 20, y: 10 },
            { x: 20, y: 20 },
            { x: 10, y: 20 },
          ],
          measurementVertices: [
            { x: 10, y: 10 },
            { x: 20, y: 10 },
          ],
        },
      ],
    },
  })

  assert.match(yaml, /"L1":[\s\S]*- \[30, 20, ALIGN_LIFT_FRONT_LEFT\][\s\S]*"L2":[\s\S]*- \[30, 20, ALIGN_LIFT_FRONT_LEFT\]/)
  assert.match(yaml, /"L2":[\s\S]*- \[30, 20, 0, ""\][\s\S]*- \[40, 20, 0, ""\]/)
})
