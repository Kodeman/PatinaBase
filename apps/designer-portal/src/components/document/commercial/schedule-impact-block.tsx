"use client";

/**
 * The IMPACT block a studio-side ceremony shows before it is confirmed (R110,
 * I130). It borrows the R2 anatomy's vocabulary — a labelled IMPACT part in the
 * ceremony's own sheet — without borrowing a component the DocSheet ceremonies
 * never used.
 *
 * The line is actor-neutral: it names the act and the dates, never the party.
 */

import { useMemo } from "react";
import {
  mapMilestoneRowToScheduleInput,
  mapPhaseRowToScheduleInput,
  useResolvedSchedule,
} from "@patina/supabase";
import {
  deriveScheduleImpact,
  IMPACT_READING,
  IMPACT_UNAVAILABLE,
  IMPACT_UNCOMPUTABLE_LINE,
  type ScheduleImpact,
} from "@/lib/document/schedule-impact";
import type { RipplePendingEdit } from "@/lib/document/schedule-ripple-derivation";

/**
 * Compute a ceremony's prospective schedule effect.
 *
 * Three answers that are NOT the same thing, and are never collapsed:
 *  · reading — the query is in flight; the sheet says so and holds its act.
 *  · unavailable — the read failed; still not evidence about the chain.
 *  · uncomputable — the chain answered and the effect genuinely cannot be
 *    stated. Only this one is R110's downgrade.
 *
 * `edit` is taken apart into primitives so the memo actually holds: every call
 * site builds the edit object inline, and an object literal has a new identity
 * on every keystroke.
 */
export function useScheduleImpact(
  projectId: string | null | undefined,
  edit: RipplePendingEdit | null,
): ScheduleImpact {
  const schedule = useResolvedSchedule(projectId ?? undefined);
  const { phases, milestones, isLoading, isError } = schedule;

  const editKind = edit?.kind ?? null;
  const editTargetId = edit
    ? edit.kind === "milestone-anchor" || edit.kind === "milestone-offset"
      ? edit.milestoneId
      : edit.phaseId
    : null;
  const editAnchorDate =
    edit && (edit.kind === "phase-anchor" || edit.kind === "milestone-anchor")
      ? edit.anchorDate
      : null;

  // `today` is keyed on the data, exactly as useResolvedSchedule keys its own —
  // a memo that survives midnight must not compute against yesterday.
  const today = useMemo(
    () => new Date().toISOString().slice(0, 10),
    [phases, milestones],
  );

  return useMemo(() => {
    if (!projectId) return UNCOMPUTABLE_NO_PROJECT;
    if (isError) return IMPACT_UNAVAILABLE;
    if (isLoading) return IMPACT_READING;
    if (!editKind || !editTargetId) return UNCOMPUTABLE_NO_TARGET;
    const rebuilt =
      editKind === "phase-anchor"
        ? ({
            kind: "phase-anchor",
            phaseId: editTargetId,
            anchorDate: editAnchorDate ?? "",
          } as const)
        : editKind === "milestone-anchor"
          ? ({
              kind: "milestone-anchor",
              milestoneId: editTargetId,
              anchorDate: editAnchorDate ?? "",
            } as const)
          : null;
    return deriveScheduleImpact(
      phases.map(mapPhaseRowToScheduleInput),
      milestones.map(mapMilestoneRowToScheduleInput),
      rebuilt,
      today,
    );
  }, [
    projectId,
    phases,
    milestones,
    isLoading,
    isError,
    editKind,
    editTargetId,
    editAnchorDate,
    today,
  ]);
}

const UNCOMPUTABLE_NO_PROJECT: ScheduleImpact = {
  status: "uncomputable",
  computable: false,
  line: IMPACT_UNCOMPUTABLE_LINE,
};
const UNCOMPUTABLE_NO_TARGET = UNCOMPUTABLE_NO_PROJECT;

/**
 * The first thread-lane phase of a project — the procurement/trade thread the
 * furnishings and trade ceremonies anchor. Mirrors
 * `_schedule_thread_phase(uuid)` (00475) so the stated impact and the written
 * anchor name the same phase.
 */
export function useThreadPhaseId(projectId: string | null | undefined): string | null {
  const { phases } = useResolvedSchedule(projectId ?? undefined);
  return useMemo(() => {
    const threads = phases
      .filter((p) => p.lane === "thread")
      .sort((a, b) => {
        const aOrder = a.sort_order ?? 0;
        const bOrder = b.sort_order ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.id).localeCompare(String(b.id));
      });
    return threads.length > 0 ? String(threads[0].id) : null;
  }, [phases]);
}

/**
 * The project's engagement-start phase — the first main-lane phase. Mirrors
 * `_schedule_engagement_start_phase(uuid)` (00475).
 */
export function useEngagementStartPhaseId(
  projectId: string | null | undefined,
): string | null {
  const { phases } = useResolvedSchedule(projectId ?? undefined);
  return useMemo(() => {
    const main = phases
      .filter((p) => p.lane !== "thread")
      .sort((a, b) => {
        const aOrder = a.sort_order ?? 0;
        const bOrder = b.sort_order ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.id).localeCompare(String(b.id));
      });
    return main.length > 0 ? String(main[0].id) : null;
  }, [phases]);
}

export function ScheduleImpactBlock({ impact }: { impact: ScheduleImpact }) {
  return (
    <div
      role="group"
      aria-label="Impact"
      data-schedule-impact={impact.status}
      className="mt-3 border-t border-[var(--doc-ink-border)] pt-3"
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Impact
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-charcoal)]">
        {impact.computable ? impact.sentence : impact.line}
      </p>
    </div>
  );
}
