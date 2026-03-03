import { useRef, useEffect, useCallback, useState } from 'react';
import type { ImageData, ViewerState, ImageMetadata, CursorInfo } from '../types';
import { buildLUT, renderRegion, getColormapTable, pixelResolution } from '../rendering/pipeline';
import './ImageCanvas.css';

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
  const softStopAccum = useRef(0);

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

      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const vs = liveState.current;
      const lut = buildLUT(imageData.depth, vs.exposureMin, vs.exposureMax);
      const colormap = getColormapTable(vs.colormap);
       renderRegion(ctx, canvasSize.width, canvasSize.height, imageData, vs, imageData as unknown as ImageMetadata, lut, colormap);

       // Loupe overlay
       const loupeCanvas = loupeCanvasRef.current;
       const lp = loupe.current;
       if (loupeCanvas && lp.active && vs.zoom <= 25) {
        const side = Math.floor(Math.min(canvasSize.width, canvasSize.height) / 2);
        loupeCanvas.width = side;
        loupeCanvas.height = side;

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
          renderRegion(loupeCtx, side, side, imageData, loupeVS, imageData as unknown as ImageMetadata, lut, colormap);
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
      const SOFT_STOP = 25;
      const SOFT_STOP_THRESHOLD = 300;
      const crossingStop = (vs.zoom < SOFT_STOP && rawZoom > SOFT_STOP)
                        || (vs.zoom > SOFT_STOP && rawZoom < SOFT_STOP);
      const atStop = vs.zoom === SOFT_STOP;

      let newZoom: number;
      if (crossingStop || atStop) {
        const dirReversed = softStopAccum.current !== 0 && Math.sign(e.deltaY) !== Math.sign(softStopAccum.current);
        if (dirReversed) {
          // Instant escape in the opposite direction
          softStopAccum.current = 0;
          newZoom = Math.max(minZoom, Math.min(100, rawZoom));
        } else {
          softStopAccum.current += e.deltaY;
          if (Math.abs(softStopAccum.current) < SOFT_STOP_THRESHOLD) {
            newZoom = SOFT_STOP;
          } else {
            softStopAccum.current = 0;
            newZoom = Math.max(minZoom, Math.min(100, rawZoom));
          }
        }
      } else {
        softStopAccum.current = 0;
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
    } else if (e.button === 2) {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const vs = liveState.current;
      const imgX = (cx - canvasSize.width / 2) / vs.zoom + vs.pan.x;
      const imgY = (cy - canvasSize.height / 2) / vs.zoom + vs.pan.y;
      loupe.current = { active: true, imgX, imgY, canvasX: cx, canvasY: cy };
      scheduleRender();
    }
  }, [canvasSize, scheduleRender]);

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

      if (!isDragging.current) return;

      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };

      const vs = liveState.current;
      const newState: ViewerState = {
        ...vs,
        pan: {
          x: vs.pan.x - dx / vs.zoom,
          y: vs.pan.y - dy / vs.zoom,
        },
      };
      liveState.current = newState;
      scheduleRender();
      emitState(newState);
    },
    [canvasSize, imageData, scheduleRender],
  );

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      isDragging.current = false;
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
