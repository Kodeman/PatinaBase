'use client';

/**
 * The release ceremony — section-local state for "releasing is choosing, not
 * drafting" (Authorized Schedule deck, slide 10).
 *
 * idle → selecting (the head act) → reviewing (the sheet) → idle.
 *
 * Nothing is created until the review sheet commits. The provisional number is
 * minted at the start of the ceremony so designer and client are talking about
 * the same № throughout, and "Put back · Esc" forgets the ticks and hands that
 * number back for the next attempt.
 *
 * Deliberately section-local: this is the schedule's own state, not the
 * document's. It never touches the query cache and never writes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  nextInstrumentNumber,
  roomTriState,
  type InstrumentLike,
  type RoomTriState,
} from '@/lib/document/authorization-derivation';
import {
  START_RELEASE_EVENT,
  type StartReleaseEventDetail,
} from '../commercial/void-supersede-act';

export type ReleaseCeremonyPhase = 'idle' | 'selecting' | 'reviewing';

export interface ReleaseCeremonyValue {
  phase: ReleaseCeremonyPhase;
  /** The ticked schedule lines, in no particular order. */
  selected: ReadonlySet<string>;
  selectedIds: string[];
  /** The № this release will carry if it is committed. */
  provisionalNumber: number;
  isSelected: (lineId: string) => boolean;
  /** Enter selection mode, optionally with lines already ticked. */
  begin: (seedIds?: readonly string[]) => void;
  toggleLine: (lineId: string) => void;
  /** Tick or untick a whole room at once (eligible ids only). */
  setRoom: (lineIds: readonly string[], next: boolean) => void;
  roomState: (lineIds: readonly string[]) => RoomTriState;
  /** Open the review sheet. Refuses an empty release. */
  review: () => void;
  /** Leave the sheet with the ticks intact. */
  backToSelecting: () => void;
  /** Leave the ceremony and forget the ticks. */
  putBack: () => void;
}

const ReleaseCeremonyContext = createContext<ReleaseCeremonyValue | null>(null);

export function ReleaseCeremonyProvider({
  instruments,
  children,
}: {
  /** Every instrument the project has issued — voided ones included. */
  instruments: readonly InstrumentLike[] | null | undefined;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<ReleaseCeremonyPhase>('idle');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Minted when the ceremony opens, so the number cannot shift underfoot while
  // the designer is still choosing.
  const [mintedNumber, setMintedNumber] = useState<number | null>(null);

  const liveNumber = nextInstrumentNumber(instruments);
  const provisionalNumber = mintedNumber ?? liveNumber;

  const begin = useCallback(
    (seedIds?: readonly string[]) => {
      setSelected(new Set(seedIds ?? []));
      setMintedNumber(nextInstrumentNumber(instruments));
      setPhase('selecting');
    },
    [instruments],
  );

  const putBack = useCallback(() => {
    setSelected(new Set());
    setMintedNumber(null);
    setPhase('idle');
  }, []);

  const toggleLine = useCallback((lineId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  const setRoom = useCallback((lineIds: readonly string[], on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of lineIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const review = useCallback(() => {
    setPhase((current) =>
      current === 'selecting' && selected.size > 0 ? 'reviewing' : current,
    );
  }, [selected]);

  const backToSelecting = useCallback(() => {
    setPhase((current) => (current === 'reviewing' ? 'selecting' : current));
  }, []);

  // Esc puts the ceremony back while the schedule is the selection surface.
  // The review sheet owns Escape once it is open (DocSheet stops it there).
  useEffect(() => {
    if (phase !== 'selecting') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      putBack();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, putBack]);

  // VoidAct's "Start the superseding release" dispatches this on the window
  // once a void lands, carrying the freed lines as preTickIds. The schedule
  // is the only surface with a ceremony, so it's the one that listens —
  // begin() pre-ticks the freed lines the same way a designer's own ticks
  // would, regardless of the ceremony's current phase.
  useEffect(() => {
    const onStartRelease = (event: Event) => {
      const detail = (event as CustomEvent<StartReleaseEventDetail>).detail;
      begin(detail?.preTickIds ?? []);
    };
    window.addEventListener(START_RELEASE_EVENT, onStartRelease as EventListener);
    return () =>
      window.removeEventListener(
        START_RELEASE_EVENT,
        onStartRelease as EventListener,
      );
  }, [begin]);

  const value = useMemo<ReleaseCeremonyValue>(
    () => ({
      phase,
      selected,
      selectedIds: Array.from(selected),
      provisionalNumber,
      isSelected: (lineId: string) => selected.has(lineId),
      begin,
      toggleLine,
      setRoom,
      roomState: (lineIds: readonly string[]) =>
        roomTriState(selected, lineIds),
      review,
      backToSelecting,
      putBack,
    }),
    [
      backToSelecting,
      begin,
      phase,
      provisionalNumber,
      putBack,
      review,
      selected,
      setRoom,
      toggleLine,
    ],
  );

  return (
    <ReleaseCeremonyContext.Provider value={value}>
      {children}
    </ReleaseCeremonyContext.Provider>
  );
}

/** The ceremony, or null outside a schedule that offers one. */
export function useReleaseCeremony(): ReleaseCeremonyValue | null {
  return useContext(ReleaseCeremonyContext);
}
