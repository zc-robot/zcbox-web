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
// export function mapImageData(info: GridInfoMessage, mapData: number[]) {
//   canvas.width = info.width
//   canvas.height = info.height

//   const context = canvas.getContext('2d')
//   if (context) {
//     const image = context.createImageData(info.width, info.height)
//     const data = image.data

//     for (let i = 0; i < mapData.length; i++) {
//       const value = mapData[i]
//       const colorVal = getColorVal(value)

//       // 计算像素在画布上的位置 (x, y)
//       const x = i % info.width
//       const y = Math.floor(i / info.width) // 假设 mapData 是从上到下存储的

//       // 在 ImageData 中，每个像素占 4 个字节 (R, G, B, A)
//       const dataIndex = (y * info.width + x) * 4

//       data[dataIndex] = colorVal
//       data[dataIndex + 1] = colorVal
//       data[dataIndex + 2] = colorVal
//       data[dataIndex + 3] = value === 2 ? 100 : 255
//     }

//     context.putImageData(image, 0, 0)
//   }
//   return canvas.transferToImageBitmap()
// }
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
      if (mapData[index] === 2)
        data[i + 3] = 100

      else
        data[i + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }
  return canvas.transferToImageBitmap()
}
