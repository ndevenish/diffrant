import type { RawImageData, ViewerState, ImageMetadata } from '../types';
import type { ColormapTable } from './colormaps';
import { getColormapTable } from './colormaps';

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

// Background color for off-image areas
const BG_R = 40;
const BG_G = 40;
const BG_B = 40;
const BG_A = 255;

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
  const { pan, zoom, showMask, downsampleMode } = viewState;
  const trustedMax = metadata.trusted_range_max;

  // Masked pixel colors: value=0 color by default, red when showMask is on
  const zeroLut = lut[0];
  const zeroCm = zeroLut * 4;
  const maskR = showMask ? 200 : colormap[zeroCm];
  const maskG = showMask ? 50 : colormap[zeroCm + 1];
  const maskB = showMask ? 50 : colormap[zeroCm + 2];

  // Canvas center maps to pan position in image space
  const halfCanvasW = canvasWidth / 2;
  const halfCanvasH = canvasHeight / 2;

  if (zoom >= 1) {
    // Zoomed in or 1:1 — nearest neighbor
    for (let cy = 0; cy < canvasHeight; cy++) {
      const imgY = Math.floor((cy - halfCanvasH) / zoom + pan.y);
      if (imgY < 0 || imgY >= imgH) {
        const rowOffset = cy * canvasWidth * 4;
        for (let cx = 0; cx < canvasWidth; cx++) {
          const p = rowOffset + cx * 4;
          pixels[p] = BG_R; pixels[p + 1] = BG_G; pixels[p + 2] = BG_B; pixels[p + 3] = BG_A;
        }
        continue;
      }

      const imgRowOffset = imgY * imgW;
      const canvasRowOffset = cy * canvasWidth * 4;

      for (let cx = 0; cx < canvasWidth; cx++) {
        const imgX = Math.floor((cx - halfCanvasW) / zoom + pan.x);
        const p = canvasRowOffset + cx * 4;

        if (imgX < 0 || imgX >= imgW) {
          pixels[p] = BG_R; pixels[p + 1] = BG_G; pixels[p + 2] = BG_B; pixels[p + 3] = BG_A;
          continue;
        }

        const rawVal = rawData[imgRowOffset + imgX];

        if (rawVal > trustedMax) {
          pixels[p] = maskR; pixels[p + 1] = maskG; pixels[p + 2] = maskB; pixels[p + 3] = 255;
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
    // Zoomed out — inline downsample (avoids per-pixel function call overhead)
    const blockSizeI = Math.ceil(1 / zoom);

    // Hoist mode branch out of the hot pixel loop
    if (downsampleMode === 'max') {
      for (let cy = 0; cy < canvasHeight; cy++) {
        const imgYf = (cy - halfCanvasH) / zoom + pan.y;
        const startY = Math.floor(imgYf);
        const canvasRowOffset = cy * canvasWidth * 4;

        for (let cx = 0; cx < canvasWidth; cx++) {
          const p = canvasRowOffset + cx * 4;
          const imgXf = (cx - halfCanvasW) / zoom + pan.x;
          const startX = Math.floor(imgXf);

          if (startX < 0 || startY < 0 || startX >= imgW || startY >= imgH) {
            pixels[p] = BG_R; pixels[p + 1] = BG_G; pixels[p + 2] = BG_B; pixels[p + 3] = BG_A;
            continue;
          }

          // Inline max downsample
          const endX = startX + blockSizeI < imgW ? startX + blockSizeI : imgW;
          const endY = startY + blockSizeI < imgH ? startY + blockSizeI : imgH;
          let maxVal = -1;
          for (let by = startY; by < endY; by++) {
            const ro = by * imgW;
            for (let bx = startX; bx < endX; bx++) {
              const v = rawData[ro + bx];
              if (v <= trustedMax && v > maxVal) maxVal = v;
            }
          }
          const rawVal = maxVal >= 0 ? maxVal : trustedMax + 1;

          if (rawVal > trustedMax) {
            pixels[p] = maskR; pixels[p + 1] = maskG; pixels[p + 2] = maskB; pixels[p + 3] = 255;
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
      // average mode
      for (let cy = 0; cy < canvasHeight; cy++) {
        const imgYf = (cy - halfCanvasH) / zoom + pan.y;
        const startY = Math.floor(imgYf);
        const canvasRowOffset = cy * canvasWidth * 4;

        for (let cx = 0; cx < canvasWidth; cx++) {
          const p = canvasRowOffset + cx * 4;
          const imgXf = (cx - halfCanvasW) / zoom + pan.x;
          const startX = Math.floor(imgXf);

          if (startX < 0 || startY < 0 || startX >= imgW || startY >= imgH) {
            pixels[p] = BG_R; pixels[p + 1] = BG_G; pixels[p + 2] = BG_B; pixels[p + 3] = BG_A;
            continue;
          }

          // Inline average downsample
          const endX = startX + blockSizeI < imgW ? startX + blockSizeI : imgW;
          const endY = startY + blockSizeI < imgH ? startY + blockSizeI : imgH;
          let sum = 0;
          let count = 0;
          for (let by = startY; by < endY; by++) {
            const ro = by * imgW;
            for (let bx = startX; bx < endX; bx++) {
              const v = rawData[ro + bx];
              if (v <= trustedMax) { sum += v; count++; }
            }
          }
          const rawVal = count > 0 ? Math.round(sum / count) : trustedMax + 1;

          if (rawVal > trustedMax) {
            pixels[p] = maskR; pixels[p + 1] = maskG; pixels[p + 2] = maskB; pixels[p + 3] = 255;
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
  }

  ctx.putImageData(imgData, 0, 0);

  // Draw pixel value text when zoomed in far enough
  const MIN_ZOOM_FOR_TEXT = 25;
  if (zoom >= MIN_ZOOM_FOR_TEXT) {
    // Compute visible image pixel range
    const imgXStart = Math.floor((0 - halfCanvasW) / zoom + pan.x);
    const imgXEnd = Math.ceil((canvasWidth - halfCanvasW) / zoom + pan.x);
    const imgYStart = Math.floor((0 - halfCanvasH) / zoom + pan.y);
    const imgYEnd = Math.ceil((canvasHeight - halfCanvasH) / zoom + pan.y);

    const fontSize = Math.max(9, Math.min(zoom * 0.3, 16));
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let iy = Math.max(0, imgYStart); iy <= Math.min(imgH - 1, imgYEnd); iy++) {
      for (let ix = Math.max(0, imgXStart); ix <= Math.min(imgW - 1, imgXEnd); ix++) {
        const rawVal = rawData[iy * imgW + ix];
        if (rawVal > trustedMax) continue;

        // Canvas position of this pixel's center
        const cx = (ix - pan.x + 0.5) * zoom + halfCanvasW;
        const cy = (iy - pan.y + 0.5) * zoom + halfCanvasH;

        // Pick text color contrasting with the actual rendered pixel color
        const lv = lut[rawVal] ?? 255;
        const cmOff = lv * 4;
        const lum = colormap[cmOff] * 0.299 + colormap[cmOff + 1] * 0.587 + colormap[cmOff + 2] * 0.114;
        ctx.fillStyle = lum > 127 ? '#000' : '#fff';

        ctx.fillText(String(rawVal), cx, cy);
      }
    }
  }

  // Draw beam center marker
  const [bcX, bcY] = metadata.beam_center;
  const bcCanvasX = (bcX - pan.x) * zoom + halfCanvasW;
  const bcCanvasY = (bcY - pan.y) * zoom + halfCanvasH;
  const armLen = Math.max(8, zoom * 0.5);
  ctx.strokeStyle = '#4a90d9';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(bcCanvasX - armLen, bcCanvasY);
  ctx.lineTo(bcCanvasX + armLen, bcCanvasY);
  ctx.moveTo(bcCanvasX, bcCanvasY - armLen);
  ctx.lineTo(bcCanvasX, bcCanvasY + armLen);
  ctx.stroke();

  if (viewState.showResolutionRings) {
    drawResolutionRings(ctx, canvasWidth, canvasHeight, metadata, viewState);
  }
}

const ALL_RESOLUTION_RINGS_ANGSTROM = [
  50.0, 20.0, 10.0, 8.0, 6.0, 5.0, 4.0,
  3.5, 3.0, 2.5, 2.0, 1.8, 1.5, 1.4, 1.2,
  1.0, 0.9, 0.8,
];

function drawResolutionRings(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  metadata: ImageMetadata,
  viewState: ViewerState,
): void {
  const { beam_energy_kev, beam_center, panel_distance_mm, pixel_size, panel_size_fast_slow } = metadata;
  if (!beam_energy_kev) return;

  const wavelength = 12.398419843 / beam_energy_kev; // Å
  const [bcX, bcY] = beam_center;
  const [imgW, imgH] = panel_size_fast_slow;

  // Find the farthest corner and its unit direction from the beam center
  const corners: [number, number][] = [[0, 0], [imgW, 0], [0, imgH], [imgW, imgH]];
  let maxCornerPx = 0;
  let labelDirX = 1;
  let labelDirY = -1;
  for (const [cx, cy] of corners) {
    const dist = Math.sqrt((cx - bcX) ** 2 + (cy - bcY) ** 2);
    if (dist > maxCornerPx) {
      maxCornerPx = dist;
      labelDirX = (cx - bcX) / dist;
      labelDirY = (cy - bcY) / dist;
    }
  }
  const twoThetaCorner = Math.atan2(maxCornerPx * pixel_size, panel_distance_mm);
  const dCorner = wavelength / (2 * Math.sin(twoThetaCorner / 2));

  // Evenly divide d*² = 1/d² from 0 to 1/dCorner² into N steps,
  // snapping each target to the nearest candidate that lies within the corners
  const N = 5;
  const dStarSqMax = 1 / (dCorner * dCorner);
  const withinCorners = ALL_RESOLUTION_RINGS_ANGSTROM.filter(d => d >= dCorner);
  if (withinCorners.length === 0) return;
  const rings = Array.from({ length: N }, (_, i) => {
    const targetDStarSq = ((i + 1) / N) * dStarSqMax;
    const targetD = 1 / Math.sqrt(targetDStarSq);
    return withinCorners.reduce((best, d) =>
      Math.abs(d - targetD) < Math.abs(best - targetD) ? d : best
    );
  });
  // Deduplicate while preserving order
  const uniqueRings = [...new Set(rings)];
  if (uniqueRings.length === 0) return;

  const { pan, zoom } = viewState;
  const halfCanvasW = canvasWidth / 2;
  const halfCanvasH = canvasHeight / 2;
  const bcCanvasX = (bcX - pan.x) * zoom + halfCanvasW;
  const bcCanvasY = (bcY - pan.y) * zoom + halfCanvasH;

  // Text alignment relative to the label direction
  const labelTextAlign = labelDirX > 0.1 ? 'left' : labelDirX < -0.1 ? 'right' : 'center';
  const labelTextBaseline = labelDirY > 0.1 ? 'top' : labelDirY < -0.1 ? 'bottom' : 'middle';

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 60, 60, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
  ctx.textAlign = labelTextAlign;
  ctx.textBaseline = labelTextBaseline;

  for (const d of uniqueRings) {
    const sinTheta = wavelength / (2 * d);
    if (sinTheta >= 1) continue;
    const twoTheta = 2 * Math.asin(sinTheta);
    const rCanvas = (panel_distance_mm * Math.tan(twoTheta) / pixel_size) * zoom;

    ctx.beginPath();
    ctx.arc(bcCanvasX, bcCanvasY, rCanvas, 0, 2 * Math.PI);
    ctx.stroke();

    const labelOffset = 4;
    ctx.fillText(
      `${d}Å`,
      bcCanvasX + labelDirX * (rCanvas + labelOffset),
      bcCanvasY + labelDirY * (rCanvas + labelOffset),
    );
  }

  ctx.restore();
}

/**
 * Calculate d-spacing resolution (Å) for a detector pixel at (fast, slow).
 * Returns null if beam_energy_kev is not available or pixel is at the beam center.
 */
export function pixelResolution(fast: number, slow: number, metadata: ImageMetadata): number | null {
  const { beam_energy_kev, beam_center, panel_distance_mm, pixel_size } = metadata;
  if (!beam_energy_kev) return null;

  const [bcX, bcY] = beam_center;
  const drPx = Math.sqrt((fast - bcX) ** 2 + (slow - bcY) ** 2);
  if (drPx === 0) return null;

  const wavelength = 12.398419843 / beam_energy_kev; // Å
  const twoTheta = Math.atan2(drPx * pixel_size, panel_distance_mm);
  const sinTheta = Math.sin(twoTheta / 2);
  if (sinTheta <= 0) return null;

  return wavelength / (2 * sinTheta);
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
