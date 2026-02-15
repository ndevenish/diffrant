interface DownsampleSelectorProps {
  value: 'average' | 'max';
  onChange: (mode: 'average' | 'max') => void;
}

export function DownsampleSelector({ value, onChange }: DownsampleSelectorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Downsample
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#ccc' }}>
        <input type="radio" name="downsample" checked={value === 'average'} onChange={() => onChange('average')} />
        Average
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#ccc' }}>
        <input type="radio" name="downsample" checked={value === 'max'} onChange={() => onChange('max')} />
        Max
      </label>
    </div>
  );
}
