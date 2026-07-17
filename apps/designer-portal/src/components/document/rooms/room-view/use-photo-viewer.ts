'use client';

/**
 * usePhotoViewer — the Room View's single photo-selection state (Room View
 * PHOTOS program, W2/W3-T8). One `openIndex` shared by every door into the
 * viewer: the strip tile, a plan camera tick, an orbit frustum marker, and
 * the facts-rail Photos line all call `openAtIndex`; the viewer's own
 * prev/next route back through it too, so the selection is always clamped
 * and always the same source of truth.
 *
 * `openIndex === null` means the viewer is closed. `openAtIndex` clamps into
 * `[0, count)` and closes if there are no photos, so a stale index can never
 * open an out-of-range viewer.
 *
 * Telemetry (I76): `room_photo_opened` fires from HERE — the one place every
 * door funnels through — rather than sprinkling a capture call at each call
 * site. `openAtIndex` takes an optional `source`; the event fires only on the
 * CLOSED → OPEN transition (checked via a ref, not the `setOpenIndex`
 * functional-updater form, since React can invoke that form twice in
 * StrictMode dev and would double-fire an analytics call). The viewer's own
 * prev/next calls `onIndexChange` (= `openAtIndex`) with NO source while
 * already open, so they never re-fire it — "once per open, not per
 * prev/next" falls out of this naturally, with no separate guard needed.
 */

import { useCallback, useRef, useState } from 'react';
import { roomEvents, type RoomPhotoOpenSource } from '@/lib/analytics';

export interface PhotoViewerState {
  /** null = closed; otherwise the open photo's index. */
  openIndex: number | null;
  /** Open (or move) the viewer to a clamped index; closes when count is 0.
   *  Pass `source` only from an entry point that OPENS the viewer (strip
   *  tile, plan/orbit marker, facts-rail line) — prev/next inside the
   *  already-open viewer omits it. */
  openAtIndex: (index: number, source?: RoomPhotoOpenSource) => void;
  close: () => void;
}

export function usePhotoViewer(count: number, roomId: string): PhotoViewerState {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openIndexRef = useRef<number | null>(null);
  openIndexRef.current = openIndex;

  const openAtIndex = useCallback(
    (index: number, source?: RoomPhotoOpenSource) => {
      if (count <= 0) {
        setOpenIndex(null);
        return;
      }
      if (openIndexRef.current === null && source) {
        roomEvents.roomPhotoOpened({ room_id: roomId, source });
      }
      setOpenIndex(Math.min(Math.max(0, Math.floor(index)), count - 1));
    },
    [count, roomId],
  );

  const close = useCallback(() => setOpenIndex(null), []);

  return { openIndex, openAtIndex, close };
}
