import type { RawImageData } from '../types';

/**
 * Downsample a block of pixels starting at (startX, startY) with the given block size.
 * Returns the representative raw value for the block.
 */
export function downsampleBlock(
  imageData: RawImageData,
  startX: number,
  startY: number,
  blockSize: number,
  mode: 'average' | 'max',
  trustedMax: number,
): number {
  const { data, width, height } = imageData;
  const endX = Math.min(startX + blockSize, width);
  const endY = Math.min(startY + blockSize, height);

  if (mode === 'max') {
    let maxVal = 0;
    for (let y = startY; y < endY; y++) {
      const rowOffset = y * width;
      for (let x = startX; x < endX; x++) {
        const val = data[rowOffset + x];
        if (val <= trustedMax && val > maxVal) {
          maxVal = val;
        }
      }
    }
    return maxVal;
  }

  // average mode
  let sum = 0;
  let count = 0;
  for (let y = startY; y < endY; y++) {
    const rowOffset = y * width;
    for (let x = startX; x < endX; x++) {
      const val = data[rowOffset + x];
      if (val <= trustedMax) {
        sum += val;
        count++;
      }
    }
  }
  return count > 0 ? Math.round(sum / count) : 0;
}
