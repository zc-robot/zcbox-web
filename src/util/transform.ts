import { MapMetaDataMessage, QuaternionMessage } from "src/types"

export const getMapXRange = (msg: MapMetaDataMessage) => {
  const x = msg.origin.position.x
  return [x, x + msg.resolution * msg.width]
}

export const getMapYRange = (msg: MapMetaDataMessage) => {
  const y = msg.origin.position.y
  return [y, y + msg.resolution * msg.height]
}

// See https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles#Rotation_matrices
// here we use [x y z] = R * [1 0 0]
export const quaternionToCanvasAngle = (msg: QuaternionMessage) => {
  const sinYaw = 2.0 * (msg.w * msg.z + msg.x * msg.y)
  const cosYaw = 1.0 - 2.0 * (msg.y * msg.y + msg.z * msg.z)
  const yaw = Math.atan2(sinYaw, cosYaw)
  const deg = yaw * 180 / Math.PI
  // Canvas rotation is clock wise and in degrees
  return 90 - deg
}

export const canvasAngleToQuaternion = (angle: number): QuaternionMessage => {
  const radians = (90 - angle) * Math.PI / 180.0
  const cosHalfAngle = Math.cos(radians / 2.0)
  const sinHalfAngle = Math.sin(radians / 2.0)
  const x = 0
  const y = 0
  const z = sinHalfAngle
  const w = cosHalfAngle
  return { x, y, z, w }
}

const getColorVal = (value: number) => {
  switch (value) {
    case 100:
      return 0
    case 0:
      return 255
    default:
      return 127
  }
}

export const mapImageData = (info: MapMetaDataMessage, mapData: number[]) => {
  const width = info.width
  const height = info.height
  const map = new Array<number>(width * height)
  for (var row = 0; row < height; row++) {
    for (var col = 0; col < width; col++) {
      // determine the index into the map data
      const mapI = col + ((height - row - 1) * width)
      // determine the value
      const data = mapData[mapI]
      const colorVal = getColorVal(data)

      // determine the index into the image data array
      var i = (col + (row * width)) * 4
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
