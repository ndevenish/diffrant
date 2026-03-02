import { useState, useCallback } from 'react';
import type { DiffrantViewerProps, CursorInfo } from './types';
import { ImageCanvas } from './components/ImageCanvas';
import { ControlPanel } from './components/ControlPanel';
import './Diffrant.css';

export function DiffrantViewer({
  imageData,
  metadata,
  viewerState,
  onViewerStateChange,
}: DiffrantViewerProps) {
  const [cursorInfo, setCursorInfo] = useState<CursorInfo | null>(null);

  const handleCursorChange = useCallback((info: CursorInfo | null) => {
    setCursorInfo(info);
  }, []);

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
