import { useEffect, useRef, useCallback } from 'react';
import type { DiffrantProps, SeriesState } from './types';
import { useImageLoader } from './hooks/useImageLoader';
import { useSeriesLoader } from './hooks/useSeriesLoader';
import { DiffrantViewer } from './DiffrantViewer';
import { SeriesNavigator } from './components/SeriesNavigator';
import './Diffrant.css';

const NOOP_URL_FACTORY = () => '';
const DEFAULT_SERIES: SeriesState = {
  currentIndex: 0,
  stackCount: 1,
  stackMode: 'sum',
  playing: false,
  playFps: 5,
};

export function Diffrant({
  metadataUrl,
  imageUrl,
  imageUrlFactory,
  viewerState,
  onViewerStateChange,
  seriesState,
  onSeriesStateChange,
  autoExposureTrigger = 0,
}: DiffrantProps) {
  const isSeries = imageUrlFactory != null && seriesState != null && onSeriesStateChange != null;
  const activeSeries = seriesState ?? DEFAULT_SERIES;

  // Both hooks always called (rules of hooks)
  const singleLoader = useImageLoader(metadataUrl, imageUrl ?? '');
  const seriesLoader = useSeriesLoader(
    isSeries ? metadataUrl : '',
    isSeries ? imageUrlFactory : NOOP_URL_FACTORY,
    activeSeries,
  );

  const { metadata, imageData, loading, error } = isSeries ? seriesLoader : singleLoader;

  // --- Auto-exposure ---
  const processedTrigger = useRef(-1);
  const viewerStateRef = useRef(viewerState);
  viewerStateRef.current = viewerState;
  const onViewerStateChangeRef = useRef(onViewerStateChange);
  onViewerStateChangeRef.current = onViewerStateChange;

  useEffect(() => {
    if (!imageData || !metadata) return;
    if (autoExposureTrigger <= processedTrigger.current) return;
    processedTrigger.current = autoExposureTrigger;

    const trustedMax = metadata.trusted_range_max;
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

    const exposureMax = Math.max(p90, 2);
    onViewerStateChangeRef.current({ ...viewerStateRef.current, exposureMax });
  }, [imageData, metadata, autoExposureTrigger]);

  // --- Play timer ---
  const seriesStateRef = useRef(activeSeries);
  seriesStateRef.current = activeSeries;
  const onSeriesStateChangeRef = useRef(onSeriesStateChange);
  onSeriesStateChangeRef.current = onSeriesStateChange;

  // Stable callback for advancing frames — avoids recreating the interval
  const advanceFrame = useCallback(() => {
    const s = seriesStateRef.current;
    const cb = onSeriesStateChangeRef.current;
    if (!cb) return;
    const next = s.currentIndex + s.stackCount;
    if (s.totalFrames !== undefined && next + s.stackCount > s.totalFrames) {
      // Reached the end — stop playing
      cb({ ...s, playing: false });
    } else {
      cb({ ...s, currentIndex: next });
    }
  }, []);

  useEffect(() => {
    if (!isSeries || !activeSeries.playing) return;
    const interval = setInterval(advanceFrame, 1000 / activeSeries.playFps);
    return () => clearInterval(interval);
  }, [isSeries, activeSeries.playing, activeSeries.playFps, advanceFrame]);

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

  if (isSeries) {
    return (
      <div className="diffrant-series-wrapper">
        <SeriesNavigator
          seriesState={seriesState}
          onSeriesStateChange={onSeriesStateChange}
        />
        <div className="diffrant-series-content">
          <DiffrantViewer
            imageData={imageData}
            metadata={metadata}
            viewerState={viewerState}
            onViewerStateChange={onViewerStateChange}
          />
        </div>
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
