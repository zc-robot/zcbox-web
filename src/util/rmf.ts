import type { DoorType, GridInfoMessage, NavDoor, NavLift, NavPath, NavPoint, NavProfile } from '../types.js'

const DEFAULT_PIXEL_TO_METER = 0.05
const DEFAULT_MEASUREMENT_PIXEL_LENGTH = 20
const LIFT_ALIGNMENT_FIDUCIAL_LABELS = [
  'ALIGN_LIFT_FRONT_LEFT',
  'ALIGN_LIFT_FRONT_RIGHT',
  'ALIGN_LIFT_BACK_RIGHT',
  'ALIGN_LIFT_BACK_LEFT',
] as const

export interface RmfExportLevelSource {
  levelName: string
  drawingFilename: string
  gridInfo: GridInfoMessage
  profile: NavProfile
}

export interface RmfLiftRectangle {
  x: number
  y: number
  rotation: number
  width: number
  depth: number
}

export interface RmfVisualLiftAlignmentLevel extends RmfLiftRectangle {
  levelName: string
  liftUid: string
}

export interface RmfVisualLiftAlignmentOptions {
  method: 'visual-lift'
  referenceLevelName: string
  levels: RmfVisualLiftAlignmentLevel[]
}

export interface RmfVisualMapAlignmentLevel {
  levelName: string
  liftUid: string
  measurementVertices: [PixelPoint, PixelPoint]
  fiducials: [PixelPoint, PixelPoint, PixelPoint, PixelPoint]
}

export interface RmfVisualMapAlignmentOptions {
  method: 'visual-map'
  referenceLevelName: string
  measurementDistance: number
  levels: RmfVisualMapAlignmentLevel[]
}

export type RmfAlignmentOptions = RmfVisualLiftAlignmentOptions | RmfVisualMapAlignmentOptions

export interface BuildRmfBuildingYamlOptions {
  buildingName: string
  alignment?: RmfAlignmentOptions | null
}

export interface PixelPoint {
  x: number
  y: number
}

export interface RmfAlignmentFiducial extends PixelPoint {
  label: string
}

