import { useRef, useEffect, useCallback, useState } from 'react';
import type { ImageData, ViewerState, ImageMetadata, CursorInfo } from '../types';
import { buildLUT, renderRegion, getColormapTable, pixelResolution } from '../rendering/pipeline';
import './ImageCanvas.css';

const SOFT_STOP = 25;
const SOFT_STOP_THRESHOLD = 300;

interface ImageCanvasProps {
  imageData: ImageData;
  viewerState: ViewerState;
  onViewerStateChange: (state: ViewerState) => void;
  onCursorChange: (info: CursorInfo | null) => void;
}

export function ImageCanvas({
  imageData,
  viewerState,
  onViewerStateChange,
  onCursorChange,
}: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const hasAutoFit = useRef(false);
  const loupe = useRef({ active: false, imgX: 0, imgY: 0, canvasX: 0, canvasY: 0 });
  const isZooming = useRef(false);
  const zoomOrigin = useRef({ canvasX: 0, canvasY: 0, imgX: 0, imgY: 0 });
  const lastRightClick = useRef(0);
  const softStopAccum = useRef(0);
  const softStopTimeout = useRef(0);
  const lutCache = useRef<{ exposureMin: number; exposureMax: number; depth: number; lut: Uint8Array } | null>(null);
  const pixelBuffer = useRef<globalThis.ImageData | null>(null);
  const loupePixelBuffer = useRef<globalThis.ImageData | null>(null);

  // Live viewer state — updated from props AND directly from mouse handlers.
  // Canvas renders from this ref, avoiding a full React round-trip per frame.
  const liveState = useRef(viewerState);
  const rafId = useRef(0);
  // Track the last state we sent to the parent, so the props-sync effect can
  // distinguish "parent echoing our own update" from "genuinely new external change".
  const lastSentState = useRef(viewerState);

  // Keep callback refs stable so mouse handlers don't need re-creation
  const onChangeRef = useRef(onViewerStateChange);
  onChangeRef.current = onViewerStateChange;

  // Notify parent and record the sent state so props-sync can ignore the echo.
  const emitState = useCallback((state: ViewerState) => {
    lastSentState.current = state;
    onChangeRef.current(state);
  }, []);
  const onCursorRef = useRef(onCursorChange);
  onCursorRef.current = onCursorChange;

  // Sync from props (exposure/colormap changes from ControlPanel, etc.)
  // Only apply when the incoming props differ from what we last sent — this
  // means the change originated externally (e.g. ControlPanel).  Skip echoed
  // updates from our own interaction handlers to avoid reverting liveState
  // to a stale value during rapid wheel/drag sequences.
  useEffect(() => {
    if (viewerState !== lastSentState.current) {
      liveState.current = viewerState;
      lastSentState.current = viewerState;
    }
  }, [viewerState]);

  // Minimum zoom: image fills ~90% of frame
  const minZoom = canvasSize.width > 0 && canvasSize.height > 0
    ? 0.9 * Math.min(canvasSize.width / imageData.width, canvasSize.height / imageData.height)
    : 0.01;

  // Schedule a canvas render — coalesces via single RAF
  const scheduleRender = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || canvasSize.width === 0 || canvasSize.height === 0) return;

      // Fix 1: only reset canvas backing store when dimensions actually change
      if (canvas.width !== canvasSize.width || canvas.height !== canvasSize.height) {
        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const vs = liveState.current;

      // Fix 2: cache the LUT; only rebuild when exposure or depth changes
      const cached = lutCache.current;
      const lut = (cached && cached.exposureMin === vs.exposureMin && cached.exposureMax === vs.exposureMax && cached.depth === imageData.depth)
        ? cached.lut
        : (() => {
            const newLut = buildLUT(imageData.depth, vs.exposureMin, vs.exposureMax);
            lutCache.current = { exposureMin: vs.exposureMin, exposureMax: vs.exposureMax, depth: imageData.depth, lut: newLut };
            return newLut;
          })();

      const colormap = getColormapTable(vs.colormap);

      // Fix 3: reuse pixel buffer; only reallocate when canvas size changes
      if (!pixelBuffer.current || pixelBuffer.current.width !== canvasSize.width || pixelBuffer.current.height !== canvasSize.height) {
        pixelBuffer.current = ctx.createImageData(canvasSize.width, canvasSize.height);
      }
      renderRegion(ctx, canvasSize.width, canvasSize.height, imageData, vs, imageData as unknown as ImageMetadata, lut, colormap, pixelBuffer.current);

       // Loupe overlay
       const loupeCanvas = loupeCanvasRef.current;
       if (loupeCanvas) {
         const hi = 255 * 4;
         loupeCanvas.style.borderColor = `rgb(${colormap[hi]}, ${colormap[hi + 1]}, ${colormap[hi + 2]})`;
       }
       const lp = loupe.current;
       if (loupeCanvas && lp.active && vs.zoom < 25) {
        const side = Math.floor(Math.min(canvasSize.width, canvasSize.height) / 2);
        if (loupeCanvas.width !== side || loupeCanvas.height !== side) {
          loupeCanvas.width = side;
          loupeCanvas.height = side;
        }

        // Position centered on cursor, clamped to stay on-screen
        const left = Math.max(0, Math.min(canvasSize.width - side, lp.canvasX - side / 2));
        const top = Math.max(0, Math.min(canvasSize.height - side, lp.canvasY - side / 2));
        loupeCanvas.style.left = `${left}px`;
        loupeCanvas.style.top = `${top}px`;
        loupeCanvas.style.display = 'block';

        const loupeCtx = loupeCanvas.getContext('2d');
        if (loupeCtx) {
          const loupeZoom = Math.min(vs.zoom * 10, 25);
          const loupeVS: ViewerState = {
            ...vs,
            pan: { x: lp.imgX, y: lp.imgY },
            zoom: loupeZoom,
          };
          if (!loupePixelBuffer.current || loupePixelBuffer.current.width !== side || loupePixelBuffer.current.height !== side) {
            loupePixelBuffer.current = loupeCtx.createImageData(side, side);
          }
          renderRegion(loupeCtx, side, side, imageData, loupeVS, imageData as unknown as ImageMetadata, lut, colormap, loupePixelBuffer.current);
        }
      } else if (loupeCanvas) {
        loupeCanvas.style.display = 'none';
      }
    });
  }, [canvasSize, imageData]);

  // Re-render when props change (exposure, colormap, canvas resize, etc.)
  useEffect(() => {
    scheduleRender();
  }, [viewerState, scheduleRender]);

  // Auto-fit: compute zoom to fit image on first canvas size
  useEffect(() => {
    if (hasAutoFit.current || canvasSize.width === 0 || canvasSize.height === 0) return;
    hasAutoFit.current = true;
    const fitZoom = Math.min(canvasSize.width / imageData.width, canvasSize.height / imageData.height);
    const newState: ViewerState = {
      ...liveState.current,
      pan: { x: imageData.width / 2, y: imageData.height / 2 },
      zoom: fitZoom,
    };
    liveState.current = newState;
    emitState(newState);
    scheduleRender();
  }, [canvasSize, imageData, scheduleRender]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        const w = Math.floor(width);
        const h = Math.floor(height);
        if (w > 0 && h > 0) {
          setCanvasSize(prev =>
            prev.width === w && prev.height === h ? prev : { width: w, height: h }
          );
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Wheel zoom — updates ref directly, renders via RAF, notifies React
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const vs = liveState.current;

      const imgX = (cx - canvasSize.width / 2) / vs.zoom + vs.pan.x;
      const imgY = (cy - canvasSize.height / 2) / vs.zoom + vs.pan.y;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rawZoom = vs.zoom * zoomFactor;

      // Soft stop at 25x: snap to exactly 25 and require extra scroll to pass through
      const crossingStop = (vs.zoom < SOFT_STOP && rawZoom > SOFT_STOP)
                        || (vs.zoom > SOFT_STOP && rawZoom < SOFT_STOP);
      const atStop = vs.zoom === SOFT_STOP;

      let newZoom: number;
      // Only soft-stop when zooming in; zooming out always passes freely
      if ((crossingStop || atStop) && e.deltaY < 0) {
        softStopAccum.current += e.deltaY;
        // Reset accumulator after a pause so a later zoom-in isn't blocked
        clearTimeout(softStopTimeout.current);
        softStopTimeout.current = window.setTimeout(() => { softStopAccum.current = -SOFT_STOP_THRESHOLD; }, 200);
        if (Math.abs(softStopAccum.current) < SOFT_STOP_THRESHOLD) {
          newZoom = SOFT_STOP;
        } else {
          softStopAccum.current = 0;
          clearTimeout(softStopTimeout.current);
          newZoom = Math.max(minZoom, Math.min(100, rawZoom));
        }
      } else {
        softStopAccum.current = 0;
        clearTimeout(softStopTimeout.current);
        newZoom = Math.max(minZoom, Math.min(100, rawZoom));
      }

      const newState: ViewerState = {
        ...vs,
        zoom: newZoom,
        pan: {
          x: imgX - (cx - canvasSize.width / 2) / newZoom,
          y: imgY - (cy - canvasSize.height / 2) / newZoom,
        },
      };
      liveState.current = newState;
      scheduleRender();
      emitState(newState);
    },
    [canvasSize, minZoom, scheduleRender],
  );

  // Drag to pan / middle-click loupe
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    } else if (e.button === 1) {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const vs = liveState.current;
      const imgX = (cx - canvasSize.width / 2) / vs.zoom + vs.pan.x;
      const imgY = (cy - canvasSize.height / 2) / vs.zoom + vs.pan.y;
      zoomOrigin.current = { canvasX: cx, canvasY: cy, imgX, imgY };
      isZooming.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const vs = liveState.current;
      const imgX = (cx - canvasSize.width / 2) / vs.zoom + vs.pan.x;
      const imgY = (cy - canvasSize.height / 2) / vs.zoom + vs.pan.y;

      const now = performance.now();
      const isDoubleClick = now - lastRightClick.current < 300;
      lastRightClick.current = now;

      if (isDoubleClick) {
        const newState: ViewerState = {
          ...vs,
          zoom: SOFT_STOP,
          pan: { x: imgX, y: imgY },
        };
        liveState.current = newState;
        scheduleRender();
        emitState(newState);
      } else {
        loupe.current = { active: true, imgX, imgY, canvasX: cx, canvasY: cy };
        scheduleRender();
      }
    }
  }, [canvasSize, scheduleRender, emitState]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Update cursor info
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const vs = liveState.current;
        const imgX = (cx - canvasSize.width / 2) / vs.zoom + vs.pan.x;
        const imgY = (cy - canvasSize.height / 2) / vs.zoom + vs.pan.y;
        const ix = Math.floor(imgX);
        const iy = Math.floor(imgY);
        if (ix >= 0 && ix < imageData.width && iy >= 0 && iy < imageData.height) {
          const value = imageData.data[iy * imageData.width + ix];
          const res = pixelResolution(ix, iy, imageData as unknown as ImageMetadata);
          onCursorRef.current({ fast: ix, slow: iy, value, resolution_angstrom: res ?? undefined });
        } else {
          onCursorRef.current(null);
        }

        // Update loupe position while active
        if (loupe.current.active) {
          loupe.current = { active: true, imgX, imgY, canvasX: cx, canvasY: cy };
          scheduleRender();
        }
      }

      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };

      if (isZooming.current) {
        const vs = liveState.current;
        const zoomFactor = Math.exp(dx * 0.01);
        const rawZoom = vs.zoom * zoomFactor;
        const newZoom = Math.max(minZoom, Math.min(100, rawZoom));
        const newPan = {
          x: zoomOrigin.current.imgX - (zoomOrigin.current.canvasX - canvasSize.width / 2) / newZoom,
          y: zoomOrigin.current.imgY - (zoomOrigin.current.canvasY - canvasSize.height / 2) / newZoom,
        };
        const newState: ViewerState = {
          ...vs,
          zoom: newZoom,
          pan: newPan,
        };
        liveState.current = newState;
        scheduleRender();
        emitState(newState);
        return;
      }

      if (!isDragging.current) return;

      const newState: ViewerState = {
        ...liveState.current,
        pan: {
          x: liveState.current.pan.x - dx / liveState.current.zoom,
          y: liveState.current.pan.y - dy / liveState.current.zoom,
        },
      };
      liveState.current = newState;
      scheduleRender();
      emitState(newState);
    },
    [canvasSize, imageData, minZoom, scheduleRender, emitState],
  );

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      isDragging.current = false;
    } else if (e.button === 1) {
      isZooming.current = false;
    } else if (e.button === 2) {
      loupe.current.active = false;
      scheduleRender();
    }
  }, [scheduleRender]);

  const handleDoubleClick = useCallback(() => {
    const fitZoom = Math.min(canvasSize.width / imageData.width, canvasSize.height / imageData.height);
    const newState: ViewerState = {
      ...liveState.current,
      pan: { x: imageData.width / 2, y: imageData.height / 2 },
      zoom: fitZoom,
    };
    liveState.current = newState;
    scheduleRender();
    emitState(newState);
  }, [canvasSize, imageData, scheduleRender]);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
    loupe.current.active = false;
    scheduleRender();
    onCursorRef.current(null);
  }, [scheduleRender]);

  // Prevent browser wheel menu on middle-click drag and handle global mouseup/move
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        isZooming.current = false;
      }
    };
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isZooming.current) {
        e.preventDefault();
        const dx = e.clientX - lastMouse.current.x;
        const vs = liveState.current;
        const zoomFactor = Math.exp(dx * 0.01);
        const rawZoom = vs.zoom * zoomFactor;
        const newZoom = Math.max(minZoom, Math.min(100, rawZoom));
        const newPan = {
          x: zoomOrigin.current.imgX - (zoomOrigin.current.canvasX - canvasSize.width / 2) / newZoom,
          y: zoomOrigin.current.imgY - (zoomOrigin.current.canvasY - canvasSize.height / 2) / newZoom,
        };
        const newState: ViewerState = {
          ...vs,
          zoom: newZoom,
          pan: newPan,
        };
        liveState.current = newState;
        scheduleRender();
        emitState(newState);
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
    };
    const handleWheel = (e: WheelEvent) => {
      if (isZooming.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: false });
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [minZoom, scheduleRender, emitState]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="image-canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="image-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      />
      <canvas ref={loupeCanvasRef} className="image-canvas-loupe" />
    </div>
  );
}
