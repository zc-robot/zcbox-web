import type { NavPath, NavPoint } from '../types.js'

export interface LaneGenerationOptions {
  safety_margin: number
  max_distance: number | null
}

export interface GenerateLanesRequest extends LaneGenerationOptions {
  map_id: number
  frame_id: 'map'
  bidirectional: true
  waypoints: Array<{ uid: string; name: string; x: number; y: number }>
}

export interface GenerateLanesData {
  map_id: number
  frame_id: 'map'
  robot_radius: number
  safety_margin: number
  lanes: Array<[number, number, Record<string, unknown>]>
  connected_components: string[][]
  isolated_waypoints: string[]
  invalid_waypoints: Array<{ uid: string; reason: 'outside_map' | 'insufficient_clearance' }>
}

export function createLaneGenerationRequest(mapId: number, points: NavPoint[], options: LaneGenerationOptions): GenerateLanesRequest {
  return {
    map_id: mapId,
    frame_id: 'map',
    bidirectional: true,
    waypoints: points.map(point => ({ uid: point.uid, name: point.name, x: point.x, y: -point.y })),
    ...options,
  }
}

export function createGeneratedLanePaths(points: NavPoint[], lanes: GenerateLanesData['lanes'], existing: NavPath[], nextUid: () => string): NavPath[] {
  const key = (start: string, end: string) => JSON.stringify([start, end].sort())
  const known = new Set(existing.map(path => key(path.start.uid, path.end.uid)))
  const paths: NavPath[] = []
  for (const [startIndex, endIndex] of lanes) {
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || !points[startIndex] || !points[endIndex] || startIndex === endIndex)
      throw new Error('生成结果包含无效的路径点，请重新生成')
    const start = points[startIndex]
    const end = points[endIndex]
    const pair = key(start.uid, end.uid)
    if (known.has(pair))
      continue
    known.add(pair)
    const id = nextUid()
    paths.push({
      uid: id,
      name: `${start.name} → ${end.name}`,
      thickness: 2,
      start: { uid: start.uid, x: start.x, y: start.y },
      end: { uid: end.uid, x: end.x, y: end.y },
      controls: [1 / 3, 2 / 3].map(ratio => ({
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      })),
    })
  }
  return paths
}
