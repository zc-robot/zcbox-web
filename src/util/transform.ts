import type { GridInfoMessage, QuaternionMessage } from '@/types'

// See https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles#Rotation_matrices
// here we use [x y z] = R * [1 0 0]
export function quaternionToCanvasAngle(msg: QuaternionMessage) {
  const sinYaw = 2.0 * (msg.w * msg.z + msg.x * msg.y)
  const cosYaw = 1.0 - 2.0 * (msg.y * msg.y + msg.z * msg.z)
  const yaw = Math.atan2(sinYaw, cosYaw)
  const deg = yaw * 180 / Math.PI
  // Canvas rotation is clock wise and in degrees
  return -deg
}

export function canvasAngleToQuaternion(angle: number): QuaternionMessage {
  const radians = -angle * Math.PI / 180.0
  const cosHalfAngle = Math.cos(radians / 2.0)
  const sinHalfAngle = Math.sin(radians / 2.0)
  const x = 0
  const y = 0
  const z = sinHalfAngle
  const w = cosHalfAngle
  return { x, y, z, w }
}

function getColorVal(value: number) {
  switch (value) {
    case 100:
      return 0
    case 0:
      return 255
    default:
      return 127
  }
}

export function mapImageData(info: GridInfoMessage, mapData: number[]) {
  const width = info.width
  const height = info.height
  const map = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < mapData.length; index++) {
    const data = mapData[index]
    const colorVal = getColorVal(data)
    const row = height - Math.floor(index / width) - 1
    const col = index % width
    const i = (col + (row * width)) * 4
    map[i] = colorVal
    map[i + 1] = colorVal
    map[i + 2] = colorVal
    map[i + 3] = 255
  }
  return map
}
