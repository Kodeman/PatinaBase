'use client';

/**
 * Ripple — the single-session preview state for one time edit in flight
 * (Slice 04, R100 "Editing: the ripple" — the batch-2 half of the plan
 * package; the drag surfaces that call `begin`/`update` and the confirm
 * strip that reads `diff` land in batches 3–4).
 *
 * Clones `schedule-nav-context.tsx`'s pattern exactly: the provider renders
 * `children` only (no DOM of its own), and `useRippleSession()` returns an
 * INERT value when called outside a provider — every field reads as "no
 * edit in flight" rather than throwing, so a surface can call this hook
 * unconditionally regardless of whether it happens to be mounted under
 * `RippleProvider` yet (batch 4 mounts the provider; batches 3's drag
 * handles are written and typechecked against this hook before that lands).
 *
 * Unlike ScheduleNav (a stateless ref-based signal), the ripple genuinely
 * IS state — at most one `RipplePendingEdit` is ever "pending" at a time
 * (R100: "Every time edit previews before it takes" — one edit, previewed,
 * then committed or discarded; never a queue). The provider owns that one
 * slot plus the ONE computed `RippleDiff` derived from it, so the Rule's
 * ghost layer and the Spine's inline preview and the confirm strip all read
 * the exact same diff object — never three separate `rippleDiff` calls that
 * could drift from each other on the same edit.
 *
 * The provider consumes `useResolvedSchedule(projectId)` exactly ONCE (React
 * Query already dedupes the underlying fetch across other callers of the
 * same hook elsewhere in the tree — see schedule-rule.tsx's identical
 * comment — this call is simply where the COMMITTED inputs `rippleDiff`
 * needs come from) and maps its raw rows to the resolver's pinned input
 * shapes via the same `mapPhaseRowToScheduleInput` / `mapMilestoneRowToScheduleInput`
 * pair `useResolvedSchedule` itself uses internally — never a second mapper.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  useResolvedSchedule,
  mapPhaseRowToScheduleInput,
  mapMilestoneRowToScheduleInput,
} from '@patina/supabase';
import type { SchedulePhaseInput, ScheduleMilestoneInput } from '@patina/utils';
import {
  rippleDiff,
  type RipplePendingEdit,
  type RippleDiff,
} from '@/lib/document/schedule-ripple-derivation';

/** Where a pending edit originated — mirrors `scheduleEditCommitted`'s
 *  `surface` prop (schedule-events.ts) so telemetry never needs a second
 *  vocabulary for the same distinction. */
export type RippleEditOrigin = 'rule' | 'spine';

export interface RippleSession {
  edit: RipplePendingEdit;
  origin: RippleEditOrigin;
}

export interface RippleContextValue {
  /** The one pending edit, or `null` when nothing is being previewed. */
  session: RippleSession | null;
  /** Start (or replace) the pending edit. */
  begin: (edit: RipplePendingEdit, origin: RippleEditOrigin) => void;
  /** Replace the pending edit's VALUE while a session is already active,
   *  keeping its `origin` (a drag's continuous pointermove updates). A
   *  no-op when no session is active — callers never need to guard. */
  update: (edit: RipplePendingEdit) => void;
  /** Discard the pending edit (Esc · Revert) — the committed schedule was
   *  never touched, so this is the whole revert. */
  clear: () => void;
  /** `session !== null`, exposed as its own field for render-branch clarity. */
  isActive: boolean;
  /** `true` only under a real `RippleProvider`; `false` on the INERT default.
   *  The DRAG SURFACES gate on this — the inert `begin()`/`update()` are no-ops,
   *  so a handle mounted with no provider above would be a dead affordance
   *  (`isActive` can't tell "no provider" from "provider, nothing pending").
   *  This is the boring, safe signal: render handles only when a provider is
   *  actually present. Batch 4 mounts the provider around the Rule, so in
   *  practice this is always `true` when the Rule renders; until then handles
   *  simply don't appear (no silent no-op drags). */
  providerPresent: boolean;
  /** The committed (pre-edit) phases, mapped to the resolver's input shape —
   *  `rippleDiff`'s first argument, computed once here for every consumer. */
  committedPhases: SchedulePhaseInput[];
  /** The committed (pre-edit) milestones, same convention. */
  committedMilestones: ScheduleMilestoneInput[];
  /** Phase OR milestone name lookup by id — sourced from the same raw rows
   *  `committedPhases`/`committedMilestones` were mapped from (matches
   *  schedule-rule.tsx's `milestoneNameById` convention, widened to cover
   *  phases too since `rippleDiff` needs both). */
  nameById: (id: string) => string | null | undefined;
  /** The active session's diff, or `null` when no session is active. Every
   *  consumer (ghost layer, inline preview, confirm strip) reads this SAME
   *  memoized value — never recomputes `rippleDiff` itself. */
  diff: RippleDiff | null;
}

