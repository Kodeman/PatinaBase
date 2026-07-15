'use client';

/**
 * ScheduleNav — the one thin wire between the Rule (the minimap) and the
 * Spine (the ledger it navigates). Anatomy note 02: "Click a phase on the
 * rule and the spine scrolls there and unfolds it."
 *
 * The provider owns a single mutable handler slot (a ref, never state — the
 * spine registering its reveal fn must not re-render the whole document
 * subtree). The Rule calls `reveal(target)`; the Spine registers the concrete
 * handler in an effect and unregisters on unmount. When nothing is registered
 * — the spine is behind its flag and absent, or the Rule is mounted without a
 * provider at all — `reveal` is an inert no-op (§3.5: the minimap simply does
 * nothing rather than throwing). No telemetry lives here; the Rule fires its
 * own event beside the `reveal` call (S2-4).
 */

import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

export type ScheduleRevealTarget =
  | { kind: 'phase'; phaseId: string }
  | { kind: 'milestone'; phaseId: string; milestoneId: string };

export interface ScheduleNavValue {
  reveal: (target: ScheduleRevealTarget) => void;
  registerRevealHandler: (fn: ((target: ScheduleRevealTarget) => void) | null) => void;
}

/** The inert value used when there is no provider above — every method is a
 *  safe no-op, so `useScheduleNav()` never returns null and callers never
 *  need to null-check. */
const INERT: ScheduleNavValue = {
  reveal: () => {},
  registerRevealHandler: () => {},
};

const ScheduleNavContext = createContext<ScheduleNavValue | null>(null);

export function ScheduleNavProvider({ children }: { children: ReactNode }) {
  // The registered handler lives in a ref: the spine swaps it in an effect
  // without forcing a context re-render, and `reveal` reads the latest value
  // at call time. `null` (nothing registered) makes `reveal` a no-op.
  const handlerRef = useRef<((target: ScheduleRevealTarget) => void) | null>(null);

  const registerRevealHandler = useCallback(
    (fn: ((target: ScheduleRevealTarget) => void) | null) => {
      handlerRef.current = fn;
    },
    [],
  );

  const reveal = useCallback((target: ScheduleRevealTarget) => {
    handlerRef.current?.(target);
  }, []);

  // Stable value — the provider is inert (children-only in effect) until the
  // spine registers, and its identity never changes across renders.
  const value = useMemo<ScheduleNavValue>(
    () => ({ reveal, registerRevealHandler }),
    [reveal, registerRevealHandler],
  );

  return <ScheduleNavContext.Provider value={value}>{children}</ScheduleNavContext.Provider>;
}

export function useScheduleNav(): ScheduleNavValue {
  return useContext(ScheduleNavContext) ?? INERT;
}
