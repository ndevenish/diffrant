import type { ColormapName } from '../types';

// Each colormap is a Uint8Array of 256*4 entries (RGBA)
export type ColormapTable = Uint8Array;

function makeColormap(fn: (v: number) => [number, number, number]): ColormapTable {
  const table = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = fn(i);
    const offset = i * 4;
    table[offset] = r;
    table[offset + 1] = g;
    table[offset + 2] = b;
    table[offset + 3] = 255;
  }
  return table;
}

const grayscale = makeColormap((v) => [v, v, v]);

const inverse = makeColormap((v) => [255 - v, 255 - v, 255 - v]);

const heat = makeColormap((v) => {
  // black → red → yellow → white
  if (v < 85) {
    return [v * 3, 0, 0];
  } else if (v < 170) {
    const t = v - 85;
    return [255, t * 3, 0];
  } else {
    const t = v - 170;
    return [255, 255, Math.min(255, t * 3)];
  }
});

const rainbow = makeColormap((v) => {
  // HSV-style rainbow: red → yellow → green → cyan → blue → magenta
  const h = (v / 255) * 300; // 0 to 300 degrees
  const s = 1, l = 0.5;
  // Convert HSL to RGB
  const c = 1;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  void s; void l;
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
});

const colormapRegistry: Record<ColormapName, ColormapTable> = {
  grayscale,
  inverse,
  heat,
  rainbow,
};

export function getColormapTable(name: ColormapName): ColormapTable {
  return colormapRegistry[name];
}

export const COLORMAP_NAMES: ColormapName[] = ['grayscale', 'inverse', 'heat', 'rainbow'];
