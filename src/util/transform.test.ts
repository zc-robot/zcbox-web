import test from 'node:test'
import assert from 'node:assert/strict'

function pngChunk(type: string, content: string | Uint8Array) {
  const payload = typeof content === 'string' ? new TextEncoder().encode(content) : content
  const chunk = new Uint8Array(8 + payload.length + 4)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, payload.length)
  for (let index = 0; index < 4; index++)
    chunk[4 + index] = type.charCodeAt(index)
  chunk.set(payload, 8)
  return chunk
}

function minimalPngWithText(type: string, text: string) {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = pngChunk('IHDR', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]))
  const metadata = pngChunk(type, text)
  const iend = pngChunk('IEND', '')
  const data = new Uint8Array(signature.length + ihdr.length + metadata.length + iend.length)
  let offset = 0
  for (const part of [signature, ihdr, metadata, iend]) {
    data.set(part, offset)
    offset += part.length
  }
  return data
}

test('PNG XMP orientation metadata is detected from iTXt chunks', async () => {
  const { getPngDisplayOrientation } = await import('./pngOrientation.js')
  const data = minimalPngWithText(
    'iTXt',
    'XML:com.adobe.xmp\0\0\0\0\0<rdf:Description xmlns:tiff="http://ns.adobe.com/tiff/1.0/" tiff:Orientation="8" />',
  )

  assert.equal(getPngDisplayOrientation(data), 8)
})

test('PNG without orientation metadata defaults to normal orientation', async () => {
  const { getPngDisplayOrientation } = await import('./pngOrientation.js')
  const data = minimalPngWithText('tEXt', 'Software\0test')

  assert.equal(getPngDisplayOrientation(data), 1)
})
