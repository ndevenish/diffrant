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
        const [metaResponse, imageResponse] = await Promise.all([
          fetch(metadataUrl),
          fetch(imageUrl),
        ]);

        if (!metaResponse.ok) throw new Error(`Failed to fetch metadata: ${metaResponse.status}`);
        if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.status}`);

        const meta: ImageMetadata = await metaResponse.json();
        const imageBuffer = await imageResponse.arrayBuffer();

        if (cancelled) return;

        // Detect format from URL extension
        const ext = imageUrl.split('.').pop()?.toLowerCase() ?? 'png';
        const loader = getLoader(ext);
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
