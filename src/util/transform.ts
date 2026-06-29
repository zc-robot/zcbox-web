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

export interface ParsedMapRaster {
  width: number
  height: number
  data: number[]
  format: 'pgm' | 'png'
}

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]

function isPng(data: Uint8Array) {
  return data.length >= pngSignature.length
    && pngSignature.every((byte, index) => data[index] === byte)
}

function isPgm(data: Uint8Array) {
  return data.length >= 2
    && data[0] === 80
    && (data[1] === 50 || data[1] === 53)
}

function grayscaleToOccupancy(pixelValue: number, maxValue = 255) {
  const grayscale = maxValue === 255
    ? pixelValue
    : Math.round(pixelValue * 255 / maxValue)

  if (grayscale <= 0)
    return 100

  if (grayscale >= 250)
    return 0

  return -1
}

function rgbaToGrayscale(data: Uint8ClampedArray, index: number) {
  const red = data[index]
  const green = data[index + 1]
  const blue = data[index + 2]

  return Math.round(0.299 * red + 0.587 * green + 0.114 * blue)
}

async function parsePng(data: Uint8Array): Promise<ParsedMapRaster> {
  const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }))

  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context)
      throw new Error('无法创建 PNG 地图解析画布')

    context.drawImage(bitmap, 0, 0)

    const width = bitmap.width
    const height = bitmap.height
    const pixels = context.getImageData(0, 0, width, height).data
    const result = new Int32Array(width * height)

    for (let sourceY = 0; sourceY < height; sourceY++) {
      const targetRowStart = (height - 1 - sourceY) * width
      const sourceRowStart = sourceY * width * 4
      for (let x = 0; x < width; x++) {
        const pixelIndex = sourceRowStart + x * 4
        result[targetRowStart + x] = pixels[pixelIndex + 3] <= 0
          ? -1
          : grayscaleToOccupancy(rgbaToGrayscale(pixels, pixelIndex))
      }
    }

    return {
      width,
      height,
      data: Array.from(result),
      format: 'png',
    }
  }
  finally {
    bitmap.close()
  }
}

export function parsePgm(data: Uint8Array): ParsedMapRaster {
  let position = 0

  // Read magic number (P2 or P5)
  let magicNumber = ''
  while (position < data.length && data[position] !== 10)
    magicNumber += String.fromCharCode(data[position++])

  position++
  magicNumber = magicNumber.trim()
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
        result[index] = grayscaleToOccupancy(pixelValue, maxValue)
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
        result[index] = grayscaleToOccupancy(pixelValue, maxValue)
      }
    }
  }

  return { width, height, data: Array.from(result), format: 'pgm' } // Convert to regular array if needed
}

export async function parseMapRaster(data: Uint8Array): Promise<ParsedMapRaster> {
  if (isPgm(data))
    return parsePgm(data)

  if (isPng(data))
    return parsePng(data)

  throw new Error('Unsupported map image format, only PGM and PNG are supported.')
}

function parsePgmPixels(data: Uint8Array) {
  let position = 0

  let magicNumber = ''
  while (position < data.length && data[position] !== 10)
    magicNumber += String.fromCharCode(data[position++])

  position++
  magicNumber = magicNumber.trim()
  if (magicNumber !== 'P2' && magicNumber !== 'P5')
    throw new Error('Unsupported PGM format, only P2 and P5 are supported.')

  const readNumber = (): number => {
    let numStr = ''
    while (position < data.length) {
      const char = data[position]
      if (char === 35) {
        while (position < data.length && data[position] !== 10) position++
        position++
      }
      else if (char <= 32) {
        position++
      }
      else {
        break
      }
    }
    while (position < data.length && data[position] > 32 && data[position] <= 126)
      numStr += String.fromCharCode(data[position++])

    return Number.parseInt(numStr, 10)
  }

  const width = readNumber()
  const height = readNumber()
  const maxValue = readNumber()
  const pixels = new Uint8ClampedArray(width * height * 4)
  const writePixel = (index: number, pixelValue: number) => {
    const grayscale = maxValue === 255
      ? pixelValue
      : Math.round(pixelValue * 255 / maxValue)
    const target = index * 4
    pixels[target] = grayscale
    pixels[target + 1] = grayscale
    pixels[target + 2] = grayscale
    pixels[target + 3] = 255
  }

  if (magicNumber === 'P2') {
    for (let index = 0; index < width * height; index++)
      writePixel(index, readNumber())
  }
  else {
    const bytesPerSample = maxValue > 255 ? 2 : 1
    for (let index = 0; index < width * height; index++) {
      const pixelValue = bytesPerSample === 1
        ? data[position++]
        : (data[position++] << 8) + data[position++]
      writePixel(index, pixelValue)
    }
  }

  return { width, height, pixels }
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob)
        resolve(blob)
      else
        reject(new Error('无法创建 PNG 地图文件'))
    }, 'image/png')
  })
}

export async function convertMapRasterToPngBlob(data: Uint8Array) {
  if (isPng(data))
    return new Blob([data], { type: 'image/png' })

  if (!isPgm(data))
    throw new Error('Unsupported map image format, only PGM and PNG are supported.')

  const { width, height, pixels } = parsePgmPixels(data)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('无法创建 PNG 地图转换画布')

  context.putImageData(new ImageData(pixels, width, height), 0, 0)
  return canvasToPngBlob(canvas)
}

// Worker instance
export const mapWorker = new ComlinkWorker<typeof import('../worker')>(
  new URL('../worker', import.meta.url), { type: 'module' },
)
