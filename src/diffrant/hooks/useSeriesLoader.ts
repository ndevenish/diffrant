import { useState, useEffect } from 'react';
import type { ImageData, SeriesFrameUrlResolver } from '../types';
import { getLoader } from '../loaders';

interface UseSeriesLoaderResult {
  imageData: ImageData | null;
  loading: boolean;
  error: string | null;
}

interface CacheEntry {
  status: 'loading' | 'ready' | 'error';
  data?: ImageData;
  promise?: Promise<ImageData>;
  lastUsed: number;
}

const MAX_CACHE_SIZE = 10;

// Module-level cache — intentionally outside React so DevTools never inspects
// the large typed arrays stored here.
const frameCache = new Map<string, CacheEntry>();

function evictCache() {
  if (frameCache.size <= MAX_CACHE_SIZE) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of frameCache) {
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed;
      oldestKey = key;
    }
  }
  if (oldestKey) frameCache.delete(oldestKey);
}

async function fetchFrame(metadataUrl: string, imageUrl: string): Promise<ImageData> {
  const metaResponse = await fetch(metadataUrl);
  if (!metaResponse.ok) throw new Error(`Failed to fetch metadata: ${metaResponse.status}`);
  const meta = await metaResponse.json();

  const imageResponse = await fetch(imageUrl, { headers: { 'Accept': 'application/octet-stream' } });
  if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  const imageBuffer = await imageResponse.arrayBuffer();

  const contentType = imageResponse.headers.get('content-type') ?? '';
  let format: string;
  if (contentType.includes('octet-stream')) {
    format = 'raw';
  } else if (contentType.includes('png')) {
    format = 'png';
  } else {
    format = imageUrl.split('.').pop()?.toLowerCase() ?? 'png';
  }
  const raw = getLoader(format).load(imageBuffer, meta);
  const combined = { ...raw, ...meta };
  // Make the pixel buffer non-enumerable so React DevTools doesn't try to
  // serialize/diff 18M array elements during commit, causing a multi-second freeze.
  Object.defineProperty(combined, 'data', {
    value: raw.data,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return combined;
}

function getOrFetch(
  getFrameUrls: SeriesFrameUrlResolver,
  frame: number,
  now: number,
): Promise<ImageData> {
  const { metadataUrl, imageUrl } = getFrameUrls(frame);
  const key = imageUrl;
  const existing = frameCache.get(key);
  if (existing?.status === 'ready' && existing.data) {
    existing.lastUsed = now;
    return Promise.resolve(existing.data);
  }
  if (existing?.status === 'loading' && existing.promise) {
    existing.lastUsed = now;
    return existing.promise;
  }
  console.log(`[cache] fetching frame ${frame} (${imageUrl.split('/').pop()})`);
  const promise = fetchFrame(metadataUrl, imageUrl).then((data) => {
    const entry = frameCache.get(key);
    if (entry) {
      entry.status = 'ready';
      entry.data = data;
    }
    return data;
  }).catch((err) => {
    frameCache.delete(key);
    throw err;
  });
  frameCache.set(key, { status: 'loading', promise, lastUsed: now });
  evictCache();
  return promise;
}

export function useSeriesLoader(
  getFrameUrls: SeriesFrameUrlResolver,
  currentFrame: number,
  frameCount: number,
): UseSeriesLoaderResult {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const now = Date.now();

    getOrFetch(getFrameUrls, currentFrame, now)
      .then((data) => {
        if (cancelled) return;
        setImageData(data);
        setLoading(false);

        // Prefetch 2 ahead, 1 behind (non-blocking)
        for (const f of [currentFrame + 1, currentFrame + 2, currentFrame - 1]) {
          if (f < 1 || f > frameCount) continue;
          const { imageUrl } = getFrameUrls(f);
          if (!frameCache.has(imageUrl)) {
            getOrFetch(getFrameUrls, f, now).catch(() => {});
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [getFrameUrls, currentFrame, frameCount]);

  return { imageData, loading, error };
}
