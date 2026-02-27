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
      <div className="control-panel-checkboxes">
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
      <label
        className="control-panel-checkbox"
        title={metadata.beam_energy_kev === undefined ? 'No beam energy in metadata' : undefined}
        style={metadata.beam_energy_kev === undefined ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
      >
        <input
          type="checkbox"
          checked={viewerState.showResolutionRings}
          disabled={metadata.beam_energy_kev === undefined}
          onChange={(e) =>
            onViewerStateChange({ ...viewerState, showResolutionRings: e.target.checked })
          }
          style={metadata.beam_energy_kev === undefined ? { cursor: 'not-allowed' } : undefined}
        />
        Show resolution rings
      </label>
      </div>
      <div className="control-panel-section">
        <div className="control-panel-label">Pixel</div>
        {cursorInfo ? (
          <div className="cursor-info-panel">
            <span>fast: {cursorInfo.fast}</span>
            <span>slow: {cursorInfo.slow}</span>
            <span>value: {cursorInfo.value}</span>
            {cursorInfo.resolution_angstrom !== undefined && (
              <span>d: {cursorInfo.resolution_angstrom.toFixed(2)} Å</span>
            )}
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
        <div style={{ fontSize: 12, color: '#ccc' }}>
          Distance: {metadata.panel_distance_mm.toFixed(1)} mm
        </div>
        {metadata.beam_energy_kev !== undefined && (
          <div style={{ fontSize: 12, color: '#ccc' }}>
            Energy: {metadata.beam_energy_kev.toFixed(3)} keV
          </div>
        )}
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
    && prev.viewerState.showResolutionRings === next.viewerState.showResolutionRings
    && (prev.viewerState.zoom < 1) === (next.viewerState.zoom < 1)
    && prev.cursorInfo?.fast === next.cursorInfo?.fast
    && prev.cursorInfo?.slow === next.cursorInfo?.slow
    && prev.cursorInfo?.value === next.cursorInfo?.value
    && prev.cursorInfo?.resolution_angstrom === next.cursorInfo?.resolution_angstrom;
});
