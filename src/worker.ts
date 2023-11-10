import type { GridInfoMessage } from './types'

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

const canvas = new OffscreenCanvas(0, 0)
export function mapImageData(info: GridInfoMessage, mapData: number[]) {
  canvas.width = info.width
  canvas.height = info.height

  const context = canvas.getContext('2d')
  if (context) {
    const image = context.createImageData(info.width, info.height)
    const data = image.data

    for (let i = 0; i < data.length; i += 4) {
      const row = info.height - Math.floor(i / info.width / 4) - 1
      const col = (i / 4) % info.width
      const index = col + (row * info.width)
      const colorVal = getColorVal(mapData[index])
      data[i] = colorVal
      data[i + 1] = colorVal
      data[i + 2] = colorVal
      if (mapData[index] === 2) {
        data[i + 3] = 100
      }
      else {
        data[i + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  }
  return canvas.transferToImageBitmap()
}
