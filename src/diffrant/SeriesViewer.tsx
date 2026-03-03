import { useState, useEffect, useRef, useCallback } from 'react';
import type { SeriesViewerProps } from './types';
import { useImageLoader } from './hooks/useImageLoader';
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
  const [customFrameInput, setCustomFrameInput] = useState('');
  const [isEditingFrame, setIsEditingFrame] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { metadataUrl, imageUrl } = getFrameUrls(currentFrame);
  const { imageData, loading, error } = useImageLoader(metadataUrl, imageUrl);

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

    const exposureMax = Math.max(p90, 2);
    onViewerStateChangeRef.current({ ...viewerStateRef.current, exposureMax });
  }, [imageData, autoExposureTrigger]);

  useEffect(() => {
    if (isEditingFrame && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingFrame]);

  const handleFirst = useCallback(() => {
    onFrameChange(1);
    setIsEditingFrame(false);
  }, [onFrameChange]);

  const handlePrev = useCallback(() => {
    if (currentFrame > 1) onFrameChange(currentFrame - 1);
  }, [currentFrame, onFrameChange]);

  const handleNext = useCallback(() => {
    if (currentFrame < seriesInfo.frameCount) onFrameChange(currentFrame + 1);
  }, [currentFrame, seriesInfo.frameCount, onFrameChange]);

  const handleLast = useCallback(() => {
    onFrameChange(seriesInfo.frameCount);
    setIsEditingFrame(false);
  }, [seriesInfo.frameCount, onFrameChange]);

  const handleFrameInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomFrameInput(value);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= seriesInfo.frameCount) {
      onFrameChange(num);
    }
  }, [seriesInfo.frameCount, onFrameChange]);

  const handleFrameSubmit = useCallback(() => {
    const num = parseInt(customFrameInput, 10);
    if (!isNaN(num) && num >= 1 && num <= seriesInfo.frameCount) {
      onFrameChange(num);
    } else {
      setCustomFrameInput(String(currentFrame));
    }
    setIsEditingFrame(false);
  }, [customFrameInput, currentFrame, seriesInfo.frameCount, onFrameChange]);

  const handleFrameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleFrameSubmit();
    } else if (e.key === 'Escape') {
      setCustomFrameInput(String(currentFrame));
      setIsEditingFrame(false);
    }
  }, [currentFrame, handleFrameSubmit]);

  return (
    <div className="series-viewer-container">
      <nav className="series-nav-bar">
        <div className="series-nav-left">
          <h2 className="series-name">{seriesInfo.name}</h2>
        </div>
        <div className="series-nav-center">
        <button className="series-nav-btn btn-first" onClick={handleFirst} disabled={currentFrame === 1} title="First frame">
          {'|'}&lt;
        </button>
        <button className="series-nav-btn btn-prev" onClick={handlePrev} disabled={currentFrame === 1} title="Previous frame">
          &lt;
        </button>
        <div className="series-frame-indicator">
            {isEditingFrame ? (
              <input
                ref={inputRef}
                type="number"
                className="series-frame-input"
                value={customFrameInput}
                onChange={handleFrameInputChange}
                onKeyDown={handleFrameKeyDown}
                onBlur={handleFrameSubmit}
                min={1}
                max={seriesInfo.frameCount}
              />
            ) : (
              <span 
                className="series-frame-display"
                onClick={() => {
                  setCustomFrameInput(String(currentFrame));
                  setIsEditingFrame(true);
                }}
                title="Click to edit frame number"
              >
                {currentFrame} of {seriesInfo.frameCount}
              </span>
            )}
          </div>
        <button className="series-nav-btn btn-next" onClick={handleNext} disabled={currentFrame === seriesInfo.frameCount} title="Next frame">
          &gt;
        </button>
        <button 
          className="series-nav-btn btn-last" 
          onClick={handleLast} 
          disabled={currentFrame === seriesInfo.frameCount} 
          title="Last frame"
        >
          &gt;|
        </button>
        </div>
        <div className="series-nav-right" />
      </nav>
      <div className="series-viewer-content">
        {loading && (
          <div className="series-loading">Loading frame {currentFrame}...</div>
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
