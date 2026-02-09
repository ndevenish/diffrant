export interface ImageMetadata {
  panel_distance: number;
  beam_center: [number, number];
  pixel_size: number;
  panel_size_fast_slow: [number, number]; // [width, height]
  image_depth: 8 | 16 | 32;
  trusted_range_max: number;
}

export interface ViewerState {
  pan: { x: number; y: number }; // image coords at canvas center
  zoom: number; // canvas pixels per image pixel (1 = 1:1)
  exposureMin: number; // raw value mapped to black
  exposureMax: number; // raw value mapped to white
  colormap: ColormapName;
  downsampleMode: 'average' | 'max';
  maskEnabled: boolean;
}

export type ColormapName = 'grayscale' | 'inverse' | 'heat' | 'rainbow';

export interface DiffrantProps {
  metadataUrl: string;
  imageUrl: string;
  imageNumber: number;
  viewerState: ViewerState;
  onViewerStateChange: (state: ViewerState) => void;
}

export interface RawImageData {
  data: Uint8Array | Uint16Array | Uint32Array | Float32Array;
  width: number;
  height: number;
  depth: 8 | 16 | 32;
}
