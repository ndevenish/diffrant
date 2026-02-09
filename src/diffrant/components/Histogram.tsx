import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { RawImageData, ImageMetadata, ViewerState } from '../types';
import { computeHistogram } from '../rendering/pipeline';
import './Histogram.css';

interface HistogramProps {
  imageData: RawImageData;
  metadata: ImageMetadata;
  viewerState: ViewerState;
  onViewerStateChange: (state: ViewerState) => void;
}

const HIST_WIDTH = 280;
const HIST_HEIGHT = 120;
const HANDLE_WIDTH = 8;

export function Histogram({
  imageData,
  metadata,
  viewerState,
  onViewerStateChange,
}: HistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);

  const histogram = useMemo(
    () => computeHistogram(imageData, metadata),
    [imageData, metadata],
  );

  const { maxRaw } = histogram;
  const displayMax = Math.max(maxRaw, 1);

  // Convert between pixel position and raw value
  const rawToX = useCallback(
    (val: number) => (val / displayMax) * HIST_WIDTH,
    [displayMax],
  );
  const xToRaw = useCallback(
    (x: number) => Math.max(0, Math.min(displayMax, (x / HIST_WIDTH) * displayMax)),
    [displayMax],
  );

  // Draw histogram
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { counts, binEdges } = histogram;

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, HIST_WIDTH, HIST_HEIGHT);

    // Find max count for scaling (log scale)
    let maxCount = 0;
    for (let i = 0; i < counts.length; i++) {
      const logVal = counts[i] > 0 ? Math.log10(counts[i]) : 0;
      if (logVal > maxCount) maxCount = logVal;
    }
    if (maxCount === 0) maxCount = 1;

    // Draw shaded exposure region
    const minX = rawToX(viewerState.exposureMin);
    const maxX = rawToX(viewerState.exposureMax);
    ctx.fillStyle = 'rgba(100, 140, 200, 0.15)';
    ctx.fillRect(minX, 0, maxX - minX, HIST_HEIGHT);

    // Draw bars
    ctx.fillStyle = '#888';
    const barWidth = HIST_WIDTH / counts.length;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] === 0) continue;
      const logVal = Math.log10(counts[i]);
      const barHeight = (logVal / maxCount) * (HIST_HEIGHT - 4);
      const binCenter = (binEdges[i] + binEdges[i + 1]) / 2;
      const x = rawToX(binCenter) - barWidth / 2;
      ctx.fillRect(x, HIST_HEIGHT - barHeight, barWidth, barHeight);
    }

    // Draw handles
    ctx.fillStyle = '#4a90d9';
    ctx.fillRect(minX - HANDLE_WIDTH / 2, 0, HANDLE_WIDTH, HIST_HEIGHT);
    ctx.fillStyle = '#d94a4a';
    ctx.fillRect(maxX - HANDLE_WIDTH / 2, 0, HANDLE_WIDTH, HIST_HEIGHT);

    // Labels
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.round(viewerState.exposureMin)), minX + HANDLE_WIDTH / 2 + 2, 12);
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(viewerState.exposureMax)), maxX - HANDLE_WIDTH / 2 - 2, 12);
  }, [histogram, viewerState.exposureMin, viewerState.exposureMax, rawToX]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const minX = rawToX(viewerState.exposureMin);
      const maxX = rawToX(viewerState.exposureMax);

      if (Math.abs(x - minX) < HANDLE_WIDTH * 1.5) {
        setDragging('min');
      } else if (Math.abs(x - maxX) < HANDLE_WIDTH * 1.5) {
        setDragging('max');
      }
    },
    [viewerState.exposureMin, viewerState.exposureMax, rawToX],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const rawVal = Math.round(xToRaw(x));

      if (dragging === 'min') {
        const newMin = Math.min(rawVal, viewerState.exposureMax - 1);
        onViewerStateChange({ ...viewerState, exposureMin: Math.max(0, newMin) });
      } else {
        const newMax = Math.max(rawVal, viewerState.exposureMin + 1);
        onViewerStateChange({ ...viewerState, exposureMax: newMax });
      }
    },
    [dragging, viewerState, onViewerStateChange, xToRaw],
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <div className="histogram-container">
      <div className="histogram-label">Exposure</div>
      <canvas
        ref={canvasRef}
        width={HIST_WIDTH}
        height={HIST_HEIGHT}
        className="histogram-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}
