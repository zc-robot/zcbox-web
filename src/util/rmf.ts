import type { DoorType, GridInfoMessage, NavDoor, NavLift, NavPath, NavPoint, NavProfile } from '@/types'

const DEFAULT_PIXEL_TO_METER = 0.05
const DEFAULT_MEASUREMENT_PIXEL_LENGTH = 20

export interface RmfExportLevelSource {
  levelName: string
  drawingFilename: string
  gridInfo: GridInfoMessage
  profile: NavProfile
}

interface BuildRmfBuildingYamlOptions {
  buildingName: string
}

interface PixelPoint {
  x: number
  y: number
}

interface DoorVertexPair {
  door: NavDoor
  startIndex: number
  endIndex: number
}

interface LevelBuildData {
  source: RmfExportLevelSource
  pointIndexMap: Map<string, number>
  vertexLines: string[]
  doorPairs: DoorVertexPair[]
}

interface LiftAccumulator {
  name: string
  width: number
  depth: number
  doorWidth: number
  x: number
  y: number
  yaw: number
  levels: string[]
}

function formatNumber(value: number, digits = 3) {
  if (!Number.isFinite(value))
    return '0'

  const rounded = Number(value.toFixed(digits))
  return Object.is(rounded, -0) ? '0' : `${rounded}`
}

function formatYamlString(value: string) {
  return JSON.stringify(value)
}

function formatInlineValue(value: boolean | number | string | Array<boolean | number | string>) {
  if (Array.isArray(value))
    return `[${value.map(item => formatInlineValue(item)).join(', ')}]`

  if (typeof value === 'string')
    return formatYamlString(value)

  if (typeof value === 'number')
    return formatNumber(value)

  return value ? 'true' : 'false'
}

function formatInlineObject(entries: Array<[string, boolean | number | string | Array<boolean | number | string>]>) {
  if (entries.length === 0)
    return '{}'

  return `{${entries.map(([key, value]) => `${key}: ${formatInlineValue(value)}`).join(', ')}}`
}

function mapToPixel(point: PixelPoint, gridInfo: GridInfoMessage): PixelPoint {
  const topLeftY = -(gridInfo.origin.position.y + gridInfo.height * gridInfo.resolution)

  return {
    x: (point.x - gridInfo.origin.position.x) / gridInfo.resolution,
    y: (point.y - topLeftY) / gridInfo.resolution,
  }
}

function navPointToPixel(point: NavPoint, gridInfo: GridInfoMessage) {
  return mapToPixel({ x: point.x, y: point.y }, gridInfo)
}

function getSharedBounds(levels: RmfExportLevelSource[]) {
  const width = Math.max(12, Math.min(...levels.map(level => level.gridInfo.width)))
  const height = Math.max(12, Math.min(...levels.map(level => level.gridInfo.height)))
  return { width, height }
}

function getSharedMeasurementVertices(levels: RmfExportLevelSource[]) {
  const bounds = getSharedBounds(levels)
  const startX = Math.max(4, Math.min(20, bounds.width - 2))
  const startY = Math.max(4, Math.min(20, bounds.height - 2))
  const availableLength = Math.max(1, bounds.width - startX - 4)
  const pixelLength = Math.max(1, Math.min(DEFAULT_MEASUREMENT_PIXEL_LENGTH, availableLength))

  return [
    { x: startX, y: startY },
    { x: startX + pixelLength, y: startY },
  ]
}

function getSharedFiducials(levels: RmfExportLevelSource[]) {
  const bounds = getSharedBounds(levels)
  const marginX = Math.max(4, Math.min(24, bounds.width * 0.1))
  const marginY = Math.max(4, Math.min(24, bounds.height * 0.1))
  const left = marginX
  const top = marginY
  const right = Math.max(left + 1, bounds.width - marginX)
  const bottom = Math.max(top + 1, bounds.height - marginY)

  return [
    { x: left, y: top, label: 'F1' },
    { x: right, y: top, label: 'F2' },
    { x: (left + right) / 2, y: bottom, label: 'F3' },
  ]
}

function measurementDistanceInMeters(start: PixelPoint, end: PixelPoint) {
  return Math.hypot(end.x - start.x, end.y - start.y) * DEFAULT_PIXEL_TO_METER
}

function getDoorMotionDegrees(doorType: DoorType) {
  return doorType.includes('hinged') ? 90 : 0
}

function buildVertexLine(x: number, y: number, name = '', attributes: Array<[string, boolean | number | string | Array<boolean | number | string>]> = []) {
  const parts = [
    formatNumber(x),
    formatNumber(y),
    '0',
    name || '""',
  ]

  if (attributes.length > 0)
    parts.push(formatInlineObject(attributes))

  return `      - [${parts.join(', ')}]`
}

