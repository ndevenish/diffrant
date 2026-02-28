export interface ImageMetadata {
  panel_distance_mm: number;
  beam_center: [number, number];
  pixel_size: number;
  panel_size_fast_slow: [number, number]; // [width, height]
  image_depth: 8 | 16 | 32;
  trusted_range_max: number;
  beam_energy_kev?: number;
}

export interface ViewerState {
  pan: { x: number; y: number }; // image coords at canvas center
  zoom: number; // canvas pixels per image pixel (1 = 1:1)
  exposureMin: number; // raw value mapped to black
  exposureMax: number; // raw value mapped to white
  colormap: ColormapName;
  downsampleMode: 'average' | 'max';
  showMask: boolean; // true = red overlay on masked pixels, false = white
  showResolutionRings: boolean; // true = draw red dashed rings at 1–5 Å
}

export type ColormapName = 'grayscale' | 'inverse' | 'heat' | 'rainbow';

export interface DiffrantViewerProps {
  imageData: RawImageData;
  metadata: ImageMetadata;
  viewerState: ViewerState;
  onViewerStateChange: (state: ViewerState) => void;
}

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

export interface CursorInfo {
  fast: number; // x pixel coordinate
  slow: number; // y pixel coordinate
  value: number;
  resolution_angstrom?: number; // d-spacing resolution at this pixel
}
