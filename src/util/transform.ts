import type { GridInfoMessage, NavPoint, PoseMessage, QuaternionMessage } from '@/types'

// See https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles#Rotation_matrices
// here we use [x y z] = R * [1 0 0]
export function quaternionToCanvasAngle(msg: QuaternionMessage) {
  const sinYaw = 2.0 * (msg.w * msg.z + msg.x * msg.y)
  const cosYaw = 1.0 - 2.0 * (msg.y * msg.y + msg.z * msg.z)
  const yaw = Math.atan2(sinYaw, cosYaw)
  const deg = yaw * 180 / Math.PI
  // Canvas rotation is clock wise and in degrees
  return 90 - deg
}

export function canvasAngleToQuaternion(angle: number): QuaternionMessage {
  const radians = (90 - angle) * Math.PI / 180.0
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
  const map = new Array<number>(width * height)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      // determine the index into the map data
      const mapI = col + ((height - row - 1) * width)
      // determine the value
      const data = mapData[mapI]
      const colorVal = getColorVal(data)

      // determine the index into the image data array
      let i = (col + (row * width)) * 4
      // r
      map[i] = colorVal
      // g
      map[++i] = colorVal
      // b
      map[++i] = colorVal
      // a
      map[++i] = 255
    }
  }
  return map
}

export function dumpNavPoint(point: NavPoint) {
  return {
    id: point.id,
    position: {
      x: point.x,
      y: -point.y,
      z: 0,
    },
    orientation: canvasAngleToQuaternion(point.rotation),
  } as PoseMessage
}
