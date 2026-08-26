'use client';

/**
 * The room lens — one room taken in hand. It lifts what belongs to that room to
 * the top of every list that HAS a room dimension, on the paper and on the
 * shelves at once, and washes it. It never filters: nothing hides.
 *
 * B2 (R124) — the hold survives every width. It used to release on dropping
 * below 1440px, and I136 named the reason: the only writer was the ≥1440 spine
 * block, so a hold carried down stranded its "IN HAND" line with nothing on
 * screen able to clear it. The ticket's room chip and the letterhead's own
 * release are that affordance now, at every width, so the release is gone and
 * a lift taken at 1440 still reads at 390.
 */

import {
  createContext,
  useCallback,
  useContext,
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

export function RoomLensProvider({ children }: { children: ReactNode }) {
  const [heldRoomId, setHeldRoomId] = useState<string | null>(null);

  const toggleRoom = useCallback((roomId: string) => {
    setHeldRoomId((current) => (current === roomId ? null : roomId));
  }, []);

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
