import type { DoorType, NavDoor, NavLift, NavPath, NavPoint, NavProfile } from '@/types'
import { canvasAngleToYaw } from '@/util/transform'

interface BuildRmfBuildingYamlOptions {
  buildingName: string
  levelName?: string
}

interface DoorVertexPair {
  door: NavDoor
  startIndex: number
  endIndex: number
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

function deriveLevelName(profile: NavProfile, preferredLevelName?: string) {
  if (preferredLevelName && preferredLevelName.trim().length > 0)
    return preferredLevelName.trim()

  const liftLevelName = profile.data.lifts
    .map(lift => lift.level_name.trim())
    .find(levelName => levelName.length > 0)

  return liftLevelName || 'L1'
}

function toWorldY(y: number) {
  return -y
}

function buildDoorEndpoints(door: NavDoor) {
  const yaw = canvasAngleToYaw(door.rotation)
  const halfWidth = door.width / 2
  const dx = Math.cos(yaw) * halfWidth
  const dy = Math.sin(yaw) * halfWidth
  const centerY = toWorldY(door.y)

  return {
    start: {
      x: door.x - dx,
      y: centerY - dy,
    },
    end: {
      x: door.x + dx,
      y: centerY + dy,
    },
  }
}

function formatVertex(point: NavPoint) {
  const attributes: Array<[string, boolean | number | string | Array<boolean | number | string>]> = []
  if (point.is_charger)
    attributes.push(['is_charger', [4, true]])
  if (point.is_parking_spot)
    attributes.push(['is_parking_spot', [4, true]])

  return `      - [${formatNumber(point.x)}, ${formatNumber(toWorldY(point.y))}, 0, ${formatYamlString(point.name)}, ${formatInlineObject(attributes)}]`
}

function formatHelperVertex(x: number, y: number) {
  return `      - [${formatNumber(x)}, ${formatNumber(y)}, 0, "", {}]`
}

function formatLane(path: NavPath, pointIndexMap: Map<string, number>) {
  const startIndex = pointIndexMap.get(path.start.uid)
  const endIndex = pointIndexMap.get(path.end.uid)

  if (startIndex == null || endIndex == null)
    return null

  return `      - [${startIndex}, ${endIndex}, ${formatInlineObject([
    ['bidirectional', [4, true]],
    ['graph_idx', [2, 0]],
  ])}]`
}

function getDoorMotionDegrees(doorType: DoorType) {
  return doorType.includes('hinged') ? 90 : 0
}

function formatDoor(doorPair: DoorVertexPair) {
  const { door, startIndex, endIndex } = doorPair
  return `      - [${startIndex}, ${endIndex}, ${formatInlineObject([
    ['motion_axis', [1, 'start']],
    ['motion_degrees', [3, getDoorMotionDegrees(door.door_type)]],
    ['motion_direction', [2, 1]],
    ['name', [1, door.name]],
    ['type', [1, door.door_type]],
  ])}]`
}

function getLiftDoorWidth(lift: NavLift) {
  return Math.max(0.6, Math.min(lift.width * 0.55, lift.width - 0.4))
}

function formatLift(lift: NavLift, levelName: string) {
  const doorWidth = getLiftDoorWidth(lift)
  const liftLevelName = lift.level_name.trim() || levelName
  const worldLiftY = toWorldY(lift.y)

  return [
    `  ${formatYamlString(lift.name)}:`,
    `    depth: ${formatNumber(lift.depth)}`,
    '    doors:',
    '      door_front:',
    '        door_type: 2',
    '        motion_axis_orientation: 0',
    `        width: ${formatNumber(doorWidth)}`,
    '        x: 0',
    `        y: ${formatNumber(-(lift.depth / 2))}`,
    '    level_doors:',
    `      ${formatYamlString(liftLevelName)}: [door_front]`,
    `    reference_floor_name: ${formatYamlString(liftLevelName)}`,
    `    width: ${formatNumber(lift.width)}`,
    `    x: ${formatNumber(lift.x)}`,
    `    y: ${formatNumber(worldLiftY)}`,
    `    yaw: ${formatNumber(canvasAngleToYaw(lift.rotation), 6)}`,
  ]
}

export function sanitizeRmfFileName(name: string) {
  const trimmed = name.trim()
  if (!trimmed)
    return 'rmf-site'

  return trimmed
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
}

export function buildRmfBuildingYaml(profile: NavProfile, options: BuildRmfBuildingYamlOptions) {
  const levelName = deriveLevelName(profile, options.levelName)
  const pointIndexMap = new Map<string, number>()
  const vertices = profile.data.waypoints.map((point, index) => {
    pointIndexMap.set(point.uid, index)
    return formatVertex(point)
  })

  const doorPairs: DoorVertexPair[] = []
  profile.data.doors.forEach((door) => {
    const { start, end } = buildDoorEndpoints(door)
    const startIndex = vertices.length
    vertices.push(formatHelperVertex(start.x, start.y))
    const endIndex = vertices.length
    vertices.push(formatHelperVertex(end.x, end.y))
    doorPairs.push({
      door,
      startIndex,
      endIndex,
    })
  })

  const lanes = profile.data.paths
    .map(path => formatLane(path, pointIndexMap))
    .filter((lane): lane is string => lane != null)

  const doors = doorPairs.map(formatDoor)
  const lifts = profile.data.lifts.flatMap(lift => formatLift(lift, levelName))

  const lines = [
    'levels:',
    `  ${formatYamlString(levelName)}:`,
    `    doors:${doors.length > 0 ? '' : ' []'}`,
    ...doors,
    '    drawing:',
    '      filename: ""',
    '    elevation: 0',
    '    fiducials: []',
    '    flattened_x_offset: 0',
    '    flattened_y_offset: 0',
    '    floors: []',
    `    lanes:${lanes.length > 0 ? '' : ' []'}`,
    ...lanes,
    '    layers: {}',
    '    measurements: []',
    '    models: []',
    `    vertices:${vertices.length > 0 ? '' : ' []'}`,
    ...vertices,
    '    walls: []',
    `lifts:${profile.data.lifts.length > 0 ? '' : ' {}'}`,
    ...lifts,
    `name: ${formatYamlString(options.buildingName)}`,
    `reference_level_name: ${formatYamlString(levelName)}`,
    '',
  ]

  return lines.join('\n')
}
