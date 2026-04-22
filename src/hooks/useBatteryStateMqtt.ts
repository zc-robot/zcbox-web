import { useEffect } from 'react'
import { createMqttClient, teardownMqttClient } from './mqtt'
import { useGridStore } from '@/store'

const BATTERY_DATA_TOPIC = 'battery/data'
const BATTERY_PING_TOPIC = 'battery/sub'
const BATTERY_PING_INTERVAL_MS = 3000
const LEGACY_BATTERY_PAYLOAD_VERSION = 1
const LEGACY_BATTERY_PAYLOAD_SIZE = 35
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

function decodeCdrBatteryPayloadWithAlignment(view: DataView, baseOffset: number) {
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

  const voltageResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!voltageResult)
    return null
  offset = voltageResult.offset

  const temperatureResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!temperatureResult)
    return null
  offset = temperatureResult.offset

  const currentResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!currentResult)
    return null
  offset = currentResult.offset

  const chargeResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!chargeResult)
    return null
  offset = chargeResult.offset

  const capacityResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!capacityResult)
    return null
  offset = capacityResult.offset

  const designCapacityResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!designCapacityResult)
    return null
  offset = designCapacityResult.offset

  const percentageResult = readCdrFloat32(view, offset, littleEndian, baseOffset)
  if (!percentageResult)
    return null

  const current = currentResult.value
  const percentage = percentageResult.value
  if (!Number.isFinite(current) || !Number.isFinite(percentage))
    return null

  return {
    battery: percentage * 100,
    batteryCurrent: current,
  }
}

function decodeCdrBatteryPayload(view: DataView) {
  return decodeCdrBatteryPayloadWithAlignment(view, 0)
    ?? decodeCdrBatteryPayloadWithAlignment(view, CDR_HEADER_SIZE)
}

function decodeLegacyBatteryPayload(view: DataView) {
  if (view.byteLength !== LEGACY_BATTERY_PAYLOAD_SIZE)
    return null

  const version = view.getUint8(0)

  if (version !== LEGACY_BATTERY_PAYLOAD_VERSION)
    return null

  return {
    battery: view.getFloat32(19, false) * 100,
    batteryCurrent: view.getFloat32(7, false),
  }
}

function decodeBatteryPayload(payload: Uint8Array) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)

  return decodeCdrBatteryPayload(view) ?? decodeLegacyBatteryPayload(view)
}

export function useBatteryStateMqtt() {
  const updateRobotBattery = useGridStore(state => state.updateRobotBattery)

  useEffect(() => {
    const client = createMqttClient()

    const sendBatteryPing = () => {
      if (client.connected)
        client.publish(BATTERY_PING_TOPIC, '')
    }

    const pingTaskId = window.setInterval(sendBatteryPing, BATTERY_PING_INTERVAL_MS)

    client.on('connect', () => {
      client.subscribe(BATTERY_DATA_TOPIC, (error) => {
        if (!error)
          sendBatteryPing()
      })
    })

    client.on('message', (_topic, payload) => {
      const batteryState = decodeBatteryPayload(payload)
      if (batteryState)
        updateRobotBattery(batteryState.battery, batteryState.batteryCurrent)
    })

    return () => {
      window.clearInterval(pingTaskId)
      teardownMqttClient(client)
    }
  }, [updateRobotBattery])
}
