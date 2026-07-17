'use client';

/**
 * usePhotoViewer — the Room View's single photo-selection state (Room View
 * PHOTOS program, W2). One `openIndex` shared by every door into the viewer:
 * the strip tile, a plan camera tick, and the facts-rail Photos line all call
 * `openAtIndex`; the viewer's own prev/next route back through it too, so the
 * selection is always clamped and always the same source of truth.
 *
 * `openIndex === null` means the viewer is closed. `openAtIndex` clamps into
 * `[0, count)` and closes if there are no photos, so a stale index can never
 * open an out-of-range viewer.
 */

import { useCallback, useState } from 'react';

export interface PhotoViewerState {
  /** null = closed; otherwise the open photo's index. */
  openIndex: number | null;
  /** Open (or move) the viewer to a clamped index; closes when count is 0. */
  openAtIndex: (index: number) => void;
  close: () => void;
}

export function usePhotoViewer(count: number): PhotoViewerState {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const openAtIndex = useCallback(
    (index: number) => {
      if (count <= 0) {
        setOpenIndex(null);
        return;
      }
      setOpenIndex(Math.min(Math.max(0, Math.floor(index)), count - 1));
    },
    [count],
  );

  const close = useCallback(() => setOpenIndex(null), []);

  return { openIndex, openAtIndex, close };
}
