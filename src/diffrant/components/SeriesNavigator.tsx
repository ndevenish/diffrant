import type { SeriesState, StackMode } from '../types';
import './SeriesNavigator.css';

interface SeriesNavigatorProps {
  seriesState: SeriesState;
  onSeriesStateChange: (state: SeriesState) => void;
}

export function SeriesNavigator({ seriesState, onSeriesStateChange }: SeriesNavigatorProps) {
  const { currentIndex, stackCount, stackMode, totalFrames } = seriesState;

  const lastFrame = totalFrames !== undefined ? totalFrames - stackCount : undefined;
  const canGoBack = currentIndex > 0;
  const canGoForward = lastFrame === undefined || currentIndex < lastFrame;

  function goFirst() {
    onSeriesStateChange({ ...seriesState, currentIndex: 0 });
  }
  function goPrev() {
    onSeriesStateChange({ ...seriesState, currentIndex: Math.max(0, currentIndex - stackCount) });
  }
  function goNext() {
    const next = currentIndex + stackCount;
    if (lastFrame !== undefined && next > lastFrame) return;
    onSeriesStateChange({ ...seriesState, currentIndex: next });
  }
  function goLast() {
    if (lastFrame === undefined) return;
    onSeriesStateChange({ ...seriesState, currentIndex: Math.max(0, lastFrame) });
  }
  function handleFrameInput(value: string) {
    const n = parseInt(value, 10);
    if (isNaN(n)) return;
    const clamped = Math.max(0, lastFrame !== undefined ? Math.min(n, lastFrame) : n);
    onSeriesStateChange({ ...seriesState, currentIndex: clamped });
  }

  function handleStackCount(value: string) {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) return;
    const maxStack = totalFrames !== undefined ? totalFrames - currentIndex : n;
    onSeriesStateChange({ ...seriesState, stackCount: Math.min(n, maxStack) });
  }

  function handleStackMode(mode: StackMode) {
    onSeriesStateChange({ ...seriesState, stackMode: mode });
  }

  return (
    <div className="series-navigator">
      <div className="series-group">
        <span className="series-label">Frame</span>
        <input
          className="series-input series-input-frame"
          type="number"
          min={0}
          max={lastFrame ?? undefined}
          value={currentIndex}
          onChange={(e) => handleFrameInput(e.target.value)}
        />
        {totalFrames !== undefined && <span>/ {totalFrames}</span>}
      </div>

      <div className="series-nav-buttons">
        <button className="series-btn" onClick={goFirst} disabled={!canGoBack} title="First frame">
          |&#x25C0;
        </button>
        <button className="series-btn" onClick={goPrev} disabled={!canGoBack} title="Previous frame">
          &#x25C0;
        </button>
        <button className="series-btn" onClick={goNext} disabled={!canGoForward} title="Next frame">
          &#x25B6;
        </button>
        <button
          className="series-btn"
          onClick={goLast}
          disabled={lastFrame === undefined}
          title="Last frame"
        >
          &#x25B6;|
        </button>
      </div>

      <div className="series-separator" />

      <div className="series-group">
        <span className="series-label">Stack:</span>
        <input
          className="series-input series-input-small"
          type="number"
          min={1}
          value={stackCount}
          onChange={(e) => handleStackCount(e.target.value)}
        />
        <span>frames</span>
        <div className="series-mode-toggle">
          <button
            className={`series-mode-btn ${stackMode === 'sum' ? 'series-mode-active' : ''}`}
            onClick={() => handleStackMode('sum')}
          >
            sum
          </button>
          <button
            className={`series-mode-btn ${stackMode === 'average' ? 'series-mode-active' : ''}`}
            onClick={() => handleStackMode('average')}
          >
            avg
          </button>
        </div>
      </div>

    </div>
  );
}
