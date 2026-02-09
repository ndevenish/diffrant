import { useCallback } from 'react';
import type { ViewerState } from '../types';

export function useViewerState(
  state: ViewerState,
  onChange: (state: ViewerState) => void,
) {
  const update = useCallback(
    (partial: Partial<ViewerState>) => {
      onChange({ ...state, ...partial });
    },
    [state, onChange],
  );

  return { state, update };
}
