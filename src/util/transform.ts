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
export const quaternionToAngle = (msg: QuaternionMessage) => {
  const q0 = msg.w
  const q1 = msg.x
  const q2 = msg.y
  const q3 = msg.z
  // Canvas rotation is clock wise and in degrees
  return -Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3)) * 180.0 / Math.PI
}

export const angleToQuaternion = (angle: number): QuaternionMessage => {
  const q0 = Math.cos(angle / 2)
  const q1 = Math.sin(angle / 2)
  const q2 = 0
  const q3 = 0
  return { x: q1, y: q2, z: q3, w: q0 }
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
