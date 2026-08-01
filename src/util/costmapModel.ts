import type { GridInfoMessage, PointMessage, PoseMessage, QuaternionMessage } from '@/types'

export type CostmapLayer = 'global' | 'local'
export type CostmapStatus = 'off' | 'waiting' | 'visible' | 'no-data' | 'stale' | 'error'

export interface CostmapStamp {
  sec: number
  nanosec: number
}

export interface CostmapOriginMessage {
  position: PointMessage
  orientation: QuaternionMessage
}

export interface CostmapFullMessage {
  type: 'costmap'
  layer: CostmapLayer
  kind: 'full'
  key: string
  frameId: string
  stamp: CostmapStamp
  info: {
    width: number
    height: number
    resolution: number
    origin: CostmapOriginMessage
  }
  dataBase64: string
}

export interface CostmapUpdateMessage {
  type: 'costmap'
  layer: CostmapLayer
  kind: 'update'
  key: string
  frameId: string
  stamp: CostmapStamp
  x: number
  y: number
  width: number
  height: number
  dataBase64: string
}

export type CostmapPayloadMessage = CostmapFullMessage | CostmapUpdateMessage

export interface CostmapGrid {
  frameId: 'map'
  stamp: CostmapStamp
  info: GridInfoMessage
  data: Uint8Array
  updatedAt: number
}

export type CostmapApplyResult =
  | { kind: 'applied'; grid: CostmapGrid }
  | { kind: 'ignored'; reason: 'missing-base'; grid: null }

export class CostmapValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CostmapValidationError'
  }
}

const costmapColors: Record<CostmapLayer, readonly [number, number, number]> = {
  global: [245, 158, 11],
  local: [6, 182, 212],
}

function assertFinite(value: number, field: string) {
  if (!Number.isFinite(value))
    throw new CostmapValidationError(`${field} must be finite`)
}

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new CostmapValidationError(`${field} must be a positive integer`)
}

function decodeBase64(value: string) {
  let binary: string
  try {
    binary = atob(value)
  }
  catch {
    throw new CostmapValidationError('costmap cell payload is not valid base64')
  }

  const data = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    data[index] = binary.charCodeAt(index)
  return data
}

function quaternionToYaw(orientation: QuaternionMessage) {
  const norm = Math.hypot(orientation.x, orientation.y, orientation.z, orientation.w)
  if (!Number.isFinite(norm) || norm <= 0)
    throw new CostmapValidationError('costmap origin orientation is invalid')

  const x = orientation.x / norm
  const y = orientation.y / norm
  const z = orientation.z / norm
  const w = orientation.w / norm
  return {
    orientation: { x, y, z, w },
    yaw: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
  }
}

function normalizeOrigin(origin: CostmapOriginMessage): PoseMessage {
  for (const field of ['x', 'y', 'z'] as const)
    assertFinite(origin.position[field], `costmap origin position ${field}`)
  for (const field of ['x', 'y', 'z', 'w'] as const)
    assertFinite(origin.orientation[field], `costmap origin orientation ${field}`)

  const normalized = quaternionToYaw(origin.orientation)
  return {
    position: { ...origin.position },
    orientation: normalized.orientation,
    pyr: {
      pitch: 0,
      roll: 0,
      yaw: normalized.yaw,
    },
  }
}

function validateFrame(frameId: string) {
  if (frameId.replace(/^\/+/, '') !== 'map')
    throw new CostmapValidationError(`unsupported costmap frame: ${frameId || '(empty)'}`)
}

function applyFullMessage(message: CostmapFullMessage, now: number): CostmapApplyResult {
  validateFrame(message.frameId)
  assertPositiveInteger(message.info.width, 'costmap width')
  assertPositiveInteger(message.info.height, 'costmap height')
  assertFinite(message.info.resolution, 'costmap resolution')
  if (message.info.resolution <= 0)
    throw new CostmapValidationError('costmap resolution must be positive')

  const expectedLength = message.info.width * message.info.height
  if (!Number.isSafeInteger(expectedLength))
    throw new CostmapValidationError('costmap dimensions are too large')

  const data = decodeBase64(message.dataBase64)
  if (data.length !== expectedLength)
    throw new CostmapValidationError('costmap cell payload does not match dimensions')

  return {
    kind: 'applied',
    grid: {
      frameId: 'map',
      stamp: { ...message.stamp },
      info: {
        width: message.info.width,
        height: message.info.height,
        resolution: message.info.resolution,
        origin: normalizeOrigin(message.info.origin),
      },
      data,
      updatedAt: now,
    },
  }
}

function applyUpdateMessage(current: CostmapGrid, message: CostmapUpdateMessage, now: number): CostmapApplyResult {
  validateFrame(message.frameId)
  if (!Number.isSafeInteger(message.x) || message.x < 0 || !Number.isSafeInteger(message.y) || message.y < 0)
    throw new CostmapValidationError('costmap update origin must be a non-negative integer')
  assertPositiveInteger(message.width, 'costmap update width')
  assertPositiveInteger(message.height, 'costmap update height')

  const expectedLength = message.width * message.height
  if (!Number.isSafeInteger(expectedLength))
    throw new CostmapValidationError('costmap update dimensions are too large')

  const data = decodeBase64(message.dataBase64)
  if (data.length !== expectedLength)
    throw new CostmapValidationError('costmap update cell payload does not match dimensions')
  if (message.x + message.width > current.info.width || message.y + message.height > current.info.height)
    throw new CostmapValidationError('costmap update exceeds the current base bounds')

  const nextData = current.data.slice()
  for (let row = 0; row < message.height; row++) {
    const sourceOffset = row * message.width
    const targetOffset = (message.y + row) * current.info.width + message.x
    nextData.set(data.subarray(sourceOffset, sourceOffset + message.width), targetOffset)
  }

  return {
    kind: 'applied',
    grid: {
      ...current,
      stamp: { ...message.stamp },
      data: nextData,
      updatedAt: now,
    },
  }
}

export function applyCostmapMessage(current: CostmapGrid | null, message: CostmapPayloadMessage, now = Date.now()): CostmapApplyResult {
  if (message.kind === 'full')
    return applyFullMessage(message, now)

  if (!current)
    return { kind: 'ignored', reason: 'missing-base', grid: null }

  return applyUpdateMessage(current, message, now)
}

export function createCostmapPixels(grid: CostmapGrid, layer: CostmapLayer) {
  const { width, height } = grid.info
  const pixels = new Uint8ClampedArray(width * height * 4)
  const [red, green, blue] = costmapColors[layer]
  let pixelIndex = 0

  for (let y = height - 1; y >= 0; y--) {
    const rowOffset = y * width
    for (let x = 0; x < width; x++) {
      const value = grid.data[rowOffset + x]
      if (value !== 0 && value !== 255) {
        const cost = Math.min(100, value)
        pixels[pixelIndex] = red
        pixels[pixelIndex + 1] = green
        pixels[pixelIndex + 2] = blue
        pixels[pixelIndex + 3] = Math.round(32 + 192 * cost / 100)
      }
      pixelIndex += 4
    }
  }

  return pixels
}

export function getCostmapCanvasPlacement(info: GridInfoMessage) {
  const width = info.width * info.resolution
  const height = info.height * info.resolution
  const yaw = info.origin.pyr.yaw

  return {
    x: info.origin.position.x - Math.sin(yaw) * height,
    y: -(info.origin.position.y + Math.cos(yaw) * height),
    width,
    height,
    rotation: -yaw * 180 / Math.PI,
  }
}
