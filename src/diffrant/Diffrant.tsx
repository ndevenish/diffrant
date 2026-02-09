import type { DiffrantProps } from './types';
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
        />
      </div>
      <div className="diffrant-right">
        <ControlPanel
          imageData={imageData}
          metadata={metadata}
          viewerState={viewerState}
          onViewerStateChange={onViewerStateChange}
        />
      </div>
    </div>
  );
}
