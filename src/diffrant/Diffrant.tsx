import { useEffect, useRef } from 'react';
import type { DiffrantProps } from './types';
import { useImageLoader } from './hooks/useImageLoader';
import { DiffrantViewer } from './DiffrantViewer';
import './Diffrant.css';

export function Diffrant({
  metadataUrl,
  imageUrl,
  viewerState,
  onViewerStateChange,
  autoExposureTrigger = 0,
}: DiffrantProps) {
  const { metadata, imageData, loading, error } = useImageLoader(metadataUrl, imageUrl);
  const processedTrigger = useRef(-1);
  // Ref so the effect reads the latest viewerState without re-running on every change.
  const viewerStateRef = useRef(viewerState);
  viewerStateRef.current = viewerState;
  const onViewerStateChangeRef = useRef(onViewerStateChange);
  onViewerStateChangeRef.current = onViewerStateChange;

  // Auto-set exposureMax to 90th percentile when triggered.
  // Runs when autoExposureTrigger increments; if imageData isn't ready yet,
  // waits until it arrives (the effect re-runs when imageData changes too).
  useEffect(() => {
    if (!imageData || !metadata) return;
    if (autoExposureTrigger <= processedTrigger.current) return;
    processedTrigger.current = autoExposureTrigger;

    const trustedMax = metadata.trusted_range_max;
    const data = imageData.data;
    const len = data.length;

    // Histogram-based percentile (works for integer data up to 65535)
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

    const exposureMax = Math.max(p90, 2);
    onViewerStateChangeRef.current({ ...viewerStateRef.current, exposureMax });
  }, [imageData, metadata, autoExposureTrigger]);


  if (loading) {
    return (
      <div className="diffrant-container">
        <div className="diffrant-loading">Loading image...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="diffrant-container">
        <div className="diffrant-error">Error: {error}</div>
      </div>
    );
  }

  if (!metadata || !imageData) {
    return (
      <div className="diffrant-container">
        <div className="diffrant-loading">No data</div>
      </div>
    );
  }

  return (
    <DiffrantViewer
      imageData={imageData}
      metadata={metadata}
      viewerState={viewerState}
      onViewerStateChange={onViewerStateChange}
    />
  );
}
