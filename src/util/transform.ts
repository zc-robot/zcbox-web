import type { QuaternionMessage } from '@/types'

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

export function parsePgm(data: Uint8Array): { width: number; height: number; data: number[] } {
  let position = 0;

  // Read magic number (P2 or P5)
  let magicNumber = '';
  while (position < data.length && data[position] !== 10) {
    magicNumber += String.fromCharCode(data[position++]);
  }
  position++;
  if (magicNumber !== 'P2' && magicNumber !== 'P5') {
    throw new Error('Unsupported PGM format, only P2 and P5 are supported.');
  }

  // Helper to read next number (skips comments and whitespace)
  const readNumber = (): number => {
    let numStr = '';
    // Skip comments and whitespace
    while (position < data.length) {
      const char = data[position];
      if (char === 35) { // '#'
        while (position < data.length && data[position] !== 10) position++;
        position++;
      } else if (char <= 32) { // Whitespace
        position++;
      } else {
        break;
      }
    }
    // Read digits
    while (position < data.length && data[position] > 32 && data[position] <= 126) {
      numStr += String.fromCharCode(data[position++]);
    }
    return Number.parseInt(numStr, 10);
  };

  // Read dimensions and max value
  const width = readNumber();
  const height = readNumber();
  const maxValue = readNumber();

  const totalPixels = width * height;
  const result = new Int32Array(totalPixels); // Use Int32Array for better performance

  if (magicNumber === 'P2') {
    // ASCII format: Process directly into flipped order
    for (let y = height - 1; y >= 0; y--) { // Start from bottom row
      for (let x = 0; x < width; x++) {
        const pixelValue = readNumber();
        const index = y * width + x;
        if (pixelValue === 0) {
          result[index] = 0; // occupied
        } else if (pixelValue === 255 || (maxValue === 255 && pixelValue > 200)) {
          result[index] = 100; // free
        } else {
          result[index] = -1; // unknown
        }
      }
    }
  } else {
    // P5 (Binary) format: Process directly into flipped order
    for (let y = height - 1; y >= 0; y--) { // Start from bottom row
      const rowStart = y * width;
      for (let x = 0; x < width; x++) {
        const pixelValue = data[position++];
        const index = rowStart + x;
        if (pixelValue === 0) {
          result[index] = 100; // occupied
        } else if (pixelValue >= 250) {
          result[index] = 0; // free
        } else {
          result[index] = -1; // unknown
        }
      }
    }
  }

  return { width, height, data: Array.from(result) }; // Convert to regular array if needed
}
/**
 * 解压 RLE 压缩的 occupancy grid data
 * @param data - 原始压缩数据，每个元素是 0~255 的整数（Uint8Array 形式更合适，但兼容 number[]）
 * @returns 解压后的 number[]，每个值在 -128~127 或 0~255 范围（根据原始语义）
 */
export function decodeRLE(data: number[]): number[] {
  // 将输入转换为 Uint8Array 以便用 DataView 操作
  const uint8 = new Uint8Array(data)
  const buffer = uint8.buffer
  const view = new DataView(buffer)

  let offset = 0

  // // Step 1: 跳过前 4 字节
  // offset += 4;

  // Step 2: 读取 4 字节压缩方法
  let method = ''
  for (let i = 0; i < 4; i++)
    method += String.fromCharCode(uint8[offset + i])

  offset += 4

  if (method !== 'RLE ')
    throw new Error(`Unsupported compression method: "${method}"`)

  // Step 3: 读取原始长度（小端 or 大端？Kotlin ByteBuffer 默认是大端，但 ROS 通常小端）
  // 注意：Kotlin 的 ByteBuffer 默认是 BIG_ENDIAN，但 ROS2 /大多数系统用 LITTLE_ENDIAN
  // 根据你的数据示例：[82,76,69,32,...] -> "RLE "，后面是长度，需确认字节序
  // 假设是 LITTLE_ENDIAN（常见于 x86），若不对可改为 false
  const originalLength = view.getInt32(offset, true) // true = littleEndian
  offset += 4

  const result: number[] = []

  // Step 4: RLE 解压
  while (result.length < originalLength) {
    if (offset >= uint8.length)
      throw new Error('Unexpected end of data during RLE decompression')

    const value = uint8[offset]
    offset += 1

    if (offset + 4 > uint8.length)
      throw new Error('Incomplete count in RLE stream')

    const count = view.getInt32(offset, true) // littleEndian
    offset += 4

    if (count < 0)
      throw new Error(`Invalid RLE count: ${count}`)

    for (let i = 0; i < count; i++)
      result.push(value)
  }

  if (result.length !== originalLength)
    console.warn('Decoded length mismatch:', result.length, 'vs expected', originalLength)

  return result
}

// Worker instance
export const mapWorker = new ComlinkWorker<typeof import('../worker')>(
  new URL('../worker', import.meta.url), { type: 'module' },
)
