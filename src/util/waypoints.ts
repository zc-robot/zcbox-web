import type { NavPoint } from '@/types'

export const MAX_LINE_WAYPOINTS = 200
export const MIN_LINE_WAYPOINT_SPACING = 0.05

export type LineWaypointMode = 'count' | 'spacing'

export interface Point2D {
  x: number
  y: number
}

export interface LineWaypointPreviewPoint extends Point2D {
  rotation: number
}

export interface LineWaypointPreview {
  points: LineWaypointPreviewPoint[]
  length: number
  spacing: number
}

export interface LineWaypointOptions {
  mode: LineWaypointMode
  count: number
  spacing: number
}

export interface EvenWaypointLayout {
  orderedPoints: NavPoint[]
  updates: { uid: string; point: Partial<NavPoint> }[]
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeCount(value: number) {
  if (!Number.isFinite(value))
    return 2

  return clamp(Math.round(value), 2, MAX_LINE_WAYPOINTS)
}

function normalizeSpacing(value: number) {
  if (!Number.isFinite(value))
    return 1

  return Math.max(MIN_LINE_WAYPOINT_SPACING, value)
}

export function createLineWaypointPreview(start: Point2D, end: Point2D, options: LineWaypointOptions): LineWaypointPreview {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)

  if (length < 1e-6) {
    return {
      points: [],
      length,
      spacing: 0,
    }
  }

  const pointCount = options.mode === 'count'
    ? normalizeCount(options.count)
    : clamp(Math.round(length / normalizeSpacing(options.spacing)) + 1, 2, MAX_LINE_WAYPOINTS)
  const segments = pointCount - 1
  const spacing = length / segments
  const rotation = Math.atan2(dy, dx) * 180 / Math.PI

  return {
    length,
    spacing,
    points: Array.from({ length: pointCount }, (_, index) => {
      const ratio = index / segments
      return {
        x: start.x + dx * ratio,
        y: start.y + dy * ratio,
        rotation,
      }
    }),
  }
}

export function getEvenlyRedistributedWaypoints(selectedPoints: NavPoint[]): EvenWaypointLayout | null {
  if (selectedPoints.length < 2)
    return null

  let start = selectedPoints[0]
  let end = selectedPoints[selectedPoints.length - 1]
  let maxDistance = Math.hypot(end.x - start.x, end.y - start.y)

  if (maxDistance < 1e-6) {
    selectedPoints.forEach((pointA, indexA) => {
      selectedPoints.slice(indexA + 1).forEach((pointB) => {
        const distance = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y)
        if (distance > maxDistance) {
          start = pointA
          end = pointB
          maxDistance = distance
        }
      })
    })
  }

  if (maxDistance < 1e-6)
    return null

  const vector = {
    x: end.x - start.x,
    y: end.y - start.y,
  }
  const vectorLengthSquared = vector.x ** 2 + vector.y ** 2
  const interior = selectedPoints
    .filter(point => point.uid !== start.uid && point.uid !== end.uid)
    .sort((pointA, pointB) => {
      const projectionA = ((pointA.x - start.x) * vector.x + (pointA.y - start.y) * vector.y) / vectorLengthSquared
      const projectionB = ((pointB.x - start.x) * vector.x + (pointB.y - start.y) * vector.y) / vectorLengthSquared
      return projectionA - projectionB
    })
  const orderedPoints = [start, ...interior, end]

  return {
    orderedPoints,
    updates: orderedPoints.map((point, index) => {
      const ratio = index / (orderedPoints.length - 1)
      return {
        uid: point.uid,
        point: {
          x: start.x + vector.x * ratio,
          y: start.y + vector.y * ratio,
        },
      }
    }),
  }
}
