# Diffrant

Diffraction image viewer React component for scientific imaging data.

## Commands

- `npm run dev` — start dev server (Vite)
- `npm run build` — type-check and build (`tsc -b && vite build`)
- `npm run lint` — ESLint
- `npm run preview` — preview production build

## Architecture

Controlled React component: `ViewerState` props in, `onViewerStateChange` callback out.

### Components

Three exported components, each composing the next:

- **`Diffrant`** — fetches a single image+metadata by URL, manages `ImageData` state, passes down to `DiffrantViewer`
- **`DiffrantViewer`** — pure viewer: accepts `ImageData` directly (no fetching), owns canvas + control panel
- **`SeriesViewer`** (optional) — wraps `DiffrantViewer` with a frame navigator bar, caching/prefetch via `useSeriesLoader`, and optional auto-exposure on frame change

### Data types

- **`RawImageData`** — `{ data, width, height, depth }` from the loader
- **`ImageMetadata`** — detector geometry fields (beam center, pixel size, trusted range, etc.)
- **`ImageData`** — combined type: `RawImageData & Omit<ImageMetadata, 'image_depth'>`. The `data` pixel buffer is made **non-enumerable** to prevent React DevTools from serializing it.

### Rendering pipeline

```
Raw pixels (Uint16Array) → Mask check → Downsample (if zoomed out) → LUT[raw] → Colormap[lut] → RGBA → ImageData → Canvas
```

Post-`putImageData` overlays (drawn via Canvas 2D text/lines, not in the pixel loop):
- **Pixel value text** at zoom >= 40x (skipped for masked pixels, auto-contrast using colormap luminance)
- **Beam center crosshair** — blue `+` from `metadata.beam_center`

Key pipeline details:
- **LUT**: 65536-entry `Uint8Array` mapping `[exposureMin, exposureMax]` → `[0, 255]`
- **Colormap**: 256-entry RGBA table (grayscale, inverse, heat, rainbow)
- **Masking**: pixels above `trusted_range_max` always render distinctly — colormap value-0 color by default, red when `showMask` is on. Downsample returns `trustedMax + 1` for all-masked blocks so the pipeline handles them correctly.
- Canvas 2D (not WebGL) — chosen for simplicity and native text rendering for pixel-number overlay
- Zoom out clamped to 90% of fit-to-frame

### Key directories

- `src/diffrant/` — the reusable component
  - `types.ts` — all type definitions (`ViewerState`, `ImageMetadata`, `RawImageData`, `ImageData`, `CursorInfo`, `SeriesInfo`, etc.)
  - `Diffrant.tsx` — URL-fetching wrapper component
  - `DiffrantViewer.tsx` — pure viewer component (accepts `ImageData` directly)
  - `SeriesViewer.tsx` — multi-frame navigator wrapping `DiffrantViewer`
  - `rendering/` — pipeline.ts (LUT, render, histogram, overlays), colormaps.ts, downsample.ts
  - `components/` — ImageCanvas, Histogram, ControlPanel, ColormapSelector, DownsampleSelector
  - `loaders/` — format abstraction; currently PNG via `fast-png` for 16-bit support
  - `hooks/` — useImageLoader, useSeriesLoader (LRU cache + prefetch 2 ahead/1 behind), useViewerState
  - `workers/` — background worker(s) for off-thread processing
- `src/App.tsx` — demo app loading sample data
- `public/data/` — sample 16-bit PNG (4148x4362) + JSON metadata
- `contrib/` — utility scripts (e.g. HDF5→PNG converter)

## Conventions

- TypeScript strict mode, no `any`
- Vanilla CSS (no framework), component-scoped `.css` files
- No state management library — controlled component pattern
- `requestAnimationFrame` for rendering to coalesce rapid state updates
- Nearest-neighbor zoom in, configurable downsampling (average/max) when zoomed out
- Cursor info (fast/slow pixel coordinates + value) displayed in sidebar, not canvas overlay
- Histogram has draggable handles (min/max independently, or drag range between them) plus editable number inputs
