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
// export function parsePgm(data: Uint8Array): { width: number; height: number; data: number[] } {
//   let position = 0

//   // Read magic number (P2 or P5)
//   let magicNumber = ''
//   while (position < data.length && data[position] !== 10) { // 10 is '\n'
//     magicNumber += String.fromCharCode(data[position])
//     position++
//   }
//   position++ // skip '\n'

//   if (magicNumber !== 'P2' && magicNumber !== 'P5')
//     throw new Error('Unsupported PGM format, only P2 and P5 are supported.')

//   // Skip comments and whitespaces
//   while (position < data.length) {
//     const char = String.fromCharCode(data[position])
//     if (char === '#')
//       while (position < data.length && data[position] !== 10) position++
//     else if (char === ' ' || char === '\t' || char === '\r' || char === '\n')
//       position++
//     else
//       break
//   }

//   // Read width
//   let widthStr = ''
//   while (position < data.length && data[position] !== 32 && data[position] !== 10) {
//     widthStr += String.fromCharCode(data[position])
//     position++
//   }
//   const width = Number.parseInt(widthStr, 10)

//   // Skip whitespace
//   while (position < data.length && (data[position] === 32 || data[position] === 10)) position++

//   // Read height
//   let heightStr = ''
//   while (position < data.length && data[position] !== 32 && data[position] !== 10) {
//     heightStr += String.fromCharCode(data[position])
//     position++
//   }
//   const height = Number.parseInt(heightStr, 10)

//   // Skip whitespace
//   while (position < data.length && (data[position] === 32 || data[position] === 10)) position++

//   // Read max value
//   let maxValueStr = ''
//   while (position < data.length && data[position] !== 10) {
//     maxValueStr += String.fromCharCode(data[position])
//     position++
//   }
//   const maxValue = Number.parseInt(maxValueStr, 10)
//   position++

//   // Pixel data
//   const totalPixels = width * height
//   const result: number[] = new Array(totalPixels)

//   if (magicNumber === 'P2') {
//     // ASCII format
//     let pixelIndex = 0
//     while (pixelIndex < totalPixels && position < data.length) {
//       let numStr = ''
//       // Skip whitespace
//       while (position < data.length && (data[position] <= 32 || data[position] > 126)) position++
//       if (position >= data.length) break

//       // Read number
//       while (position < data.length && data[position] > 32 && data[position] <= 126) {
//         numStr += String.fromCharCode(data[position])
//         position++
//       }
//       if (numStr === '') break

//       const pixelValue = Number.parseInt(numStr, 10)

//       if (pixelValue === 0)
//         result[pixelIndex] = 0 // occupied
//       else if (pixelValue === 255 || (maxValue === 255 && pixelValue > 200))
//         result[pixelIndex] = 100 // free
//       else
//         result[pixelIndex] = -1 // unknown

//       pixelIndex++
//     }
//   }
//   else if (magicNumber === 'P5') {
//     // Binary format
//     for (let i = 0; i < totalPixels; i++) {
//       const pixelValue = data[position++]
//       if (pixelValue === 0) {
//         result[i] = 100 // occupied
//       } else if (pixelValue >= 250) {
//         result[i] = 0 // free
//       } else {
//         result[i] = -1 // unknown
//       }
//     }
//   }

//   // ✅ 关键修改：将 result 按行上下翻转（Y 轴翻转）
//   // 即：第 0 行 <-> 第 height-1 行
//   const flippedResult: number[] = new Array(totalPixels)
//   for (let y = 0; y < height; y++) {
//     const srcRow = y
//     const dstRow = height - 1 - y // 翻转行
//     for (let x = 0; x < width; x++) {
//       const srcIndex = srcRow * width + x
//       const dstIndex = dstRow * width + x
//       flippedResult[srcIndex] = result[dstIndex]
//     }
//   }

//   return { width, height, data: flippedResult }
// }

// Worker instance
export const mapWorker = new ComlinkWorker<typeof import('../worker')>(
  new URL('../worker', import.meta.url), { type: 'module' },
)
