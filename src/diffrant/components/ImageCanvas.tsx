import { useRef, useEffect, useCallback, useState } from 'react';
import type { RawImageData, ViewerState, ImageMetadata, CursorInfo } from '../types';
import { buildLUT, renderRegion, getColormapTable } from '../rendering/pipeline';
import './ImageCanvas.css';

interface ImageCanvasProps {
  imageData: RawImageData;
  metadata: ImageMetadata;
  viewerState: ViewerState;
  onViewerStateChange: (state: ViewerState) => void;
  onCursorChange: (info: CursorInfo | null) => void;
}

export function ImageCanvas({
  imageData,
  metadata,
  viewerState,
  onViewerStateChange,
  onCursorChange,
}: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const hasAutoFit = useRef(false);

  // Live viewer state — updated from props AND directly from mouse handlers.
  // Canvas renders from this ref, avoiding a full React round-trip per frame.
  const liveState = useRef(viewerState);
  const rafId = useRef(0);

  // Keep callback refs stable so mouse handlers don't need re-creation
  const onChangeRef = useRef(onViewerStateChange);
  onChangeRef.current = onViewerStateChange;
  const onCursorRef = useRef(onCursorChange);
  onCursorRef.current = onCursorChange;

  // Sync from props (exposure/colormap changes from ControlPanel, etc.)
  useEffect(() => {
    liveState.current = viewerState;
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
      renderRegion(ctx, canvasSize.width, canvasSize.height, imageData, vs, metadata, lut, colormap);
    });
  }, [canvasSize, imageData, metadata]);

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
    onChangeRef.current(newState);
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
          setCanvasSize({ width: w, height: h });
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
      const newZoom = Math.max(minZoom, Math.min(100, vs.zoom * zoomFactor));

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
      onChangeRef.current(newState);
    },
    [canvasSize, minZoom, scheduleRender],
  );

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

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
          onCursorRef.current({ fast: ix, slow: iy, value });
        } else {
          onCursorRef.current(null);
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
      onChangeRef.current(newState);
    },
    [canvasSize, imageData, scheduleRender],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
    onCursorRef.current(null);
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
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}
