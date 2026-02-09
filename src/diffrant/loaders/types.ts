import type { ImageMetadata, RawImageData } from '../types';

export interface ImageLoader {
  load(buffer: ArrayBuffer, metadata: ImageMetadata): RawImageData;
}
