import type { RawImageData, ImageMetadata, ViewerState, ColormapName } from '../types';
import { Histogram } from './Histogram';
import { ColormapSelector } from './ColormapSelector';
import { DownsampleSelector } from './DownsampleSelector';
import './ControlPanel.css';

interface ControlPanelProps {
  imageData: RawImageData;
  metadata: ImageMetadata;
  viewerState: ViewerState;
  onViewerStateChange: (state: ViewerState) => void;
}

export function ControlPanel({
  imageData,
  metadata,
  viewerState,
  onViewerStateChange,
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
      <div className="control-panel-info">
        <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Info</div>
        <div style={{ fontSize: 12, color: '#ccc' }}>
          {imageData.width} x {imageData.height} ({imageData.depth}-bit)
        </div>
        <div style={{ fontSize: 12, color: '#ccc' }}>
          Zoom: {(viewerState.zoom * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
