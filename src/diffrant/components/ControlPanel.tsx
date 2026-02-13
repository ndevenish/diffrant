import { memo } from 'react';
import type { RawImageData, ImageMetadata, ViewerState, ColormapName, CursorInfo } from '../types';
import { Histogram } from './Histogram';
import { ColormapSelector } from './ColormapSelector';
import { DownsampleSelector } from './DownsampleSelector';
import './ControlPanel.css';

interface ControlPanelProps {
  imageData: RawImageData;
  metadata: ImageMetadata;
  viewerState: ViewerState;
  onViewerStateChange: (state: ViewerState) => void;
  cursorInfo: CursorInfo | null;
}

export const ControlPanel = memo(function ControlPanel({
  imageData,
  metadata,
  viewerState,
  onViewerStateChange,
  cursorInfo,
}: ControlPanelProps) {
  return (
    <div className="control-panel">
      <Histogram
        imageData={imageData}
        metadata={metadata}
        viewerState={viewerState}
        onViewerStateChange={onViewerStateChange}
      />
      <ColormapSelector
        value={viewerState.colormap}
        onChange={(colormap: ColormapName) =>
          onViewerStateChange({ ...viewerState, colormap })
        }
      />
      <DownsampleSelector
        value={viewerState.downsampleMode}
        onChange={(downsampleMode) =>
          onViewerStateChange({ ...viewerState, downsampleMode })
        }
        visible={viewerState.zoom < 1}
      />
      <label className="control-panel-checkbox">
        <input
          type="checkbox"
          checked={viewerState.showMask}
          onChange={(e) =>
            onViewerStateChange({ ...viewerState, showMask: e.target.checked })
          }
        />
        Show mask
      </label>
      <div className="control-panel-section">
        <div className="control-panel-label">Pixel</div>
        {cursorInfo ? (
          <div className="cursor-info-panel">
            <span>fast: {cursorInfo.fast}</span>
            <span>slow: {cursorInfo.slow}</span>
            <span>value: {cursorInfo.value}</span>
          </div>
        ) : (
          <div className="cursor-info-empty">—</div>
        )}
      </div>
      <div className="control-panel-section">
        <div className="control-panel-label">Image</div>
        <div style={{ fontSize: 12, color: '#ccc' }}>
          {imageData.width} x {imageData.height} ({imageData.depth}-bit)
        </div>
        <div style={{ fontSize: 12, color: '#ccc' }}>
          Zoom: {(viewerState.zoom * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // Skip re-render when only pan/zoom changed (the hot path during interaction)
  return prev.imageData === next.imageData
    && prev.metadata === next.metadata
    && prev.viewerState.exposureMin === next.viewerState.exposureMin
    && prev.viewerState.exposureMax === next.viewerState.exposureMax
    && prev.viewerState.colormap === next.viewerState.colormap
    && prev.viewerState.downsampleMode === next.viewerState.downsampleMode
    && prev.viewerState.showMask === next.viewerState.showMask
    && (prev.viewerState.zoom < 1) === (next.viewerState.zoom < 1)
    && prev.cursorInfo?.fast === next.cursorInfo?.fast
    && prev.cursorInfo?.slow === next.cursorInfo?.slow
    && prev.cursorInfo?.value === next.cursorInfo?.value;
});
