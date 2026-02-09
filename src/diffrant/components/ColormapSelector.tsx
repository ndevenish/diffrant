import { useRef, useEffect } from 'react';
import type { ColormapName } from '../types';
import { COLORMAP_NAMES, getColormapTable } from '../rendering/colormaps';

interface ColormapSelectorProps {
  value: ColormapName;
  onChange: (name: ColormapName) => void;
}

const PREVIEW_W = 120;
const PREVIEW_H = 16;

function ColormapPreview({ name }: { name: ColormapName }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const table = getColormapTable(name);
    const imgData = ctx.createImageData(PREVIEW_W, PREVIEW_H);
    for (let x = 0; x < PREVIEW_W; x++) {
      const ci = Math.round((x / (PREVIEW_W - 1)) * 255);
      const cmOff = ci * 4;
      for (let y = 0; y < PREVIEW_H; y++) {
        const p = (y * PREVIEW_W + x) * 4;
        imgData.data[p] = table[cmOff];
        imgData.data[p + 1] = table[cmOff + 1];
        imgData.data[p + 2] = table[cmOff + 2];
        imgData.data[p + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [name]);

  return <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} style={{ borderRadius: 2, border: '1px solid #333' }} />;
}

export function ColormapSelector({ value, onChange }: ColormapSelectorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Colormap</div>
      {COLORMAP_NAMES.map((name) => (
        <label
          key={name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            padding: '2px 0',
            opacity: value === name ? 1 : 0.6,
          }}
        >
          <input
            type="radio"
            name="colormap"
            checked={value === name}
            onChange={() => onChange(name)}
          />
          <ColormapPreview name={name} />
          <span style={{ fontSize: 12, color: '#ccc' }}>{name}</span>
        </label>
      ))}
    </div>
  );
}
