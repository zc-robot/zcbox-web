import type { LineConstraint, NavPoint } from '@/types'

export const MAX_LINE_WAYPOINTS = 200
export const MIN_LINE_WAYPOINT_SPACING = 0.05

export type LineWaypointMode = 'count' | 'spacing'
export type WaypointRenameOrder =
  | 'line'
  | 'reverseLine'
  | 'selection'
  | 'leftToRight'
  | 'rightToLeft'
  | 'topToBottom'
  | 'bottomToTop'

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

export interface WaypointRenameOptions {
  pattern: string
  start: number
  step: number
  order: WaypointRenameOrder
}

export interface WaypointRenamePreviewItem {
  point: NavPoint
  number: number
  name: string
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

export function createLineConstraint(start: Point2D, end: Point2D): LineConstraint {
  return {
    uid: `Line-${Math.random().toString(36).slice(-6)}`,
    start: {
      x: start.x,
      y: start.y,
    },
    end: {
      x: end.x,
      y: end.y,
    },
  }
}

export function projectPointToLineConstraint(point: Point2D, constraint?: LineConstraint): Point2D {
  if (!constraint)
    return point

  const vector = {
    x: constraint.end.x - constraint.start.x,
    y: constraint.end.y - constraint.start.y,
  }
  const vectorLengthSquared = vector.x ** 2 + vector.y ** 2
  if (vectorLengthSquared < 1e-12)
    return point

  const ratio = ((point.x - constraint.start.x) * vector.x + (point.y - constraint.start.y) * vector.y) / vectorLengthSquared
  return {
    x: constraint.start.x + vector.x * ratio,
    y: constraint.start.y + vector.y * ratio,
  }
}

export function translateLineConstraint(constraint: LineConstraint, delta: Point2D): LineConstraint {
  return {
    uid: constraint.uid,
    start: {
      x: constraint.start.x + delta.x,
      y: constraint.start.y + delta.y,
    },
    end: {
      x: constraint.end.x + delta.x,
      y: constraint.end.y + delta.y,
    },
  }
}

export function normalizeRotationDegrees(value: number) {
  if (!Number.isFinite(value))
    return 0

  const normalized = ((value + 180) % 360 + 360) % 360 - 180
  return Number(normalized.toFixed(2))
}

export function rotatePointAround(point: Point2D, center: Point2D, angleDegrees: number): Point2D {
  const angle = angleDegrees * Math.PI / 180
  const dx = point.x - center.x
  const dy = point.y - center.y
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

export function getLineConstraintCenter(constraint: LineConstraint): Point2D {
  return {
    x: (constraint.start.x + constraint.end.x) / 2,
    y: (constraint.start.y + constraint.end.y) / 2,
  }
}

export function rotateLineConstraint(constraint: LineConstraint, center: Point2D, angleDegrees: number): LineConstraint {
  return {
    uid: constraint.uid,
    start: rotatePointAround(constraint.start, center, angleDegrees),
    end: rotatePointAround(constraint.end, center, angleDegrees),
  }
}

export function getWaypointsOnSameLine(points: NavPoint[], point?: NavPoint) {
  const lineUid = point?.line_constraint?.uid
  if (!lineUid)
    return []

  return points.filter(candidate => candidate.line_constraint?.uid === lineUid)
}

export function getLineAwareWaypointGroup(points: NavPoint[], selectedIds: string[]) {
  const selectedIdSet = new Set(selectedIds)
  const selectedPoints = points.filter(point => selectedIdSet.has(point.uid))
  const selectedLineIds = new Set(
    selectedPoints
      .map(point => point.line_constraint?.uid)
      .filter((lineUid): lineUid is string => lineUid != null),
  )

  if (selectedLineIds.size === 0)
    return selectedPoints

  return points.filter(point => selectedIdSet.has(point.uid) || (
    point.line_constraint && selectedLineIds.has(point.line_constraint.uid)
  ))
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

export function getWaypointRedistributionSpacing(selectedPoints: NavPoint[]) {
  if (selectedPoints.length < 2)
    return null

  const orderedPoints = orderWaypointsByLineProjection(selectedPoints)
  if (!orderedPoints)
    return null

  const start = orderedPoints[0]
  const end = orderedPoints[orderedPoints.length - 1]
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  if (length < 1e-6)
    return null

  return length / (orderedPoints.length - 1)
}

export function getEvenlyRedistributedWaypoints(selectedPoints: NavPoint[], spacing?: number): EvenWaypointLayout | null {
  if (selectedPoints.length < 2)
    return null

  const orderedPoints = orderWaypointsByLineProjection(selectedPoints)
  if (!orderedPoints)
    return null

  const start = orderedPoints[0]
  const end = orderedPoints[orderedPoints.length - 1]
  const vector = {
    x: end.x - start.x,
    y: end.y - start.y,
  }
  const length = Math.hypot(vector.x, vector.y)
  if (length < 1e-6)
    return null

  const pointSpacing = spacing == null
    ? length / (orderedPoints.length - 1)
    : normalizeSpacing(spacing)
  const unit = {
    x: vector.x / length,
    y: vector.y / length,
  }

  return {
    orderedPoints,
    updates: orderedPoints.map((point, index) => {
      return {
        uid: point.uid,
        point: {
          x: start.x + unit.x * pointSpacing * index,
          y: start.y + unit.y * pointSpacing * index,
        },
      }
    }),
  }
}

export function orderWaypointsByLineProjection(selectedPoints: NavPoint[]) {
  if (selectedPoints.length < 2)
    return null

  let start = selectedPoints[0]
  let end = selectedPoints[1]
  let maxDistance = 0

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

  if (maxDistance < 1e-6)
    return null

  if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
    if (end.x < start.x)
      [start, end] = [end, start]
  }
  else if (end.y < start.y) {
    [start, end] = [end, start]
  }

  const vector = {
    x: end.x - start.x,
    y: end.y - start.y,
  }
  const vectorLengthSquared = vector.x ** 2 + vector.y ** 2
  return selectedPoints
    .slice()
    .sort((pointA, pointB) => {
      const projectionA = ((pointA.x - start.x) * vector.x + (pointA.y - start.y) * vector.y) / vectorLengthSquared
      const projectionB = ((pointB.x - start.x) * vector.x + (pointB.y - start.y) * vector.y) / vectorLengthSquared
      return projectionA - projectionB
    })
}

export function orderWaypointsForRename(points: NavPoint[], order: WaypointRenameOrder) {
  if (order === 'selection')
    return points.slice()

  if (order === 'line' || order === 'reverseLine') {
    const ordered = orderWaypointsByLineProjection(points) ?? points.slice()
    return order === 'reverseLine' ? ordered.reverse() : ordered
  }

  const ordered = points.slice().sort((pointA, pointB) => {
    if (order === 'leftToRight' || order === 'rightToLeft')
      return pointA.x === pointB.x ? pointA.y - pointB.y : pointA.x - pointB.x

    return pointA.y === pointB.y ? pointA.x - pointB.x : pointA.y - pointB.y
  })

  return order === 'rightToLeft' || order === 'bottomToTop' ? ordered.reverse() : ordered
}

function normalizeRenamePattern(pattern: string) {
  const trimmed = pattern.trim()
  if (!trimmed)
    return 'waypoint_{n}'

  if (/\{(?:n|x)(?::\d+)?\}/.test(trimmed))
    return trimmed

  if (trimmed === 'x')
    return '{n}'

  if (/(^|_)x$/.test(trimmed))
    return trimmed.replace(/x$/, '{n}')

  return `${trimmed}_{n}`
}

function formatWaypointNumber(value: number, widthText?: string) {
  const text = `${value}`
  const width = widthText ? Number(widthText) : 0
  if (!Number.isFinite(width) || width <= 0)
    return text

  return text.padStart(width, '0')
}

export function formatWaypointRenamePattern(pattern: string, point: NavPoint, number: number) {
  return normalizeRenamePattern(pattern)
    .replace(/\{(?:n|x)(?::(\d+))?\}/g, (_, widthText: string | undefined) => formatWaypointNumber(number, widthText))
    .replace(/\{name\}/g, point.name)
    .replace(/\{uid\}/g, point.uid)
}

export function buildWaypointRenamePreview(points: NavPoint[], options: WaypointRenameOptions): WaypointRenamePreviewItem[] {
  const start = Number.isFinite(options.start) ? options.start : 1
  const step = Number.isFinite(options.step) ? options.step : 1
  return orderWaypointsForRename(points, options.order).map((point, index) => {
    const number = start + index * step
    return {
      point,
      number,
      name: formatWaypointRenamePattern(options.pattern, point, number),
    }
  })
}
