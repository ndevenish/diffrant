# Diffrant

A React component for viewing 16-bit scientific diffraction images. Supports pan/zoom, colormaps, exposure control, resolution rings, and pixel-level inspection.

## Development/Demo App

```bash
npm install
npm run dev      # demo app at localhost:5173
npm run build    # type-check + library build → dist/
npm run lint
```

The dev server loads a bundled sample image (`public/data/se_thau_10_1_00001.png`, 4148×4362 16-bit PNG) with its accompanying metadata JSON. No backend required.

## Installation

Diffrant is not yet published to npm. Install directly from git:

```bash
npm install git+https://github.com/DiamondLightSource/diffrant.git
```

Then import the stylesheet once at your app root:

```ts
import 'diffrant/style.css';
```

## Usage

```tsx
import { useState } from 'react';
import { Diffrant } from 'diffrant';
import type { ViewerState } from 'diffrant';
import 'diffrant/style.css';

const DEFAULT_STATE: ViewerState = {
  pan: { x: 0, y: 0 },
  zoom: 1,
  exposureMin: 0,
  exposureMax: 1000,
  colormap: 'grayscale',
  downsampleMode: 'average',
  showMask: false,
  showResolutionRings: true,
};

function App() {
  const [viewerState, setViewerState] = useState<ViewerState>(DEFAULT_STATE);

  return (
    <Diffrant
      metadataUrl="/api/images/1/metadata"
      imageUrl="/api/images/1"
      imageNumber={1}
      viewerState={viewerState}
      onViewerStateChange={setViewerState}
    />
  );
}
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `metadataUrl` | `string` | URL returning `ImageMetadata` JSON |
| `imageUrl` | `string` | URL returning raw u16 bytes or PNG |
| `imageNumber` | `number` | Displayed in the UI; used for navigation context |
| `viewerState` | `ViewerState` | Controlled display state |
| `onViewerStateChange` | `(state: ViewerState) => void` | State update callback |

## ViewerState

```ts
interface ViewerState {
  pan: { x: number; y: number }; // image-space coordinates at canvas centre
  zoom: number;                   // canvas pixels per image pixel
  exposureMin: number;            // raw value mapped to black
  exposureMax: number;            // raw value mapped to white
  colormap: 'grayscale' | 'inverse' | 'heat' | 'rainbow';
  downsampleMode: 'average' | 'max';
  showMask: boolean;
  showResolutionRings: boolean;
}
```

## ImageMetadata (server response)

```ts
interface ImageMetadata {
  panel_distance_mm: number;
  beam_center: [number, number];      // [fast, slow] pixels
  pixel_size: number;                 // mm per pixel
  panel_size_fast_slow: [number, number];
  image_depth: 8 | 16 | 32;
  trusted_range_max: number;
  beam_energy_kev?: number;           // required for resolution rings
}
```

## Image format

The component requests images with `Accept: application/octet-stream`. The server should return:

- **Raw** (`Content-Type: application/octet-stream`): little-endian u16 pixels, row-major, no header. Width × height derived from `panel_size_fast_slow` in metadata.
- **PNG** (`Content-Type: image/png`): 16-bit grayscale PNG decoded via `fast-png`.
