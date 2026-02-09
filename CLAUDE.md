# Diffrant

Diffraction image viewer React component for scientific imaging data.

## Commands

- `npm run dev` — start dev server (Vite)
- `npm run build` — type-check and build (`tsc -b && vite build`)
- `npm run lint` — ESLint
- `npm run preview` — preview production build

## Architecture

Controlled React component: `ViewerState` props in, `onViewerStateChange` callback out.

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
  - `types.ts` — all type definitions (`ViewerState`, `ImageMetadata`, `RawImageData`, `CursorInfo`, etc.)
  - `rendering/` — pipeline.ts (LUT, render, histogram, overlays), colormaps.ts, downsample.ts
  - `components/` — ImageCanvas, Histogram, ControlPanel, ColormapSelector, DownsampleSelector
  - `loaders/` — format abstraction; currently PNG via `fast-png` for 16-bit support
  - `hooks/` — useImageLoader (fetch + decode), useViewerState (convenience wrapper)
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
