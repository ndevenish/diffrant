import { useRef, useEffect, useCallback, useState } from 'react';
import type { RawImageData, ViewerState, ImageMetadata } from '../types';
import { buildLUT, renderRegion, getColormapTable } from '../rendering/pipeline';
import './ImageCanvas.css';

interface ImageCanvasProps {
  imageData: RawImageData;
  metadata: ImageMetadata;
  viewerState: ViewerState;
  onViewerStateChange: (state: ViewerState) => void;
}

export function ImageCanvas({
  imageData,
  metadata,
  viewerState,
  onViewerStateChange,
}: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const hasAutoFit = useRef(false);
  const [cursorInfo, setCursorInfo] = useState<{ imgX: number; imgY: number; value: number } | null>(null);

  // Auto-fit: compute zoom to fit image on first canvas size
  useEffect(() => {
    if (hasAutoFit.current || canvasSize.width === 0 || canvasSize.height === 0) return;
    hasAutoFit.current = true;
    const zoomX = canvasSize.width / imageData.width;
    const zoomY = canvasSize.height / imageData.height;
    const fitZoom = Math.min(zoomX, zoomY);
    onViewerStateChange({
      ...viewerState,
      pan: { x: imageData.width / 2, y: imageData.height / 2 },
      zoom: fitZoom,
    });
  }, [canvasSize, imageData, viewerState, onViewerStateChange]);

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

  // Render with requestAnimationFrame to avoid stacking during rapid updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width === 0 || canvasSize.height === 0) return;

    const frameId = requestAnimationFrame(() => {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const lut = buildLUT(imageData.depth, viewerState.exposureMin, viewerState.exposureMax);
      const colormap = getColormapTable(viewerState.colormap);

      renderRegion(ctx, canvasSize.width, canvasSize.height, imageData, viewerState, metadata, lut, colormap);
    });

    return () => cancelAnimationFrame(frameId);
  }, [imageData, metadata, viewerState, canvasSize]);

  // Mouse → image coordinate conversion
  const canvasToImage = useCallback(
    (cx: number, cy: number) => {
      const { pan, zoom } = viewerState;
      const imgX = (cx - canvasSize.width / 2) / zoom + pan.x;
      const imgY = (cy - canvasSize.height / 2) / zoom + pan.y;
      return { imgX, imgY };
    },
    [viewerState, canvasSize],
  );

  // Wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { imgX, imgY } = canvasToImage(cx, cy);

      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.max(0.01, Math.min(100, viewerState.zoom * zoomFactor));

      // Adjust pan so the image point under cursor stays under cursor
      const newPanX = imgX - (cx - canvasSize.width / 2) / newZoom;
      const newPanY = imgY - (cy - canvasSize.height / 2) / newZoom;

      onViewerStateChange({
        ...viewerState,
        zoom: newZoom,
        pan: { x: newPanX, y: newPanY },
      });
    },
    [viewerState, onViewerStateChange, canvasToImage, canvasSize],
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
        const { imgX, imgY } = canvasToImage(cx, cy);
        const ix = Math.floor(imgX);
        const iy = Math.floor(imgY);
        if (ix >= 0 && ix < imageData.width && iy >= 0 && iy < imageData.height) {
          const value = imageData.data[iy * imageData.width + ix];
          setCursorInfo({ imgX: ix, imgY: iy, value });
        } else {
          setCursorInfo(null);
        }
      }

      if (!isDragging.current) return;

      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };

      onViewerStateChange({
        ...viewerState,
        pan: {
          x: viewerState.pan.x - dx / viewerState.zoom,
          y: viewerState.pan.y - dy / viewerState.zoom,
        },
      });
    },
    [viewerState, onViewerStateChange, canvasToImage, imageData],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
    setCursorInfo(null);
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
      {cursorInfo && (
        <div className="cursor-info">
          x: {cursorInfo.imgX} y: {cursorInfo.imgY} val: {cursorInfo.value}
        </div>
      )}
    </div>
  );
}
