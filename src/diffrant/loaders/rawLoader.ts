import type { ImageLoader } from './types';
import type { ImageMetadata, RawImageData } from '../types';

/** Loader for raw little-endian u16 pixel data (no container format). */
export const rawLoader: ImageLoader = {
  load(buffer: ArrayBuffer, metadata: ImageMetadata): RawImageData {
    const [width, height] = metadata.panel_size_fast_slow;
    const depth = metadata.image_depth;

    if (depth === 16) {
      const data = new Uint16Array(buffer);
      return { data, width, height, depth: 16 };
    }

    if (depth === 32) {
      const data = new Uint32Array(buffer);
      return { data, width, height, depth: 32 };
    }

    // Fallback: assume 16-bit
    const data = new Uint16Array(buffer);
    return { data, width, height, depth: 16 };
  },
};