export interface RmfLevelAlignmentGeometry {
  measurementVertices: [PixelPoint, PixelPoint]
  measurementDistance: number
  fiducials: RmfAlignmentFiducial[]
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

function formatInlineValue(value: boolean | number | string | Array<boolean | number | string>): string {
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

export function mapToPixel(point: PixelPoint, gridInfo: GridInfoMessage): PixelPoint {
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

function getSharedMeasurementVertices(levels: RmfExportLevelSource[]): [PixelPoint, PixelPoint] {
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

function getSharedFiducials(levels: RmfExportLevelSource[]): RmfAlignmentFiducial[] {
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

function measurementDistanceInMapMeters(start: PixelPoint, end: PixelPoint) {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

function isUsableLiftRectangle(lift: RmfLiftRectangle) {
  return Number.isFinite(lift.x)
    && Number.isFinite(lift.y)
    && Number.isFinite(lift.rotation)
    && Number.isFinite(lift.width)
    && Number.isFinite(lift.depth)
    && lift.width > 0
    && lift.depth > 0
}

function isFinitePixelPoint(point: PixelPoint) {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

export function getLiftRectangleCorners(lift: RmfLiftRectangle): [PixelPoint, PixelPoint, PixelPoint, PixelPoint] {
  const theta = lift.rotation * Math.PI / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const halfWidth = lift.width / 2
  const halfDepth = lift.depth / 2
  const localCorners = [
    { x: -halfWidth, y: halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: -halfWidth, y: -halfDepth },
  ] as const

  return localCorners.map(point => ({
    x: lift.x + point.x * cos - point.y * sin,
    y: lift.y + point.x * sin + point.y * cos,
  })) as [PixelPoint, PixelPoint, PixelPoint, PixelPoint]
}

function createDefaultAlignmentGeometry(levels: RmfExportLevelSource[]) {
  const measurementVertices = getSharedMeasurementVertices(levels)
  const fiducials = getSharedFiducials(levels)
  const measurementDistance = measurementDistanceInMeters(measurementVertices[0], measurementVertices[1])

  return new Map(levels.map(level => [
    level.levelName,
    {
      measurementVertices,
      measurementDistance,
      fiducials,
    } satisfies RmfLevelAlignmentGeometry,
  ]))
}

export function createVisualLiftAlignmentGeometry(
  levels: RmfExportLevelSource[],
  alignment: RmfVisualLiftAlignmentOptions,
) {
  const levelSourcesByName = new Map(levels.map(level => [level.levelName, level]))
  const selectedLevels = alignment.levels.filter(level => levelSourcesByName.has(level.levelName))

  if (selectedLevels.length < 2)
    return null

  const alignmentGeometry = new Map<string, RmfLevelAlignmentGeometry>()

  for (const selectedLevel of selectedLevels) {
    if (!isUsableLiftRectangle(selectedLevel))
      return null

    const source = levelSourcesByName.get(selectedLevel.levelName)
    if (!source)
      return null

    const corners = getLiftRectangleCorners(selectedLevel)
    const fiducials = corners.map((corner, index) => ({
      ...mapToPixel(corner, source.gridInfo),
      label: LIFT_ALIGNMENT_FIDUCIAL_LABELS[index],
    }))
    const measurementVertices = [
      mapToPixel(corners[0], source.gridInfo),
      mapToPixel(corners[1], source.gridInfo),
    ] satisfies [PixelPoint, PixelPoint]

    alignmentGeometry.set(selectedLevel.levelName, {
      measurementVertices,
      measurementDistance: measurementDistanceInMapMeters(corners[0], corners[1]),
      fiducials,
    })
  }

  return alignmentGeometry
}

export function createVisualMapAlignmentGeometry(
  levels: RmfExportLevelSource[],
  alignment: RmfVisualMapAlignmentOptions,
) {
  const levelSourcesByName = new Map(levels.map(level => [level.levelName, level]))
  const selectedLevels = alignment.levels.filter(level => levelSourcesByName.has(level.levelName))

  if (selectedLevels.length < 2 || !Number.isFinite(alignment.measurementDistance) || alignment.measurementDistance <= 0)
    return null

  const alignmentGeometry = new Map<string, RmfLevelAlignmentGeometry>()

  for (const selectedLevel of selectedLevels) {
    if (selectedLevel.measurementVertices.length !== 2 || selectedLevel.fiducials.length !== LIFT_ALIGNMENT_FIDUCIAL_LABELS.length)
      return null

    if (!selectedLevel.measurementVertices.every(isFinitePixelPoint) || !selectedLevel.fiducials.every(isFinitePixelPoint))
      return null

    alignmentGeometry.set(selectedLevel.levelName, {
      measurementVertices: selectedLevel.measurementVertices,
      measurementDistance: alignment.measurementDistance,
      fiducials: selectedLevel.fiducials.map((fiducial, index) => ({
        ...fiducial,
        label: LIFT_ALIGNMENT_FIDUCIAL_LABELS[index],
      })),
    })
  }

  return alignmentGeometry
}

function createAlignmentGeometry(levels: RmfExportLevelSource[], alignment?: RmfAlignmentOptions | null) {
  if (alignment?.method === 'visual-lift') {
    const liftGeometry = createVisualLiftAlignmentGeometry(levels, alignment)
    if (liftGeometry && liftGeometry.size === levels.length)
      return liftGeometry
  }

  if (alignment?.method === 'visual-map') {
    const mapGeometry = createVisualMapAlignmentGeometry(levels, alignment)
    if (mapGeometry && mapGeometry.size === levels.length)
      return mapGeometry
  }

  return createDefaultAlignmentGeometry(levels)
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

function getLiftKey(lift: NavLift) {
  const liftName = lift.name.trim()
  return liftName || lift.uid
}

function buildLiftCabinVertexLine(lift: NavLift, gridInfo: GridInfoMessage, liftReferences: Map<string, LiftAccumulator>) {
  const liftKey = getLiftKey(lift)
  const liftReference = liftReferences.get(liftKey)
  const pixelPoint = liftReference ?? mapToPixel({ x: lift.x, y: lift.y }, gridInfo)

  return buildVertexLine(pixelPoint.x, pixelPoint.y, '', [['lift_cabin', [1, liftKey]]])
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

function getLiftDoorWidthInMeters(lift: NavLift) {
  const widthInMeters = Math.max(0.6, Math.min(lift.width * 0.55, lift.width - 0.4))
  return widthInMeters
}

function buildLevelData(source: RmfExportLevelSource, alignmentGeometry: RmfLevelAlignmentGeometry, liftReferences: Map<string, LiftAccumulator>) {
  const pointIndexMap = new Map<string, number>()
  const vertexLines = alignmentGeometry.measurementVertices.map(vertex => buildVertexLine(vertex.x, vertex.y))
  let nextVertexIndex = alignmentGeometry.measurementVertices.length

  source.profile.data.waypoints.forEach((point) => {
    pointIndexMap.set(point.uid, nextVertexIndex)
    vertexLines.push(buildPointVertexLine(point, source.gridInfo))
    nextVertexIndex += 1
  })

  source.profile.data.lifts.forEach((lift) => {
    vertexLines.push(buildLiftCabinVertexLine(lift, source.gridInfo, liftReferences))
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

function buildLevelSection(levelData: LevelBuildData, alignmentGeometry: RmfLevelAlignmentGeometry) {
  const lanes = levelData.source.profile.data.paths
    .map(path => buildLaneLine(path, levelData.pointIndexMap))
    .filter((line): line is string => line != null)
  const doors = levelData.doorPairs.map(buildDoorLine)
  const fiducialLines = alignmentGeometry.fiducials
    .map(fiducial => `      - [${formatNumber(fiducial.x)}, ${formatNumber(fiducial.y)}, ${fiducial.label}]`)

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
    `      - [0, 1, ${formatInlineObject([['distance', [3, alignmentGeometry.measurementDistance]]])}]`,
    '    vertices:',
    ...levelData.vertexLines,
  ]
}

function buildLiftAccumulators(levels: RmfExportLevelSource[]) {
  const accumulators = new Map<string, LiftAccumulator>()

  levels.forEach((source) => {
    source.profile.data.lifts.forEach((lift) => {
      const liftKey = getLiftKey(lift)
      const pixelPoint = mapToPixel({ x: lift.x, y: lift.y }, source.gridInfo)
      const existing = accumulators.get(liftKey)

      if (!existing) {
        accumulators.set(liftKey, {
          name: liftKey,
          width: lift.width,
          depth: lift.depth,
          doorWidth: getLiftDoorWidthInMeters(lift),
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

  return accumulators
}

function buildLiftLines(liftReferences: Map<string, LiftAccumulator>) {
  const lifts = Array.from(liftReferences.values())

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

  const alignmentGeometryByLevel = createAlignmentGeometry(levels, options.alignment)
  const liftReferences = buildLiftAccumulators(levels)

  const levelSections = levels
    .map((level) => {
      const alignmentGeometry = alignmentGeometryByLevel.get(level.levelName)
      if (!alignmentGeometry)
        throw new Error(`Missing RMF alignment geometry for level ${level.levelName}`)

      return buildLevelData(level, alignmentGeometry, liftReferences)
    })
    .flatMap((levelData) => {
      const alignmentGeometry = alignmentGeometryByLevel.get(levelData.source.levelName)
      if (!alignmentGeometry)
        throw new Error(`Missing RMF alignment geometry for level ${levelData.source.levelName}`)

      return buildLevelSection(levelData, alignmentGeometry)
    })
  const liftLines = buildLiftLines(liftReferences)

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
