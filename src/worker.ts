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
const LEGACY_COMPRESSED_MAP_HEADER_SIZE = 34
const LEGACY_COMPRESSED_MAP_VERSION = 1
const LEGACY_COMPRESSED_MAP_CODEC_GZIP = 1
const CDR_HEADER_SIZE = 4

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

function alignCdrOffset(offset: number, alignment: number, baseOffset = 0) {
  const remainder = (offset - baseOffset) % alignment
  return remainder === 0 ? offset : offset + alignment - remainder
}

function getCdrLittleEndian(view: DataView) {
  if (view.byteLength < CDR_HEADER_SIZE)
    return null

  const encapsulation = view.getUint16(0, false)
  if (encapsulation === 0 || encapsulation === 2)
    return false
  if (encapsulation === 1 || encapsulation === 3)
    return true

  const littleEndianEncapsulation = view.getUint16(0, true)
  if (littleEndianEncapsulation === 0 || littleEndianEncapsulation === 2)
    return false
  if (littleEndianEncapsulation === 1 || littleEndianEncapsulation === 3)
    return true

  return null
}

function readCdrUint32(view: DataView, offset: number, littleEndian: boolean, baseOffset = 0) {
  const alignedOffset = alignCdrOffset(offset, 4, baseOffset)
  if (alignedOffset + 4 > view.byteLength)
    throw new Error('CDR uint32 数据长度不足')

  return {
    value: view.getUint32(alignedOffset, littleEndian),
    offset: alignedOffset + 4,
  }
}

function readCdrInt32(view: DataView, offset: number, littleEndian: boolean, baseOffset = 0) {
  const alignedOffset = alignCdrOffset(offset, 4, baseOffset)
  if (alignedOffset + 4 > view.byteLength)
    throw new Error('CDR int32 数据长度不足')

  return {
    value: view.getInt32(alignedOffset, littleEndian),
    offset: alignedOffset + 4,
  }
}

function readCdrFloat32(view: DataView, offset: number, littleEndian: boolean, baseOffset = 0) {
  const alignedOffset = alignCdrOffset(offset, 4, baseOffset)
  if (alignedOffset + 4 > view.byteLength)
    throw new Error('CDR float32 数据长度不足')

  return {
    value: view.getFloat32(alignedOffset, littleEndian),
    offset: alignedOffset + 4,
  }
}

function readCdrFloat64(view: DataView, offset: number, littleEndian: boolean, baseOffset = 0) {
  const alignedOffset = alignCdrOffset(offset, 8, baseOffset)
  if (alignedOffset + 8 > view.byteLength)
    throw new Error('CDR float64 数据长度不足')

  return {
    value: view.getFloat64(alignedOffset, littleEndian),
    offset: alignedOffset + 8,
  }
}

function skipCdrString(view: DataView, offset: number, littleEndian: boolean, baseOffset = 0) {
  const lengthResult = readCdrUint32(view, offset, littleEndian, baseOffset)
  const nextOffset = lengthResult.offset + lengthResult.value

  if (nextOffset > view.byteLength)
    throw new Error('CDR 字符串长度异常')

  return nextOffset
}

function decodeCdrUInt8MultiArray(payload: Uint8Array) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const littleEndian = getCdrLittleEndian(view)
  if (littleEndian === null)
    return null

  let offset = CDR_HEADER_SIZE
  const dimLengthResult = readCdrUint32(view, offset, littleEndian)
  const dimLength = dimLengthResult.value
  offset = dimLengthResult.offset

  for (let i = 0; i < dimLength; i++) {
    offset = skipCdrString(view, offset, littleEndian)
    offset = readCdrUint32(view, offset, littleEndian).offset
    offset = readCdrUint32(view, offset, littleEndian).offset
  }

  offset = readCdrUint32(view, offset, littleEndian).offset

  const dataLengthResult = readCdrUint32(view, offset, littleEndian)
  const dataLength = dataLengthResult.value
  offset = dataLengthResult.offset

  if (offset + dataLength > payload.byteLength)
    throw new Error('CDR UInt8MultiArray data 长度异常')

  return payload.subarray(offset, offset + dataLength)
}

function readCdrTime(view: DataView, offset: number, littleEndian: boolean, baseOffset: number) {
  offset = readCdrInt32(view, offset, littleEndian, baseOffset).offset
  offset = readCdrUint32(view, offset, littleEndian, baseOffset).offset
  return offset
}

function readCdrPose(view: DataView, offset: number, littleEndian: boolean, baseOffset: number) {
  const values: number[] = []

  for (let i = 0; i < 7; i++) {
    const result = readCdrFloat64(view, offset, littleEndian, baseOffset)
    values.push(result.value)
    offset = result.offset
  }

  return {
    offset,
    pose: {
      position: {
        x: values[0],
        y: values[1],
        z: values[2],
      },
      orientation: {
        x: values[3],
        y: values[4],
        z: values[5],
        w: values[6],
      },
    },
  }
}

function quaternionToYaw(x: number, y: number, z: number, w: number) {
  return Math.atan2(
    2 * (w * z + x * y),
    1 - 2 * (y * y + z * z),
  )
}