function buildPointVertexLine(point: NavPoint, gridInfo: GridInfoMessage) {
  const pixelPoint = navPointToPixel(point, gridInfo)
  const attributes: Array<[string, boolean | number | string | Array<boolean | number | string>]> = []
  if (point.is_charger)
    attributes.push(['is_charger', [4, true]])
  if (point.is_parking_spot)
    attributes.push(['is_parking_spot', [4, true]])

  return buildVertexLine(pixelPoint.x, pixelPoint.y, formatYamlString(point.name), attributes)
}

function buildLiftCabinVertexLine(lift: NavLift, gridInfo: GridInfoMessage) {
  const pixelPoint = mapToPixel({ x: lift.x, y: lift.y }, gridInfo)
  return buildVertexLine(pixelPoint.x, pixelPoint.y, '', [['lift_cabin', [1, lift.name]]])
}

function buildDoorEndpoints(door: NavDoor) {
  const theta = door.rotation * Math.PI / 180
  const halfWidth = door.width / 2
  const dx = Math.cos(theta) * halfWidth
  const dy = Math.sin(theta) * halfWidth

  return {
    start: {
      x: door.x - dx,
      y: door.y - dy,
    },
    end: {
      x: door.x + dx,
      y: door.y + dy,
    },
  }
}

function buildLaneLine(path: NavPath, pointIndexMap: Map<string, number>) {
  const startIndex = pointIndexMap.get(path.start.uid)
  const endIndex = pointIndexMap.get(path.end.uid)

  if (startIndex == null || endIndex == null)
    return null

  return `      - [${startIndex}, ${endIndex}, ${formatInlineObject([
    ['bidirectional', [4, true]],
    ['demo_mock_floor_name', [1, '']],
    ['demo_mock_lift_name', [1, '']],
    ['graph_idx', [2, 0]],
    ['mutex', [1, '']],
    ['orientation', [1, '']],
    ['speed_limit', [3, 0]],
  ])}]`
}

function buildDoorLine(doorPair: DoorVertexPair) {
  const { door, startIndex, endIndex } = doorPair
  return `      - [${startIndex}, ${endIndex}, ${formatInlineObject([
    ['motion_axis', [1, 'start']],
    ['motion_degrees', [3, getDoorMotionDegrees(door.door_type)]],
    ['motion_direction', [2, 1]],
    ['name', [1, door.name]],
    ['plugin', [1, 'normal']],
    ['right_left_ratio', [3, 1]],
    ['type', [1, door.door_type]],
  ])}]`
}

function getLiftDoorWidthInPixels(lift: NavLift, gridInfo: GridInfoMessage) {
  const widthInMeters = Math.max(0.6, Math.min(lift.width * 0.55, lift.width - 0.4))
  return widthInMeters / gridInfo.resolution
}

function buildLevelData(source: RmfExportLevelSource, measurementVertices: PixelPoint[]) {
  const pointIndexMap = new Map<string, number>()
  const vertexLines = measurementVertices.map(vertex => buildVertexLine(vertex.x, vertex.y))
  let nextVertexIndex = measurementVertices.length

  source.profile.data.waypoints.forEach((point) => {
    pointIndexMap.set(point.uid, nextVertexIndex)
    vertexLines.push(buildPointVertexLine(point, source.gridInfo))
    nextVertexIndex += 1
  })

  source.profile.data.lifts.forEach((lift) => {
    vertexLines.push(buildLiftCabinVertexLine(lift, source.gridInfo))
    nextVertexIndex += 1
  })

  const doorPairs: DoorVertexPair[] = []
  source.profile.data.doors.forEach((door) => {
    const endpoints = buildDoorEndpoints(door)
    const startPixel = mapToPixel(endpoints.start, source.gridInfo)
    const endPixel = mapToPixel(endpoints.end, source.gridInfo)
    const startIndex = nextVertexIndex
    vertexLines.push(buildVertexLine(startPixel.x, startPixel.y))
    nextVertexIndex += 1
    const endIndex = nextVertexIndex
    vertexLines.push(buildVertexLine(endPixel.x, endPixel.y))
    nextVertexIndex += 1
    doorPairs.push({
      door,
      startIndex,
      endIndex,
    })
  })

  return {
    source,
    pointIndexMap,
    vertexLines,
    doorPairs,
  } satisfies LevelBuildData
}

function buildLevelSection(levelData: LevelBuildData, measurementDistance: number, fiducialLines: string[]) {
  const lanes = levelData.source.profile.data.paths
    .map(path => buildLaneLine(path, levelData.pointIndexMap))
    .filter((line): line is string => line != null)
  const doors = levelData.doorPairs.map(buildDoorLine)

  return [
    `  ${formatYamlString(levelData.source.levelName)}:`,
    `    doors:${doors.length > 0 ? '' : ' []'}`,
    ...doors,
    '    drawing:',
    `      filename: ${formatYamlString(levelData.source.drawingFilename)}`,
    '    elevation: 0',
    '    fiducials:',
    ...fiducialLines,
    `    lanes:${lanes.length > 0 ? '' : ' []'}`,
    ...lanes,
    '    layers:',
    '      {}',
    '    measurements:',
    `      - [0, 1, ${formatInlineObject([['distance', [3, measurementDistance]]])}]`,
    '    vertices:',
    ...levelData.vertexLines,
  ]
}

