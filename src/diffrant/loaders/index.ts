import type { ImageLoader } from './types';
import { pngLoader } from './pngLoader';

const loaders: Record<string, ImageLoader> = {
  png: pngLoader,
};

export function getLoader(format: string): ImageLoader {
  const loader = loaders[format];
  if (!loader) {
    throw new Error(`No loader for format: ${format}`);
  }
  return loader;
}

export function registerLoader(format: string, loader: ImageLoader): void {
  loaders[format] = loader;
}
