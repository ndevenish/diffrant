import { useState, useCallback } from 'react';
import { Diffrant } from './diffrant';
import type { ViewerState, SeriesState } from './diffrant';
import './App.css';

const DEFAULT_STATE: ViewerState = {
  pan: { x: 2074, y: 2181 }, // center of 4148x4362
  zoom: 0.2,
  exposureMin: 0,
  exposureMax: 256,
  colormap: 'inverse',
  downsampleMode: 'max',
  showMask: false,
  showResolutionRings: false,
};

const DEFAULT_SERIES: SeriesState = {
  currentIndex: 0,
  stackCount: 1,
  stackMode: 'sum',
  playing: false,
  playFps: 5,
  totalFrames: 3,
};

const imageUrlFactory = (i: number) =>
  `/data/series/frame_${String(i + 1).padStart(3, '0')}.png`;

function App() {
  const [viewerState, setViewerState] = useState<ViewerState>(DEFAULT_STATE);
  const [seriesState, setSeriesState] = useState<SeriesState>(DEFAULT_SERIES);

  const handleStateChange = useCallback((state: ViewerState) => {
    setViewerState(state);
  }, []);

  const handleSeriesChange = useCallback((state: SeriesState) => {
    setSeriesState(state);
  }, []);

  return (
    <div className="app">
      <Diffrant
        metadataUrl="/data/series/metadata.json"
        imageUrlFactory={imageUrlFactory}
        viewerState={viewerState}
        onViewerStateChange={handleStateChange}
        seriesState={seriesState}
        onSeriesStateChange={handleSeriesChange}
      />
    </div>
  );
}

export default App;