function buildLiftAccumulators(levels: RmfExportLevelSource[]) {
  const accumulators = new Map<string, LiftAccumulator>()

  levels.forEach((source) => {
    source.profile.data.lifts.forEach((lift) => {
      const liftKey = lift.name || lift.uid
      const pixelPoint = mapToPixel({ x: lift.x, y: lift.y }, source.gridInfo)
      const existing = accumulators.get(liftKey)

      if (!existing) {
        accumulators.set(liftKey, {
          name: liftKey,
          width: lift.width / source.gridInfo.resolution,
          depth: lift.depth / source.gridInfo.resolution,
          doorWidth: getLiftDoorWidthInPixels(lift, source.gridInfo),
          x: pixelPoint.x,
          y: pixelPoint.y,
          yaw: lift.rotation * Math.PI / 180,
          levels: [source.levelName],
        })
        return
      }

      if (!existing.levels.includes(source.levelName))
        existing.levels.push(source.levelName)
    })
  })

  return Array.from(accumulators.values())
}

function buildLiftLines(levels: RmfExportLevelSource[]) {
  const lifts = buildLiftAccumulators(levels)

  return lifts.flatMap((lift) => {
    const firstLevel = lift.levels[0]
    const lastLevel = lift.levels[lift.levels.length - 1]

    return [
      `  ${formatYamlString(lift.name)}:`,
      `    depth: ${formatNumber(lift.depth)}`,
      '    doors:',
      '      door_front:',
      '        door_type: 2',
      '        motion_axis_orientation: 0',
      `        width: ${formatNumber(lift.doorWidth)}`,
      '        x: 0',
      `        y: ${formatNumber(-(lift.depth / 2))}`,
      `    highest_floor: ${formatYamlString(lastLevel)}`,
      `    initial_floor_name: ${formatYamlString(firstLevel)}`,
      '    level_doors:',
      ...lift.levels.map(levelName => `      ${formatYamlString(levelName)}: [door_front]`),
      `    lowest_floor: ${formatYamlString(firstLevel)}`,
      '    plugins: true',
      `    reference_floor_name: ${formatYamlString(firstLevel)}`,
      `    width: ${formatNumber(lift.width)}`,
      `    x: ${formatNumber(lift.x)}`,
      `    y: ${formatNumber(lift.y)}`,
      `    yaw: ${formatNumber(lift.yaw, 6)}`,
    ]
  })
}

export function sanitizeRmfFileName(name: string) {
  const trimmed = name.trim()
  if (!trimmed)
    return 'rmf-site'

  return trimmed
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
}

export function buildRmfBuildingYaml(levels: RmfExportLevelSource[], options: BuildRmfBuildingYamlOptions) {
  if (levels.length === 0)
    return ''

  const measurementVertices = getSharedMeasurementVertices(levels)
  const fiducials = getSharedFiducials(levels)
  const measurementDistance = measurementDistanceInMeters(measurementVertices[0], measurementVertices[1])
  const fiducialLines = fiducials
    .map(fiducial => `      - [${formatNumber(fiducial.x)}, ${formatNumber(fiducial.y)}, ${fiducial.label}]`)

  const levelSections = levels
    .map(level => buildLevelData(level, measurementVertices))
    .flatMap(levelData => buildLevelSection(levelData, measurementDistance, fiducialLines))
  const liftLines = buildLiftLines(levels)

  const lines = [
    'coordinate_system: reference_image',
    'crowd_sim:',
    '  agent_groups:',
    '    - {agents_name: [], agents_number: 0, group_id: 0, profile_selector: external_agent, state_selector: external_static, x: 0, y: 0}',
    '  agent_profiles:',
    '    - {ORCA_tau: 1, ORCA_tauObst: 0.40000000000000002, class: 1, max_accel: 0, max_angle_vel: 0, max_neighbors: 10, max_speed: 0, name: external_agent, neighbor_dist: 5, obstacle_set: 1, pref_speed: 0, r: 0.25}',
    '  enable: 0',
    '  goal_sets: []',
    '  model_types: []',
    '  obstacle_set: {class: 1, file_name: "", type: nav_mesh}',
    '  states:',
    '    - {final: 1, goal_set: -1, name: external_static, navmesh_file_name: ""}',
    '  transitions: []',
    '  update_time_step: 0.10000000000000001',
    'graphs:',
    '  {}',
    'levels:',
    ...levelSections,
    `lifts:${liftLines.length > 0 ? '' : ' {}'}`,
    ...liftLines,
    `name: ${formatYamlString(options.buildingName)}`,
  ]

  return `${lines.join('\n')}\n`
}
