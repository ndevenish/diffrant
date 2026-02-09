import { decode } from 'fast-png';
import type { ImageLoader } from './types';
import type { ImageMetadata, RawImageData } from '../types';

export const pngLoader: ImageLoader = {
  load(buffer: ArrayBuffer, metadata: ImageMetadata): RawImageData {
    const png = decode(buffer);
    const { width, height, data, depth, channels } = png;

    // fast-png returns data as Uint8Array or Uint16Array depending on depth
    // For grayscale images, channels === 1 or 2 (with alpha)
    // We want just the grayscale channel
    const pixelCount = width * height;

    if (metadata.image_depth === 16 || depth === 16) {
      const src = data instanceof Uint16Array ? data : new Uint16Array(data.buffer);
      if (channels === 1) {
        return { data: src, width, height, depth: 16 };
      }
      // Extract first channel if multi-channel
      const out = new Uint16Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        out[i] = src[i * channels];
      }
      return { data: out, width, height, depth: 16 };
    }

    if (metadata.image_depth === 8 || depth === 8) {
      const src = data instanceof Uint8Array ? data : new Uint8Array(data.buffer);
      if (channels === 1) {
        return { data: src, width, height, depth: 8 };
      }
      const out = new Uint8Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        out[i] = src[i * channels];
      }
      return { data: out, width, height, depth: 8 };
    }

    // Fallback: treat as 16-bit
    const src = data instanceof Uint16Array ? data : new Uint16Array(data.buffer);
    return { data: src, width, height, depth: 16 };
  },
};
