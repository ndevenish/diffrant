import type { RawImageData, ViewerState, ImageMetadata } from '../types';
import type { ColormapTable } from './colormaps';
import { getColormapTable } from './colormaps';
import { downsampleBlock } from './downsample';

/**
 * Build a lookup table mapping raw pixel values → 0-255 based on exposure range.
 * For 16-bit: 65536 entries. For 8-bit: 256 entries.
 */
export function buildLUT(depth: 8 | 16 | 32, exposureMin: number, exposureMax: number): Uint8Array {
  const maxVal = depth === 8 ? 256 : depth === 16 ? 65536 : 65536;
  const lut = new Uint8Array(maxVal);
  const range = exposureMax - exposureMin;

  if (range <= 0) {
    // All values map to 0 or 255
    for (let i = 0; i < maxVal; i++) {
      lut[i] = i < exposureMin ? 0 : 255;
    }
    return lut;
  }

  const scale = 255 / range;
  for (let i = 0; i < maxVal; i++) {
    if (i <= exposureMin) {
      lut[i] = 0;
    } else if (i >= exposureMax) {
      lut[i] = 255;
    } else {
      lut[i] = Math.round((i - exposureMin) * scale);
    }
  }
  return lut;
}

// Background color for masked pixels (dark gray)
const MASK_R = 40;
const MASK_G = 40;
const MASK_B = 40;
const MASK_A = 255;

/**
 * Render the visible region of the image onto the canvas.
 */
export function renderRegion(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  imageData: RawImageData,
  viewState: ViewerState,
  metadata: ImageMetadata,
  lut: Uint8Array,
  colormap: ColormapTable,
): void {
  const imgData = ctx.createImageData(canvasWidth, canvasHeight);
  const pixels = imgData.data; // Uint8ClampedArray
  const { data: rawData, width: imgW, height: imgH } = imageData;
  const { pan, zoom, maskEnabled, downsampleMode } = viewState;
  const trustedMax = metadata.trusted_range_max;

  // Canvas center maps to pan position in image space
  const halfCanvasW = canvasWidth / 2;
  const halfCanvasH = canvasHeight / 2;

  if (zoom >= 1) {
    // Zoomed in or 1:1 — nearest neighbor
    for (let cy = 0; cy < canvasHeight; cy++) {
      // Image Y for this canvas row
      const imgY = Math.floor((cy - halfCanvasH) / zoom + pan.y);
      if (imgY < 0 || imgY >= imgH) {
        // Off-image: fill with background
        const rowOffset = cy * canvasWidth * 4;
        for (let cx = 0; cx < canvasWidth; cx++) {
          const p = rowOffset + cx * 4;
          pixels[p] = MASK_R;
          pixels[p + 1] = MASK_G;
          pixels[p + 2] = MASK_B;
          pixels[p + 3] = MASK_A;
        }
        continue;
      }

      const imgRowOffset = imgY * imgW;
      const canvasRowOffset = cy * canvasWidth * 4;

      for (let cx = 0; cx < canvasWidth; cx++) {
        const imgX = Math.floor((cx - halfCanvasW) / zoom + pan.x);
        const p = canvasRowOffset + cx * 4;

        if (imgX < 0 || imgX >= imgW) {
          pixels[p] = MASK_R;
          pixels[p + 1] = MASK_G;
          pixels[p + 2] = MASK_B;
          pixels[p + 3] = MASK_A;
          continue;
        }

        const rawVal = rawData[imgRowOffset + imgX];

        if (maskEnabled && rawVal > trustedMax) {
          pixels[p] = MASK_R;
          pixels[p + 1] = MASK_G;
          pixels[p + 2] = MASK_B;
          pixels[p + 3] = MASK_A;
          continue;
        }

        const lutVal = lut[rawVal] ?? 255;
        const cmOffset = lutVal * 4;
        pixels[p] = colormap[cmOffset];
        pixels[p + 1] = colormap[cmOffset + 1];
        pixels[p + 2] = colormap[cmOffset + 2];
        pixels[p + 3] = colormap[cmOffset + 3];
      }
    }
  } else {
    // Zoomed out — downsample
    const blockSize = 1 / zoom; // image pixels per canvas pixel

    for (let cy = 0; cy < canvasHeight; cy++) {
      const imgYf = (cy - halfCanvasH) / zoom + pan.y;
      const canvasRowOffset = cy * canvasWidth * 4;

      for (let cx = 0; cx < canvasWidth; cx++) {
        const imgXf = (cx - halfCanvasW) / zoom + pan.x;
        const p = canvasRowOffset + cx * 4;

        const startX = Math.floor(imgXf);
        const startY = Math.floor(imgYf);

        if (startX < 0 || startY < 0 || startX >= imgW || startY >= imgH) {
          pixels[p] = MASK_R;
          pixels[p + 1] = MASK_G;
          pixels[p + 2] = MASK_B;
          pixels[p + 3] = MASK_A;
          continue;
        }

        const rawVal = downsampleBlock(
          imageData,
          startX,
          startY,
          Math.ceil(blockSize),
          downsampleMode,
          trustedMax,
        );

        if (maskEnabled && rawVal > trustedMax) {
          pixels[p] = MASK_R;
          pixels[p + 1] = MASK_G;
          pixels[p + 2] = MASK_B;
          pixels[p + 3] = MASK_A;
          continue;
        }

        const lutVal = lut[rawVal] ?? 255;
        const cmOffset = lutVal * 4;
        pixels[p] = colormap[cmOffset];
        pixels[p + 1] = colormap[cmOffset + 1];
        pixels[p + 2] = colormap[cmOffset + 2];
        pixels[p + 3] = colormap[cmOffset + 3];
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function depth2max(depth: 8 | 16 | 32): number {
  if (depth === 8) return 255;
  if (depth === 16) return 65535;
  return 65535;
}

/**
 * Compute histogram of raw image data.
 * Returns bin counts (log-scale ready) and the bin edges.
 */
export function computeHistogram(
  imageData: RawImageData,
  metadata: ImageMetadata,
  numBins: number = 512,
): { counts: Float64Array; binEdges: number[]; maxRaw: number } {
  const { data } = imageData;
  const trustedMax = metadata.trusted_range_max;
  const maxVal = depth2max(imageData.depth);
  const effectiveMax = Math.min(trustedMax, maxVal);

  const counts = new Float64Array(numBins);
  const binWidth = effectiveMax / numBins;
  let maxRaw = 0;

  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    if (val > trustedMax) continue; // skip masked
    if (val > maxRaw) maxRaw = val;
    const bin = Math.min(Math.floor(val / binWidth), numBins - 1);
    counts[bin]++;
  }

  const binEdges: number[] = [];
  for (let i = 0; i <= numBins; i++) {
    binEdges.push(i * binWidth);
  }

  return { counts, binEdges, maxRaw };
}

export { getColormapTable };
