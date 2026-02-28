import type { DiffrantProps } from './types';
import { useImageLoader } from './hooks/useImageLoader';
import { DiffrantViewer } from './DiffrantViewer';
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
    <DiffrantViewer
      imageData={imageData}
      metadata={metadata}
      viewerState={viewerState}
      onViewerStateChange={onViewerStateChange}
    />
  );
}
