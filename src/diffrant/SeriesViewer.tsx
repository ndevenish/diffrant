import { useEffect, useRef, useCallback } from 'react';
import type { SeriesViewerProps } from './types';
import { useSeriesLoader } from './hooks/useSeriesLoader';
import { DiffrantViewer } from './DiffrantViewer';
import './SeriesViewer.css';

export function SeriesViewer({
  seriesInfo,
  getFrameUrls,
  currentFrame,
  onFrameChange,
  viewerState,
  onViewerStateChange,
  autoExposureTrigger = 0,
}: SeriesViewerProps) {
  const { imageData, loading, error } = useSeriesLoader(getFrameUrls, currentFrame, seriesInfo.frameCount);

  const processedTrigger = useRef(-1);
  const viewerStateRef = useRef(viewerState);
  viewerStateRef.current = viewerState;
  const onViewerStateChangeRef = useRef(onViewerStateChange);
  onViewerStateChangeRef.current = onViewerStateChange;

  useEffect(() => {
    if (!imageData) return;
    if (autoExposureTrigger <= processedTrigger.current) return;
    processedTrigger.current = autoExposureTrigger;

    const trustedMax = imageData.trusted_range_max;
    const data = imageData.data;
    const len = data.length;

    const histSize = imageData.depth <= 16 ? (1 << imageData.depth) : 65536;
    const hist = new Uint32Array(histSize);
    let count = 0;
    for (let i = 0; i < len; i++) {
      const v = data[i];
      if (v <= trustedMax) {
        hist[Math.min(v, histSize - 1)] += 1;
        count++;
      }
    }

    if (count === 0) return;

    const target = Math.floor(count * 0.9);
    let cumulative = 0;
    let p90 = 0;
    for (let i = 0; i < histSize; i++) {
      cumulative += hist[i];
      if (cumulative >= target) {
        p90 = i;
        break;
      }
    }

    onViewerStateChangeRef.current({ ...viewerStateRef.current, exposureMax: Math.max(p90, 2) });
  }, [imageData, autoExposureTrigger]);

  const handleFrameInput = useCallback((value: string) => {
    const n = parseInt(value, 10);
    if (isNaN(n)) return;
    onFrameChange(Math.max(1, Math.min(seriesInfo.frameCount, n)));
  }, [seriesInfo.frameCount, onFrameChange]);

  return (
    <div className="series-viewer-container">
      <div className="series-navigator">
        <span className="series-name">{seriesInfo.name}</span>
        <div className="series-separator" />
        <div className="series-group">
          <span className="series-label">Frame</span>
          <input
            className="series-input series-input-frame"
            type="number"
            min={1}
            max={seriesInfo.frameCount}
            value={currentFrame}
            onChange={(e) => handleFrameInput(e.target.value)}
          />
          <span>/ {seriesInfo.frameCount}</span>
        </div>
        <div className="series-nav-buttons">
          <button className="series-btn" onClick={() => onFrameChange(1)} disabled={currentFrame === 1} title="First frame">
            |&#x25C0;
          </button>
          <button className="series-btn" onClick={() => onFrameChange(currentFrame - 1)} disabled={currentFrame === 1} title="Previous frame">
            &#x25C0;
          </button>
          <button className="series-btn" onClick={() => onFrameChange(currentFrame + 1)} disabled={currentFrame === seriesInfo.frameCount} title="Next frame">
            &#x25B6;
          </button>
          <button className="series-btn" onClick={() => onFrameChange(seriesInfo.frameCount)} disabled={currentFrame === seriesInfo.frameCount} title="Last frame">
            &#x25B6;|
          </button>
        </div>
      </div>
      <div className="series-viewer-content">
        {loading && (
          <div className="series-loading">Loading frame {currentFrame}…</div>
        )}
        {error && (
          <div className="series-error">Error: {error}</div>
        )}
        {!loading && !error && imageData && (
          <DiffrantViewer
            imageData={imageData}
            viewerState={viewerState}
            onViewerStateChange={onViewerStateChange}
          />
        )}
        {!loading && !error && !imageData && (
          <div className="series-loading">No data</div>
        )}
      </div>
    </div>
  );
}
