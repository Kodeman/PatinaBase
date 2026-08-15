'use client';

/**
 * The room lens — one room taken in hand. It lifts what belongs to that room to
 * the top of every list that HAS a room dimension, on the paper and on the
 * shelves at once, and washes it. It never filters: nothing hides.
 *
 * Always mounted (the letterhead reads it at every width) but only the ≥1440px
 * spine writes it — which is why the hold releases when the window drops below
 * that: there is no put-down affordance under the full spine, so a held room
 * carried down to a narrow window would strand its "IN HAND" line with nothing
 * on screen able to clear it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface RoomLensValue {
  heldRoomId: string | null;
  toggleRoom: (roomId: string) => void;
}

const INERT: RoomLensValue = { heldRoomId: null, toggleRoom: () => {} };

const RoomLensContext = createContext<RoomLensValue | null>(null);

/** The width at which the spine grows the Rooms block — the only writer. */
const LENS_WIDTH = '(min-width: 1440px)';

export function RoomLensProvider({ children }: { children: ReactNode }) {
  const [heldRoomId, setHeldRoomId] = useState<string | null>(null);

  const toggleRoom = useCallback((roomId: string) => {
    setHeldRoomId((current) => (current === roomId ? null : roomId));
  }, []);

  useEffect(() => {
    if (heldRoomId == null || typeof window === 'undefined') return;
    const query = window.matchMedia?.(LENS_WIDTH);
    if (!query) return;
    // Only on an actual change: a mount-time read would clear the hold wherever
    // matchMedia cannot answer, and the hold can only be taken at this width
    // in the first place.
    const release = () => {
      if (!query.matches) setHeldRoomId(null);
    };
    query.addEventListener('change', release);
    return () => query.removeEventListener('change', release);
  }, [heldRoomId]);

  const value = useMemo<RoomLensValue>(
    () => ({ heldRoomId, toggleRoom }),
    [heldRoomId, toggleRoom],
  );

  return (
    <RoomLensContext.Provider value={value}>{children}</RoomLensContext.Provider>
  );
}

/** Never null: a surface mounted outside the provider simply holds no room. */
export function useRoomLens(): RoomLensValue {
  return useContext(RoomLensContext) ?? INERT;
}
