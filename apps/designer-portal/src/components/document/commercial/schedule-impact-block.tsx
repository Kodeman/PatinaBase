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
  type ScheduleImpact,
} from "@/lib/document/schedule-impact";
import type { RipplePendingEdit } from "@/lib/document/schedule-ripple-derivation";

/**
 * Compute a ceremony's prospective schedule effect. `edit` is null when the
 * ceremony has no identifiable target yet — the impact then reads uncomputable,
 * which is the honest answer and the R110 downgrade.
 */
export function useScheduleImpact(
  projectId: string | null | undefined,
  edit: RipplePendingEdit | null,
): ScheduleImpact {
  const schedule = useResolvedSchedule(projectId ?? undefined);
  const { phases, milestones } = schedule;
  return useMemo(() => {
    if (!projectId) return { computable: false as const, line: UNCOMPUTABLE_FALLBACK };
    const today = new Date().toISOString().slice(0, 10);
    return deriveScheduleImpact(
      phases.map(mapPhaseRowToScheduleInput),
      milestones.map(mapMilestoneRowToScheduleInput),
      edit,
      today,
    );
  }, [projectId, phases, milestones, edit]);
}

const UNCOMPUTABLE_FALLBACK =
  "The schedule effect cannot be computed here — this act proposes a date rather than setting one.";

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
      data-schedule-impact={impact.computable ? "computed" : "uncomputable"}
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
