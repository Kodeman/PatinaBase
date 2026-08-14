'use client';

/**
 * ScheduleNav — the one thin wire between the Rule (the minimap) and the
 * Spine (the ledger it navigates). Anatomy note 02: "Click a phase on the
 * rule and the spine scrolls there and unfolds it."
 *
 * The provider owns mutable handler slots (refs, never state — a surface
 * registering its handler must not re-render the whole document subtree). Two
 * wires run through here, in opposite directions:
 *
 *   · `reveal`  — Rule → Spine. Click a phase on the minimap and the ledger
 *                 scrolls there and unfolds it.
 *   · `armEdit` — Spine → Rule (B3). "Edit dates" on a phase no longer opens a
 *                 typed panel in the ledger; it scrolls the Rule into view and
 *                 focuses that phase's bar, so the edit happens on the
 *                 instrument — by drag or by the bar's keyboard model.
 *
 * Each surface registers its concrete handler in an effect and unregisters on
 * unmount. When nothing is registered — the counterpart surface is absent, or
 * this one is mounted without a provider at all — the call is an inert no-op
 * (§3.5: the wire simply does nothing rather than throwing). No telemetry lives
 * here; the Rule fires its own event beside the `reveal` call (S2-4).
 */

import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

export type ScheduleRevealTarget =
  | { kind: 'phase'; phaseId: string }
  | { kind: 'milestone'; phaseId: string; milestoneId: string };

export interface ScheduleNavValue {
  reveal: (target: ScheduleRevealTarget) => void;
  registerRevealHandler: (fn: ((target: ScheduleRevealTarget) => void) | null) => void;
  /** Spine → Rule: bring the Rule into view and hand the phase's bar the
   *  focus, so its dates are edited on the instrument. */
  armEdit: (phaseId: string) => void;
  registerArmEditHandler: (fn: ((phaseId: string) => void) | null) => void;
}

/** The inert value used when there is no provider above — every method is a
 *  safe no-op, so `useScheduleNav()` never returns null and callers never
 *  need to null-check. */
const INERT: ScheduleNavValue = {
  reveal: () => {},
  registerRevealHandler: () => {},
  armEdit: () => {},
  registerArmEditHandler: () => {},
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

  // The reverse wire, same slot pattern: the Rule registers, the Spine calls.
  const armEditRef = useRef<((phaseId: string) => void) | null>(null);

  const registerArmEditHandler = useCallback((fn: ((phaseId: string) => void) | null) => {
    armEditRef.current = fn;
  }, []);

  const armEdit = useCallback((phaseId: string) => {
    armEditRef.current?.(phaseId);
  }, []);

  // Stable value — the provider is inert (children-only in effect) until the
  // surfaces register, and its identity never changes across renders.
  const value = useMemo<ScheduleNavValue>(
    () => ({ reveal, registerRevealHandler, armEdit, registerArmEditHandler }),
    [reveal, registerRevealHandler, armEdit, registerArmEditHandler],
  );

  return <ScheduleNavContext.Provider value={value}>{children}</ScheduleNavContext.Provider>;
}

export function useScheduleNav(): ScheduleNavValue {
  return useContext(ScheduleNavContext) ?? INERT;
}
