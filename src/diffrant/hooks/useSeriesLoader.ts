import { useState, useEffect, useRef } from 'react';
import type { ImageMetadata, RawImageData, SeriesState, StackMode } from '../types';
import { getLoader } from '../loaders';

interface UseSeriesLoaderResult {
  metadata: ImageMetadata | null;
  imageData: RawImageData | null;
  loading: boolean;
  error: string | null;
}

interface CacheEntry {
  status: 'loading' | 'ready' | 'error';
  data?: RawImageData;
  promise?: Promise<RawImageData>;
  lastUsed: number;
}

const MAX_CACHE_SIZE = 10;

function evictCache(cache: Map<string, CacheEntry>) {
  if (cache.size <= MAX_CACHE_SIZE) return;
  // Find the least-recently-used entry
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of cache) {
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

async function fetchFrame(url: string, meta: ImageMetadata): Promise<RawImageData> {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/octet-stream' },
  });
  if (!response.ok) throw new Error(`Failed to fetch frame: ${response.status}`);
  const buffer = await response.arrayBuffer();

  const contentType = response.headers.get('content-type') ?? '';
  let format: string;
  if (contentType.includes('octet-stream')) {
    format = 'raw';
  } else if (contentType.includes('png')) {
    format = 'png';
  } else {
    format = url.split('.').pop()?.toLowerCase() ?? 'png';
  }
  return getLoader(format).load(buffer, meta);
}

function stackFrames(frames: RawImageData[], mode: StackMode): RawImageData {
  if (frames.length === 1) return frames[0];

  const { width, height, depth } = frames[0];
  const len = width * height;
  const acc = new Float32Array(len);

  for (const frame of frames) {
    const d = frame.data;
    for (let i = 0; i < len; i++) {
      acc[i] += d[i];
    }
  }

  if (mode === 'average') {
    const n = frames.length;
    for (let i = 0; i < len; i++) {
      acc[i] /= n;
    }
  }

  // Clamp to depth max and write into the correct typed array
  const maxVal = depth === 8 ? 255 : depth === 16 ? 65535 : 4294967295;
  let out: Uint8Array | Uint16Array | Uint32Array;
  if (depth === 8) {
    out = new Uint8Array(len);
  } else if (depth === 16) {
    out = new Uint16Array(len);
  } else {
    out = new Uint32Array(len);
  }
  for (let i = 0; i < len; i++) {
    out[i] = Math.min(Math.round(acc[i]), maxVal);
  }

  return { data: out, width, height, depth };
}

export function useSeriesLoader(
  metadataUrl: string,
  imageUrlFactory: (index: number) => string,
  seriesState: SeriesState,
): UseSeriesLoaderResult {
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [imageData, setImageData] = useState<RawImageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef(new Map<string, CacheEntry>());
  const metaRef = useRef<ImageMetadata | null>(null);

  // Fetch metadata once
  useEffect(() => {
    if (!metadataUrl) return;
    let cancelled = false;
    async function loadMeta() {
      try {
        const response = await fetch(metadataUrl);
        if (!response.ok) throw new Error(`Failed to fetch metadata: ${response.status}`);
        const meta: ImageMetadata = await response.json();
        if (!cancelled) {
          metaRef.current = meta;
          setMetadata(meta);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }
    loadMeta();
    return () => { cancelled = true; };
  }, [metadataUrl]);

  // Load frames when index/stackCount/stackMode change (or metadata arrives)
  const { currentIndex, stackCount, stackMode } = seriesState;
  useEffect(() => {
    const metaOrNull = metaRef.current;
    if (!metaOrNull) return;
    const meta: ImageMetadata = metaOrNull;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const cache = cacheRef.current;
    const now = Date.now();

    function getOrFetch(url: string): Promise<RawImageData> {
      const existing = cache.get(url);
      if (existing?.status === 'ready' && existing.data) {
        existing.lastUsed = now;
        return Promise.resolve(existing.data);
      }
      if (existing?.status === 'loading' && existing.promise) {
        existing.lastUsed = now;
        return existing.promise;
      }
      const promise = fetchFrame(url, meta).then((data) => {
        const entry = cache.get(url);
        if (entry) {
          entry.status = 'ready';
          entry.data = data;
        }
        return data;
      }).catch((err) => {
        cache.delete(url);
        throw err;
      });
      cache.set(url, { status: 'loading', promise, lastUsed: now });
      evictCache(cache);
      return promise;
    }

    // Compute needed frame URLs
    const urls: string[] = [];
    for (let i = 0; i < stackCount; i++) {
      urls.push(imageUrlFactory(currentIndex + i));
    }

    Promise.all(urls.map((url) => getOrFetch(url)))
      .then((frames) => {
        if (cancelled) return;
        const stacked = stackFrames(frames, stackMode);
        setImageData(stacked);
        setLoading(false);

        // Prefetch: 2 ahead, 1 behind (non-blocking)
        const prefetchIndices = [
          currentIndex + stackCount,
          currentIndex + stackCount + 1,
          currentIndex - 1,
        ];
        for (const idx of prefetchIndices) {
          if (idx < 0) continue;
          if (seriesState.totalFrames !== undefined && idx >= seriesState.totalFrames) continue;
          const url = imageUrlFactory(idx);
          if (!cache.has(url)) {
            getOrFetch(url).catch(() => { /* prefetch failure is fine */ });
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
  }, [metadata, currentIndex, stackCount, stackMode, imageUrlFactory]);

  return { metadata, imageData, loading, error };
}
