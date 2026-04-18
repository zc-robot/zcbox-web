import type { PoseMessage, QuaternionMessage } from '@/types'

export function normalizeYaw(yaw: number) {
  return Math.atan2(Math.sin(yaw), Math.cos(yaw))
}

export function quaternionToYaw(msg: QuaternionMessage) {
  const sinYaw = 2.0 * (msg.w * msg.z + msg.x * msg.y)
  const cosYaw = 1.0 - 2.0 * (msg.y * msg.y + msg.z * msg.z)
  return Math.atan2(sinYaw, cosYaw)
}

export function yawToCanvasAngle(yaw: number) {
  return -yaw * 180 / Math.PI
}

export function canvasAngleToYaw(angle: number) {
  return -angle * Math.PI / 180.0
}

// See https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles#Rotation_matrices
// here we use [x y z] = R * [1 0 0]
export function quaternionToCanvasAngle(msg: QuaternionMessage) {
  return yawToCanvasAngle(quaternionToYaw(msg))
}

export function yawToQuaternion(yaw: number): QuaternionMessage {
  const cosHalfAngle = Math.cos(yaw / 2.0)
  const sinHalfAngle = Math.sin(yaw / 2.0)
  return {
    x: 0,
    y: 0,
    z: sinHalfAngle,
    w: cosHalfAngle,
  }
}

export function canvasAngleToQuaternion(angle: number): QuaternionMessage {
  return yawToQuaternion(canvasAngleToYaw(angle))
}

export function poseToXYYaw(pose: PoseMessage) {
  return {
    x: pose.position.x,
    y: pose.position.y,
    yaw: Number.isFinite(pose.pyr.yaw) ? pose.pyr.yaw : quaternionToYaw(pose.orientation),
  }
}

export function poseFromXYYaw(x: number, y: number, yaw: number, z = 0): PoseMessage {
  const normalizedYaw = normalizeYaw(yaw)
  return {
    position: {
      x,
      y,
      z,
    },
    orientation: yawToQuaternion(normalizedYaw),
    pyr: {
      yaw: normalizedYaw,
      pitch: 0,
      roll: 0,
    },
  }
}

export function getRelativePose(reference: PoseMessage, target: PoseMessage) {
  const base = poseToXYYaw(reference)
  const next = poseToXYYaw(target)
  const dx = next.x - base.x
  const dy = next.y - base.y
  const cosYaw = Math.cos(base.yaw)
  const sinYaw = Math.sin(base.yaw)

  return poseFromXYYaw(
    cosYaw * dx + sinYaw * dy,
    -sinYaw * dx + cosYaw * dy,
    normalizeYaw(next.yaw - base.yaw),
    target.position.z,
  )
}

export function composePose(base: PoseMessage, offset: PoseMessage) {
  const origin = poseToXYYaw(base)
  const delta = poseToXYYaw(offset)
  const cosYaw = Math.cos(origin.yaw)
  const sinYaw = Math.sin(origin.yaw)

  return poseFromXYYaw(
    origin.x + cosYaw * delta.x - sinYaw * delta.y,
    origin.y + sinYaw * delta.x + cosYaw * delta.y,
    normalizeYaw(origin.yaw + delta.yaw),
    base.position.z,
  )
}

export function parsePgm(data: Uint8Array): { width: number; height: number; data: number[] } {
  let position = 0

  // Read magic number (P2 or P5)
  let magicNumber = ''
  while (position < data.length && data[position] !== 10)
    magicNumber += String.fromCharCode(data[position++])

  position++
  if (magicNumber !== 'P2' && magicNumber !== 'P5')
    throw new Error('Unsupported PGM format, only P2 and P5 are supported.')

  // Helper to read next number (skips comments and whitespace)
  const readNumber = (): number => {
    let numStr = ''
    // Skip comments and whitespace
    while (position < data.length) {
      const char = data[position]
      if (char === 35) { // '#'
        while (position < data.length && data[position] !== 10) position++
        position++
      }
      else if (char <= 32) { // Whitespace
        position++
      }
      else {
        break
      }
    }
    // Read digits
    while (position < data.length && data[position] > 32 && data[position] <= 126)
      numStr += String.fromCharCode(data[position++])

    return Number.parseInt(numStr, 10)
  }

  // Read dimensions and max value
  const width = readNumber()
  const height = readNumber()
  const maxValue = readNumber()

  const totalPixels = width * height
  const result = new Int32Array(totalPixels) // Use Int32Array for better performance

  if (magicNumber === 'P2') {
    // ASCII format: Process directly into flipped order
    for (let y = height - 1; y >= 0; y--) { // Start from bottom row
      for (let x = 0; x < width; x++) {
        const pixelValue = readNumber()
        const index = y * width + x
        if (pixelValue === 0)
          result[index] = 0 // occupied
        else if (pixelValue === 255 || (maxValue === 255 && pixelValue > 200))
          result[index] = 100 // free
        else
          result[index] = -1 // unknown
      }
    }
  }
  else {
    // P5 (Binary) format: Process directly into flipped order
    for (let y = height - 1; y >= 0; y--) { // Start from bottom row
      const rowStart = y * width
      for (let x = 0; x < width; x++) {
        const pixelValue = data[position++]
        const index = rowStart + x
        if (pixelValue === 0)
          result[index] = 100 // occupied
        else if (pixelValue >= 250)
          result[index] = 0 // free
        else
          result[index] = -1 // unknown
      }
    }
  }

  return { width, height, data: Array.from(result) } // Convert to regular array if needed
}

// Worker instance
export const mapWorker = new ComlinkWorker<typeof import('../worker')>(
  new URL('../worker', import.meta.url), { type: 'module' },
)
