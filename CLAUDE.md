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

- **LUT**: 65536-entry `Uint8Array` mapping `[exposureMin, exposureMax]` → `[0, 255]`
- **Colormap**: 256-entry RGBA table (grayscale, inverse, heat, rainbow)
- Canvas 2D (not WebGL) — chosen for simplicity and native text rendering (future pixel-number overlay)

### Key directories

- `src/diffrant/` — the reusable component
  - `types.ts` — all type definitions (`ViewerState`, `ImageMetadata`, `RawImageData`, etc.)
  - `rendering/` — pipeline.ts (LUT, render, histogram), colormaps.ts, downsample.ts
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
- Masked pixels (above `trusted_range_max`) render as dark background (#282828)