/** The inert value used when there is no `RippleProvider` above (or the
 *  provider hasn't mounted yet, batch 4) — every method is a safe no-op and
 *  every read reflects "nothing pending," so `useRippleSession()` never
 *  returns null/undefined and callers never need to null-check the hook
 *  itself (only `session`/`diff`, which are meaningfully nullable). */
const INERT: RippleContextValue = {
  session: null,
  begin: () => {},
  update: () => {},
  clear: () => {},
  isActive: false,
  providerPresent: false,
  committedPhases: [],
  committedMilestones: [],
  nameById: () => undefined,
  diff: null,
};

const RippleContext = createContext<RippleContextValue | null>(null);

export function RippleProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [session, setSession] = useState<RippleSession | null>(null);

  const schedule = useResolvedSchedule(projectId);

  // Render-side clock — the same convention as useResolvedSchedule's own
  // injected `today` and schedule-rule.tsx's local one: derived once via
  // useMemo (not read fresh on every render), never `Date.now()` inline.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const committedPhases = useMemo(
    () => schedule.phases.map(mapPhaseRowToScheduleInput),
    [schedule.phases],
  );
  const committedMilestones = useMemo(
    () => schedule.milestones.map(mapMilestoneRowToScheduleInput),
    [schedule.milestones],
  );

  const phaseNameById = useMemo(
    () => new Map(schedule.phases.map((p) => [p.id, p.name])),
    [schedule.phases],
  );
  const milestoneNameById = useMemo(
    () => new Map(schedule.milestones.map((m) => [m.id, m.name])),
    [schedule.milestones],
  );
  const nameById = useCallback(
    (id: string): string | null | undefined => phaseNameById.get(id) ?? milestoneNameById.get(id),
    [phaseNameById, milestoneNameById],
  );

  const begin = useCallback((edit: RipplePendingEdit, origin: RippleEditOrigin) => {
    setSession({ edit, origin });
  }, []);

  const update = useCallback((edit: RipplePendingEdit) => {
    // Functional update — keeps `update` stable (no `session` dep) while
    // still reading the latest origin at call time. Inert when nothing is
    // active: a stray update after an unrelated clear must never revive a
    // session with no origin to attribute it to.
    setSession((prev) => (prev == null ? prev : { edit, origin: prev.origin }));
  }, []);

  const clear = useCallback(() => {
    setSession(null);
  }, []);

  const diff = useMemo<RippleDiff | null>(() => {
    if (session == null) return null;
    return rippleDiff(committedPhases, committedMilestones, session.edit, nameById, today);
  }, [session, committedPhases, committedMilestones, nameById, today]);

  const value = useMemo<RippleContextValue>(
    () => ({
      session,
      begin,
      update,
      clear,
      isActive: session != null,
      providerPresent: true,
      committedPhases,
      committedMilestones,
      nameById,
      diff,
    }),
    [session, begin, update, clear, committedPhases, committedMilestones, nameById, diff],
  );

  return <RippleContext.Provider value={value}>{children}</RippleContext.Provider>;
}

export function useRippleSession(): RippleContextValue {
  return useContext(RippleContext) ?? INERT;
}
