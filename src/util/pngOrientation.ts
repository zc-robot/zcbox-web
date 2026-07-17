export type PngDisplayOrientation = 1 | 3 | 6 | 8

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]

function isPng(data: Uint8Array) {
  return data.length >= pngSignature.length
    && pngSignature.every((byte, index) => data[index] === byte)
}

function readPngUint32(data: Uint8Array, index: number) {
  if (index + 4 > data.length)
    return null

  return (
    data[index] * 0x1000000
    + (data[index + 1] << 16)
    + (data[index + 2] << 8)
    + data[index + 3]
  )
}

function getPngChunkType(data: Uint8Array, index: number) {
  if (index + 4 > data.length)
    return ''

  return String.fromCharCode(data[index], data[index + 1], data[index + 2], data[index + 3])
}

function decodePngTextChunk(data: Uint8Array, index: number, length: number) {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(data.slice(index, index + length))
  }
  catch {
    return ''
  }
}

function parsePngOrientationValue(text: string): PngDisplayOrientation | null {
  const inlineMatch = /\b(?:tiff|exif):Orientation\s*=\s*["']?([1368])["']?/i.exec(text)
  const elementMatch = /<(?:tiff|exif):Orientation[^>]*>\s*([1368])\s*<\/(?:tiff|exif):Orientation>/i.exec(text)
  const value = Number(inlineMatch?.[1] ?? elementMatch?.[1])

  if (value === 3 || value === 6 || value === 8)
    return value

  return null
}

export function getPngDisplayOrientation(data: Uint8Array): PngDisplayOrientation {
  if (!isPng(data))
    return 1

  let index = pngSignature.length
  while (index + 12 <= data.length) {
    const length = readPngUint32(data, index)
    if (length == null)
      break

    const type = getPngChunkType(data, index + 4)
    const chunkDataIndex = index + 8
    const nextIndex = chunkDataIndex + length + 4
    if (nextIndex > data.length)
      break

    if (type === 'iTXt' || type === 'tEXt') {
      const orientation = parsePngOrientationValue(decodePngTextChunk(data, chunkDataIndex, length))
      if (orientation)
        return orientation
    }

    if (type === 'IEND')
      break

    index = nextIndex
  }

  return 1
}

export function swapsPngAxes(orientation: PngDisplayOrientation) {
  return orientation === 6 || orientation === 8
}
