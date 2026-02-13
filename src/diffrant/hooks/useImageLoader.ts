import { useState, useEffect } from 'react';
import type { ImageMetadata, RawImageData } from '../types';
import { getLoader } from '../loaders';

interface UseImageLoaderResult {
  metadata: ImageMetadata | null;
  imageData: RawImageData | null;
  loading: boolean;
  error: string | null;
}

export function useImageLoader(
  metadataUrl: string,
  imageUrl: string,
): UseImageLoaderResult {
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [imageData, setImageData] = useState<RawImageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        // Fetch metadata first (needed by raw loader to know dimensions)
        const metaResponse = await fetch(metadataUrl);
        if (!metaResponse.ok) throw new Error(`Failed to fetch metadata: ${metaResponse.status}`);
        const meta: ImageMetadata = await metaResponse.json();

        if (cancelled) return;

        // Request raw binary by default (much faster), fall back to png
        const imageResponse = await fetch(imageUrl, {
          headers: { 'Accept': 'application/octet-stream' },
        });
        if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.status}`);
        const imageBuffer = await imageResponse.arrayBuffer();

        if (cancelled) return;

        // Detect format from Content-Type header, falling back to URL extension
        const contentType = imageResponse.headers.get('content-type') ?? '';
        let format: string;
        if (contentType.includes('octet-stream')) {
          format = 'raw';
        } else if (contentType.includes('png')) {
          format = 'png';
        } else {
          format = imageUrl.split('.').pop()?.toLowerCase() ?? 'png';
        }
        const loader = getLoader(format);
        const raw = loader.load(imageBuffer, meta);

        if (cancelled) return;

        setMetadata(meta);
        setImageData(raw);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [metadataUrl, imageUrl]);

  return { metadata, imageData, loading, error };
}
