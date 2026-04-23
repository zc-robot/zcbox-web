import mqtt from 'mqtt'
import type { MqttClient } from 'mqtt'
import type { PoseMessage } from '@/types'
import apiServer from '@/service/apiServer'

const CDR_HEADER_SIZE = 4
const POSE_CDR_DOUBLE_COUNT = 7
const TWIST_CDR_PAYLOAD_SIZE = 52

export interface TwistCommand {
  linearX?: number
  linearY?: number
  linearZ?: number
  angularX?: number
  angularY?: number
  angularZ?: number
}

export function createMqttClient() {
  return mqtt.connect(apiServer.mqttWsUrl, {
    username: 'zc',
    password: '8888',
    protocolVersion: 4,
    clean: true,
    resubscribe: true,
    keepalive: 15,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
  })
}

function alignCdrOffset(offset: number, alignment: number) {
  const remainder = offset % alignment
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

function quaternionToEuler(x: number, y: number, z: number, w: number) {
  const sinRoll = 2 * (w * x + y * z)
  const cosRoll = 1 - 2 * (x * x + y * y)
  const roll = Math.atan2(sinRoll, cosRoll)

  const sinPitch = 2 * (w * y - z * x)
  const pitch = Math.abs(sinPitch) >= 1
    ? Math.sign(sinPitch) * Math.PI / 2
    : Math.asin(sinPitch)

  const sinYaw = 2 * (w * z + x * y)
  const cosYaw = 1 - 2 * (y * y + z * z)
  const yaw = Math.atan2(sinYaw, cosYaw)

  return { roll, pitch, yaw }
}

function createPoseMessage(
  positionX: number,
  positionY: number,
  positionZ: number,
  orientationX: number,
  orientationY: number,
  orientationZ: number,
  orientationW: number,
): PoseMessage | null {
  const values = [
    positionX,
    positionY,
    positionZ,
    orientationX,
    orientationY,
    orientationZ,
    orientationW,
  ]

  if (!values.every(Number.isFinite))
    return null

  const quaternionNorm = Math.hypot(orientationX, orientationY, orientationZ, orientationW)
  if (!Number.isFinite(quaternionNorm) || quaternionNorm < 0.5 || quaternionNorm > 1.5)
    return null

  const normalizedX = orientationX / quaternionNorm
  const normalizedY = orientationY / quaternionNorm
  const normalizedZ = orientationZ / quaternionNorm
  const normalizedW = orientationW / quaternionNorm
  const { roll, pitch, yaw } = quaternionToEuler(normalizedX, normalizedY, normalizedZ, normalizedW)

  return {
    position: {
      x: positionX,
      y: positionY,
      z: positionZ,
    },
    orientation: {
      x: normalizedX,
      y: normalizedY,
      z: normalizedZ,
      w: normalizedW,
    },
    pyr: {
      yaw,
      pitch,
      roll,
    },
  }
}

function decodeLegacyPosePayload(view: DataView): PoseMessage | null {
  if (view.byteLength !== 12)
    return null

  const yaw = view.getFloat32(8, false)

  return createPoseMessage(
    view.getFloat32(0, false),
    view.getFloat32(4, false),
    0,
    0,
    0,
    Math.sin(yaw / 2),
    Math.cos(yaw / 2),
  )
}

function readPoseCdrValues(view: DataView, littleEndian: boolean, aligned: boolean) {
  const values: number[] = []
  let offset = CDR_HEADER_SIZE

  for (let i = 0; i < POSE_CDR_DOUBLE_COUNT; i++) {
    if (aligned)
      offset = alignCdrOffset(offset, 8)

    if (offset + 8 > view.byteLength)
      return null

    values.push(view.getFloat64(offset, littleEndian))
    offset += 8
  }

  return values
}

function decodeCdrPosePayload(view: DataView): PoseMessage | null {
  const littleEndian = getCdrLittleEndian(view)
  if (littleEndian === null)
    return null

  const alignedValues = readPoseCdrValues(view, littleEndian, true)
  if (alignedValues) {
    const pose = createPoseMessage(
      alignedValues[0],
      alignedValues[1],
      alignedValues[2],
      alignedValues[3],
      alignedValues[4],
      alignedValues[5],
      alignedValues[6],
    )
    if (pose)
      return pose
  }

  const unalignedValues = readPoseCdrValues(view, littleEndian, false)
  if (!unalignedValues)
    return null

  return createPoseMessage(
    unalignedValues[0],
    unalignedValues[1],
    unalignedValues[2],
    unalignedValues[3],
    unalignedValues[4],
    unalignedValues[5],
    unalignedValues[6],
  )
}

export function decodePosePayload(payload: Uint8Array): PoseMessage | null {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)

  return decodeCdrPosePayload(view) ?? decodeLegacyPosePayload(view)
}

function sanitizeTwistValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function encodeTwistPayload(command: TwistCommand) {
  const payload = new Uint8Array(TWIST_CDR_PAYLOAD_SIZE)
  const view = new DataView(payload.buffer)
  let offset = CDR_HEADER_SIZE

  view.setUint16(0, 1, false)
  view.setUint16(2, 0, false)

  const values = [
    command.linearX,
    command.linearY,
    command.linearZ,
    command.angularX,
    command.angularY,
    command.angularZ,
  ]

  for (const value of values) {
    view.setFloat64(offset, sanitizeTwistValue(value), true)
    offset += 8
  }

  return payload
}

export function teardownMqttClient(client: MqttClient) {
  client.removeAllListeners()
  client.end(true)
}
