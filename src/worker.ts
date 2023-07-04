import { GridInfoMessage } from "./types"

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

let mapArray: Uint8ClampedArray | null = null
function transformGrid(info: GridInfoMessage, mapData: number[]) {
  const width = info.width
  const height = info.height
  if (!mapArray || mapArray.length !== width * height * 4)
    mapArray = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < mapData.length; index++) {
    const data = mapData[index]
    const colorVal = getColorVal(data)
    const row = height - Math.floor(index / width) - 1
    const col = index % width
    const i = (col + (row * width)) * 4
    mapArray[i] = colorVal
    mapArray[i + 1] = colorVal
    mapArray[i + 2] = colorVal
    mapArray[i + 3] = 255
  }
  return mapArray
}

export async function mapImageData(info: GridInfoMessage, mapData: number[]) {
  const data = transformGrid(info, mapData)
  const image = new ImageData(data, info.width, info.height)
  return image
}
