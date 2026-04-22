import type { GridInfoMessage } from './types'

export interface MapRenderResult {
  bitmap: ImageBitmap
  optimizedInfo: GridInfoMessage
  scaleRatio: number
}

function getColorVal(value: number) {
  switch (value) {
    case 100:
      return 0
    case 0:
      return 255
    case 2:
      return 0
    default:
      return 127
  }
}

const baseCanvas = new OffscreenCanvas(0, 0)
const scaledCanvas = new OffscreenCanvas(0, 0)
const MAX_BITMAP_SIZE = 1500

const RLE_SIGNATURE = [82, 76, 69, 32] // 'RLE '
const COMPRESSED_MAP_HEADER_SIZE = 34
const COMPRESSED_MAP_VERSION = 1
const COMPRESSED_MAP_CODEC_GZIP = 1

function hasRLESignature(data: number[] | Uint8Array) {
  if (data.length < 8)
    return false

  for (let i = 0; i < RLE_SIGNATURE.length; i++) {
    if (data[i] !== RLE_SIGNATURE[i])
      return false
  }

  return true
}

export function decodeRLE(data: number[] | Uint8Array): number[] {
  if (!hasRLESignature(data))
    return Array.isArray(data) ? data : Array.from(data)

  const source = data instanceof Uint8Array ? data : new Uint8Array(data)

  const view = new DataView(source.buffer, source.byteOffset, source.byteLength)
  let offset = 4
  const originalLength = view.getUint32(offset, true)
  offset += 4

  if (originalLength <= 0)
    return []

  const result = new Array<number>(originalLength)
  let writeIndex = 0

  while (writeIndex < originalLength) {
    if (offset >= source.length)
      throw new Error('RLE 数据异常，提前结束')

    const value = source[offset++]

    if (offset + 4 > source.length)
      throw new Error('RLE 数据缺少计数信息')

    const count = view.getUint32(offset, true)
    offset += 4

    if (count <= 0)
      throw new Error(`非法的 RLE 计数: ${count}`)

    const end = writeIndex + count
    if (end > originalLength)
      throw new Error('解压长度超过预期')

    result.fill(value, writeIndex, end)
    writeIndex = end
  }

  return result
}

async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined')
    throw new Error('当前浏览器不支持 gzip 解压')

  const stream = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()

  return new Uint8Array(buffer)
}

export async function decodeCompressedMapPayload(payload: Uint8Array) {
  if (payload.byteLength < COMPRESSED_MAP_HEADER_SIZE)
    throw new Error('压缩地图数据长度不足')

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const version = view.getUint8(0)
  const codec = view.getUint8(1)

  if (version !== COMPRESSED_MAP_VERSION)
    throw new Error(`不支持的压缩地图版本: ${version}`)

  if (codec !== COMPRESSED_MAP_CODEC_GZIP)
    throw new Error(`不支持的压缩地图编码: ${codec}`)

  const width = view.getUint32(2, false)
  const height = view.getUint32(6, false)
  const resolution = view.getFloat32(10, false)
  const originX = view.getFloat32(14, false)
  const originY = view.getFloat32(18, false)
  const originYaw = view.getFloat32(22, false)
  const rawSize = view.getUint32(26, false)
  const compressedSize = view.getUint32(30, false)

  if (width <= 0 || height <= 0)
    throw new Error('压缩地图宽高异常')

  if (rawSize !== width * height)
    throw new Error('压缩地图原始长度与宽高不匹配')

  if (COMPRESSED_MAP_HEADER_SIZE + compressedSize !== payload.byteLength)
    throw new Error('压缩地图 payload 长度与头部不匹配')

  const compressedData = payload.subarray(COMPRESSED_MAP_HEADER_SIZE)
  const rawData = await decompressGzip(compressedData)

  if (rawData.byteLength !== rawSize)
    throw new Error('gzip 解压后的地图长度不匹配')

  const halfYaw = originYaw / 2
  const info: GridInfoMessage = {
    width,
    height,
    resolution,
    origin: {
      position: {
        x: originX,
        y: originY,
        z: 0,
      },
      orientation: {
        x: 0,
        y: 0,
        z: Math.sin(halfYaw),
        w: Math.cos(halfYaw),
      },
      pyr: {
        pitch: 0,
        roll: 0,
        yaw: originYaw,
      },
    },
  }

  return {
    info,
    data: Array.from(rawData, value => value === 255 ? -1 : value),
  }
}

export function mapImageData(info: GridInfoMessage, mapData: number[]): MapRenderResult {
  const { width, height } = info

  baseCanvas.width = width
  baseCanvas.height = height

  const baseContext = baseCanvas.getContext('2d')
  if (!baseContext)
    throw new Error('无法创建基础画布上下文')

  const image = baseContext.createImageData(width, height)
  const data = image.data

  let dataIndex = 0
  for (let y = height - 1; y >= 0; y--) {
    const rowOffset = y * width
    for (let x = 0; x < width; x++) {
      const mapValue = mapData[rowOffset + x]
      const colorValue = getColorVal(mapValue)
      data[dataIndex++] = colorValue
      data[dataIndex++] = colorValue
      data[dataIndex++] = colorValue
      data[dataIndex++] = mapValue === 2 ? 100 : 255
    }
  }

  baseContext.putImageData(image, 0, 0)

  const maxDimension = Math.max(width, height)
  const needsScaling = maxDimension > MAX_BITMAP_SIZE
  const scaleRatio = needsScaling ? MAX_BITMAP_SIZE / maxDimension : 1

  let outputCanvas = baseCanvas

  if (needsScaling) {
    const targetWidth = Math.max(1, Math.round(width * scaleRatio))
    const targetHeight = Math.max(1, Math.round(height * scaleRatio))

    scaledCanvas.width = targetWidth
    scaledCanvas.height = targetHeight

    const scaledContext = scaledCanvas.getContext('2d')
    if (!scaledContext)
      throw new Error('无法创建缩放画布上下文')

    scaledContext.imageSmoothingEnabled = false
    scaledContext.clearRect(0, 0, targetWidth, targetHeight)
    scaledContext.drawImage(baseCanvas, 0, 0, targetWidth, targetHeight)
    outputCanvas = scaledCanvas
  }

  const optimizedWidth = outputCanvas.width
  const optimizedHeight = outputCanvas.height
  const optimizedResolution = info.resolution / scaleRatio

  const optimizedInfo: GridInfoMessage = {
    ...info,
    width: optimizedWidth,
    height: optimizedHeight,
    resolution: optimizedResolution,
  }

  return {
    bitmap: outputCanvas.transferToImageBitmap(),
    optimizedInfo,
    scaleRatio,
  }
}
