import { useEffect } from 'react'
import { createMqttClient, decodePosePayload, teardownMqttClient } from './mqtt'
import { useGridStore } from '@/store'
import type { LaserScanMessage } from '@/types'

const LASER_POSE_TOPIC = 'laser_pose'
const SCAN_DATA_TOPIC = 'scan/filtered'
const SCAN_PING_TOPIC = 'scan/filtered/required'
const SCAN_PING_INTERVAL_MS = 5000
const LEGACY_SCAN_PAYLOAD_VERSION = 1
const LEGACY_SCAN_HEADER_SIZE = 15
const INVALID_RANGE_MM = 65535
const CDR_HEADER_SIZE = 4

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
    return null

  return {
    value: view.getUint32(alignedOffset, littleEndian),
    offset: alignedOffset + 4,
  }
}

function readCdrInt32(view: DataView, offset: number, littleEndian: boolean, baseOffset = 0) {
  const alignedOffset = alignCdrOffset(offset, 4, baseOffset)
  if (alignedOffset + 4 > view.byteLength)
    return null

  return {
    value: view.getInt32(alignedOffset, littleEndian),
    offset: alignedOffset + 4,
  }
}

function readCdrFloat32(view: DataView, offset: number, littleEndian: boolean, baseOffset = 0) {
  const alignedOffset = alignCdrOffset(offset, 4, baseOffset)
  if (alignedOffset + 4 > view.byteLength)
    return null

  return {
    value: view.getFloat32(alignedOffset, littleEndian),
    offset: alignedOffset + 4,
  }
}

function skipCdrString(view: DataView, offset: number, littleEndian: boolean, baseOffset = 0) {
  const lengthResult = readCdrUint32(view, offset, littleEndian, baseOffset)
  if (!lengthResult)
    return null

  const nextOffset = lengthResult.offset + lengthResult.value
  return nextOffset <= view.byteLength ? nextOffset : null
}

function skipCdrTime(view: DataView, offset: number, littleEndian: boolean, baseOffset: number) {
  const secResult = readCdrInt32(view, offset, littleEndian, baseOffset)
  if (!secResult)
    return null

  const nanosecResult = readCdrUint32(view, secResult.offset, littleEndian, baseOffset)
  return nanosecResult?.offset ?? null
}

function readCdrFloat32Array(view: DataView, offset: number, littleEndian: boolean, baseOffset: number) {
  const lengthResult = readCdrUint32(view, offset, littleEndian, baseOffset)
  if (!lengthResult)
    return null

  const length = lengthResult.value
  offset = lengthResult.offset
  const values = new Array<number>(length)

  for (let i = 0; i < length; i++) {
    const valueResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
    if (!valueResult)
      return null

    values[i] = valueResult.value
    offset = valueResult.offset
  }

  return { values, offset }
}

function decodeCdrLaserScanPayloadWithAlignment(view: DataView, baseOffset: number): LaserScanMessage | null {
  const littleEndian = getCdrLittleEndian(view)
  if (littleEndian === null)
    return null

  let offset: number | null = CDR_HEADER_SIZE

  offset = skipCdrTime(view, offset, littleEndian, baseOffset)
  if (offset === null)
    return null

  offset = skipCdrString(view, offset, littleEndian, baseOffset)
  if (offset === null)
    return null

  const angleMinResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!angleMinResult)
    return null
  const angleMin = angleMinResult.value
  offset = angleMinResult.offset

  const angleMaxResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!angleMaxResult)
    return null
  offset = angleMaxResult.offset

  const angleIncrementResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!angleIncrementResult)
    return null
  const angleIncrement = angleIncrementResult.value
  offset = angleIncrementResult.offset

  const timeIncrementResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!timeIncrementResult)
    return null
  offset = timeIncrementResult.offset

  const scanTimeResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!scanTimeResult)
    return null
  offset = scanTimeResult.offset

  const rangeMinResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!rangeMinResult)
    return null
  const rangeMin = rangeMinResult.value
  offset = rangeMinResult.offset

  const rangeMaxResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!rangeMaxResult)
    return null
  const rangeMax = rangeMaxResult.value
  offset = rangeMaxResult.offset

  const rangesResult = readCdrFloat32Array(view, offset, littleEndian, baseOffset)
  if (!rangesResult)
    return null

  const ranges = rangesResult.values.map(value => Number.isFinite(value) ? value : Number.NaN)

  return {
    angleMin,
    angleIncrement,
    rangeMin,
    rangeMax,
    ranges,
  }
}

function decodeCdrLaserScanPayload(view: DataView): LaserScanMessage | null {
  return decodeCdrLaserScanPayloadWithAlignment(view, 0)
    ?? decodeCdrLaserScanPayloadWithAlignment(view, CDR_HEADER_SIZE)
}

function decodeLegacyLaserScanPayload(view: DataView): LaserScanMessage | null {
  if (view.byteLength < LEGACY_SCAN_HEADER_SIZE)
    return null

  const version = view.getUint8(0)

  if (version !== LEGACY_SCAN_PAYLOAD_VERSION)
    return null

  const count = view.getUint16(1, false)
  const payloadSize = LEGACY_SCAN_HEADER_SIZE + count * 2

  if (view.byteLength !== payloadSize)
    return null

  const ranges = new Array<number>(count)
  for (let i = 0; i < count; i++) {
    const rangeMm = view.getUint16(LEGACY_SCAN_HEADER_SIZE + i * 2, false)
    ranges[i] = rangeMm === INVALID_RANGE_MM ? Number.NaN : rangeMm / 1000
  }

  return {
    angleMin: view.getFloat32(3, false),
    angleIncrement: view.getFloat32(7, false),
    rangeMin: view.getUint16(11, false) / 1000,
    rangeMax: view.getUint16(13, false) / 1000,
    ranges,
  }
}

function decodeLaserScanPayload(payload: Uint8Array): LaserScanMessage | null {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)

  return decodeCdrLaserScanPayload(view) ?? decodeLegacyLaserScanPayload(view)
}

export function useLaserScanMqtt() {
  const isScanVisible = useGridStore(state => state.isScanVisible)
  const updateLaserPose = useGridStore(state => state.updateLaserPose)
  const updateLaserScan = useGridStore(state => state.updateLaserScan)

  useEffect(() => {
    if (!isScanVisible)
      return

    const client = createMqttClient()

    const sendScanPing = () => {
      if (client.connected)
        client.publish(SCAN_PING_TOPIC, new Uint8Array(0))
    }

    const pingTaskId = window.setInterval(sendScanPing, SCAN_PING_INTERVAL_MS)

    client.on('connect', () => {
      client.subscribe(LASER_POSE_TOPIC)
      client.subscribe(SCAN_DATA_TOPIC, (error) => {
        if (!error)
          sendScanPing()
      })
    })

    client.on('message', (topic, payload) => {
      if (topic === LASER_POSE_TOPIC) {
        const pose = decodePosePayload(payload)
        if (pose)
          updateLaserPose(pose)
        return
      }

      if (topic === SCAN_DATA_TOPIC) {
        const scan = decodeLaserScanPayload(payload)
        if (scan)
          updateLaserScan(scan)
      }
    })

    return () => {
      window.clearInterval(pingTaskId)
      teardownMqttClient(client)
    }
  }, [isScanVisible, updateLaserPose, updateLaserScan])
}
