import { useState, useCallback } from 'react';
import { Diffrant } from './diffrant';
import type { ViewerState } from './diffrant';
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

function App() {
  const [viewerState, setViewerState] = useState<ViewerState>(DEFAULT_STATE);

  const handleStateChange = useCallback((state: ViewerState) => {
    setViewerState(state);
  }, []);

  return (
    <div className="app">
      <Diffrant
        metadataUrl="/data/se_thau_10_1_00001.json"
        imageUrl="/data/se_thau_10_1_00001.png"
        imageNumber={1}
        viewerState={viewerState}
        onViewerStateChange={handleStateChange}
      />
    </div>
  );
}

export default App;