function decodeOccupancyGridCdrWithAlignment(payload: Uint8Array, baseOffset: number) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const littleEndian = getCdrLittleEndian(view)
  if (littleEndian === null)
    throw new Error('OccupancyGrid CDR encapsulation 异常')

  let offset = CDR_HEADER_SIZE

  offset = readCdrTime(view, offset, littleEndian, baseOffset)
  offset = skipCdrString(view, offset, littleEndian, baseOffset)

  offset = readCdrTime(view, offset, littleEndian, baseOffset)

  const resolutionResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  const resolution = resolutionResult.value
  offset = resolutionResult.offset

  const widthResult = readCdrUint32(view, offset, littleEndian, baseOffset)
  const width = widthResult.value
  offset = widthResult.offset

  const heightResult = readCdrUint32(view, offset, littleEndian, baseOffset)
  const height = heightResult.value
  offset = heightResult.offset

  const poseResult = readCdrPose(view, offset, littleEndian, baseOffset)
  const origin = poseResult.pose
  offset = poseResult.offset

  const dataLengthResult = readCdrUint32(view, offset, littleEndian, baseOffset)
  const dataLength = dataLengthResult.value
  offset = dataLengthResult.offset

  if (width <= 0 || height <= 0 || !Number.isFinite(resolution) || resolution <= 0)
    throw new Error('OccupancyGrid metadata 异常')

  if (dataLength !== width * height)
    throw new Error('OccupancyGrid data 长度与宽高不匹配')

  if (offset + dataLength > payload.byteLength)
    throw new Error('OccupancyGrid data 数据长度不足')

  const orientation = origin.orientation
  const quaternionNorm = Math.hypot(orientation.x, orientation.y, orientation.z, orientation.w)
  if (!Number.isFinite(quaternionNorm) || quaternionNorm <= 0)
    throw new Error('OccupancyGrid origin quaternion 异常')

  const normalizedOrientation = {
    x: orientation.x / quaternionNorm,
    y: orientation.y / quaternionNorm,
    z: orientation.z / quaternionNorm,
    w: orientation.w / quaternionNorm,
  }
  const yaw = quaternionToYaw(
    normalizedOrientation.x,
    normalizedOrientation.y,
    normalizedOrientation.z,
    normalizedOrientation.w,
  )

  const info: GridInfoMessage = {
    width,
    height,
    resolution,
    origin: {
      position: origin.position,
      orientation: normalizedOrientation,
      pyr: {
        pitch: 0,
        roll: 0,
        yaw,
      },
    },
  }

  const data = new Array<number>(dataLength)
  for (let i = 0; i < dataLength; i++)
    data[i] = view.getInt8(offset + i)

  return { info, data }
}

function decodeOccupancyGridCdr(payload: Uint8Array) {
  try {
    return decodeOccupancyGridCdrWithAlignment(payload, 0)
  }
  catch (error) {
    try {
      return decodeOccupancyGridCdrWithAlignment(payload, CDR_HEADER_SIZE)
    }
    catch {
      throw error
    }
  }
}

function isGzipPayload(payload: Uint8Array) {
  return payload.byteLength >= 2 && payload[0] === 0x1F && payload[1] === 0x8B
}

function isLegacyCompressedMapBinaryPayload(payload: Uint8Array) {
  return payload.byteLength >= LEGACY_COMPRESSED_MAP_HEADER_SIZE
    && payload[0] === LEGACY_COMPRESSED_MAP_VERSION
    && payload[1] === LEGACY_COMPRESSED_MAP_CODEC_GZIP
}

function extractCompressedMapBinaryPayload(payload: Uint8Array) {
  if (isGzipPayload(payload) || isLegacyCompressedMapBinaryPayload(payload))
    return payload

  const cdrData = decodeCdrUInt8MultiArray(payload)
  if (cdrData && (isGzipPayload(cdrData) || isLegacyCompressedMapBinaryPayload(cdrData)))
    return cdrData

  throw new Error('压缩地图 payload 不是有效的 raw gzip OccupancyGrid CDR、上一版 CDR UInt8MultiArray 或旧版 gzip 地图')
}

async function decodeLegacyCompressedMapPayload(mapPayload: Uint8Array) {
  if (mapPayload.byteLength < LEGACY_COMPRESSED_MAP_HEADER_SIZE)
    throw new Error('压缩地图数据长度不足')

  const view = new DataView(mapPayload.buffer, mapPayload.byteOffset, mapPayload.byteLength)
  const version = view.getUint8(0)
  const codec = view.getUint8(1)

  if (version !== LEGACY_COMPRESSED_MAP_VERSION)
    throw new Error(`不支持的压缩地图版本: ${version}`)

  if (codec !== LEGACY_COMPRESSED_MAP_CODEC_GZIP)
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

  if (LEGACY_COMPRESSED_MAP_HEADER_SIZE + compressedSize !== mapPayload.byteLength)
    throw new Error('压缩地图 payload 长度与头部不匹配')

  const compressedData = mapPayload.subarray(LEGACY_COMPRESSED_MAP_HEADER_SIZE)
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

export async function decodeCompressedMapPayload(payload: Uint8Array) {
  const mapPayload = extractCompressedMapBinaryPayload(payload)

  if (!isGzipPayload(mapPayload))
    return decodeLegacyCompressedMapPayload(mapPayload)

  const occupancyGridCdr = await decompressGzip(mapPayload)
  return decodeOccupancyGridCdr(occupancyGridCdr)
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
