import { useState, useCallback } from 'react';
import type { DiffrantProps, CursorInfo } from './types';
import { useImageLoader } from './hooks/useImageLoader';
import { ImageCanvas } from './components/ImageCanvas';
import { ControlPanel } from './components/ControlPanel';
import './Diffrant.css';

export function Diffrant({
  metadataUrl,
  imageUrl,
  viewerState,
  onViewerStateChange,
}: DiffrantProps) {
  const { metadata, imageData, loading, error } = useImageLoader(metadataUrl, imageUrl);
  const [cursorInfo, setCursorInfo] = useState<CursorInfo | null>(null);

  const handleCursorChange = useCallback((info: CursorInfo | null) => {
    setCursorInfo(info);
  }, []);

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
    <div className="diffrant-container">
      <div className="diffrant-left" />
      <div className="diffrant-center">
        <ImageCanvas
          imageData={imageData}
          metadata={metadata}
          viewerState={viewerState}
          onViewerStateChange={onViewerStateChange}
          onCursorChange={handleCursorChange}
        />
      </div>
      <div className="diffrant-right">
        <ControlPanel
          imageData={imageData}
          metadata={metadata}
          viewerState={viewerState}
          onViewerStateChange={onViewerStateChange}
          cursorInfo={cursorInfo}
        />
      </div>
    </div>
  );
}
