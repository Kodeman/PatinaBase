"use client";

/**
 * The project-wide phase handoff. The schedule can render as either the
 * legacy timeline or the gated Rule/Spine, so advancement lives beside that
 * shared mount instead of inside either renderer.
 *
 * This is deliberately a narrow state machine. A designer may complete the
 * one in-progress phase, or resume the one delayed current phase. Pending
 * phases cannot be skipped into and completed phases never move backwards.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateProjectPhaseStatus, type Database } from "@patina/supabase";
import { DocumentAction, DocumentActionGroup } from "./document-action";

type PhaseRow = Database["public"]["Tables"]["project_phases"]["Row"];

type ReadyHandoff = {
  kind: "complete_phase" | "resume_phase";
  phase: PhaseRow;
  next: PhaseRow | null;
};

export type PhaseHandoffState =
  | ReadyHandoff
  | { kind: "all_complete" }
  | { kind: "empty" }
  | { kind: "blocked"; message: string };

/**
 * Legal trunk shape: completed* → one in_progress|delayed → pending*.
 * Anything else is refused rather than guessing which phase owns the work.
 */
export function derivePhaseHandoff(
  rows: readonly PhaseRow[],
): PhaseHandoffState {
  const phases = [...rows].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  if (phases.length === 0) return { kind: "empty" };
  if (phases.every((phase) => phase.status === "completed")) {
    return { kind: "all_complete" };
  }

  const inProgress = phases.filter((phase) => phase.status === "in_progress");
  if (inProgress.length > 1) {
    return {
      kind: "blocked",
      message:
        "More than one phase is in progress. Settle the duplicate status before advancing.",
    };
  }

  if (inProgress.length === 0) {
    const firstUnfinishedIndex = phases.findIndex(
      (phase) => phase.status !== "completed",
    );
    const current = phases[firstUnfinishedIndex];
    const before = phases.slice(0, firstUnfinishedIndex);
    const after = phases.slice(firstUnfinishedIndex + 1);

    if (
      current?.status === "delayed" &&
      before.every((phase) => phase.status === "completed") &&
      after.every((phase) => phase.status === "pending")
    ) {
      return {
        kind: "resume_phase",
        phase: current,
        next: after[0] ?? null,
      };
    }

    return {
      kind: "blocked",
      message:
        "No phase is in progress. Restore the current phase before advancing.",
    };
  }

  const current = inProgress[0];
  const currentIndex = phases.findIndex((phase) => phase.id === current.id);
  const before = phases.slice(0, currentIndex);
  const after = phases.slice(currentIndex + 1);

  if (!before.every((phase) => phase.status === "completed")) {
    return {
      kind: "blocked",
      message: `${current.name} cannot advance while an earlier phase is unfinished.`,
    };
  }

  if (!after.every((phase) => phase.status === "pending")) {
    return {
      kind: "blocked",
      message: `${current.name} cannot advance because later phase statuses are out of order.`,
    };
  }

  return {
    kind: "complete_phase",
    phase: current,
    next: after[0] ?? null,
  };
}

const shellCls =
  "mb-5 border-y border-[var(--color-pearl)] py-3 text-[var(--color-charcoal)]";

export function PhaseAdvanceControl({
  projectId,
  phases,
}: {
  projectId: string;
  phases: readonly PhaseRow[] | undefined;
}) {
  const headingId = useId();
  const descriptionId = useId();
  const queryClient = useQueryClient();
  const updatePhase = useUpdateProjectPhaseStatus();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFeedback(null);
    setError(null);
  }, [projectId]);

  const handoff = useMemo(
    () => (phases ? derivePhaseHandoff(phases) : null),
    [phases],
  );

  if (handoff == null) {
    return (
      <section aria-label="Phase handoff" aria-busy className={shellCls}>
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Reading the phase handoff…
        </p>
      </section>
    );
  }

  if (handoff.kind === "empty") {
    return (
      <section aria-label="Phase handoff" className={shellCls}>
        <p role="status" className="text-[12px] text-[var(--text-muted)]">
          No project phases are available to advance.
        </p>
      </section>
    );
  }

  if (handoff.kind === "all_complete") {
    return (
      <section aria-label="Phase handoff" className={shellCls}>
        <p role="status" className="text-[12px] text-[var(--color-sage)]">
          Every project phase is complete. Close the book when the accounts and
          checklist are settled.
        </p>
      </section>
    );
  }

  if (handoff.kind === "blocked") {
    return (
      <section aria-label="Phase handoff" className={shellCls}>
        <p role="alert" className="text-[12px] text-[var(--color-terracotta)]">
          <b>Phase handoff paused.</b> {handoff.message}
        </p>
      </section>
    );
  }

  const completing = handoff.kind === "complete_phase";
  const actionLabel = completing
    ? `Complete ${handoff.phase.name}${handoff.next ? ` and begin ${handoff.next.name}` : ""}`
    : `Resume ${handoff.phase.name}`;

  const handleHandoff = () => {
    setFeedback(null);
    setError(null);

    updatePhase.mutate(
      {
        phaseId: handoff.phase.id,
        projectId,
        status: completing ? "completed" : "in_progress",
        ...(completing ? { progress: 100 } : {}),
      },
      {
        onSuccess: () => {
          setFeedback(
            completing
              ? handoff.next
                ? `${handoff.phase.name} is complete. ${handoff.next.name} is now in progress.`
                : `${handoff.phase.name} is complete. Every project phase is settled.`
              : `${handoff.phase.name} is back in progress.`,
          );
          void queryClient.invalidateQueries({ queryKey: ["document-state"] });
          void queryClient.invalidateQueries({
            queryKey: ["desk-engagements"],
          });
        },
        onError: () => {
          setError(
            "The phase handoff did not finish. Review the schedule and try again.",
          );
          // The underlying hook coordinates phase + project rows. Refresh every
          // reader even on failure so a partial remote write is never hidden.
          void queryClient.invalidateQueries({
            queryKey: ["project-phases", projectId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["project-v2", projectId],
          });
          void queryClient.invalidateQueries({ queryKey: ["document-state"] });
        },
      },
    );
  };

  return (
    <section aria-labelledby={headingId} className={shellCls}>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h3
            id={headingId}
            className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
          >
            Phase handoff
          </h3>
          <p id={descriptionId} className="mt-1 text-[12px] leading-relaxed">
            <b>{handoff.phase.name}</b>{" "}
            {completing ? "is in progress." : "is delayed."}
            {handoff.next ? (
              <span className="text-[var(--text-muted)]">
                {" "}
                Next · {handoff.next.name}
              </span>
            ) : null}
          </p>
        </div>

        <DocumentActionGroup
          surfaceKey="open-document"
          regionKey="phase-handoff"
          aria-label="Phase handoff actions"
          className="shrink-0"
        >
          <DocumentAction
            actionKey={
              completing ? "complete-project-phase" : "resume-project-phase"
            }
            variant="primary"
            aria-label={actionLabel}
            aria-describedby={descriptionId}
            loading={updatePhase.isPending}
            loadingLabel={completing ? "Advancing…" : "Resuming…"}
            onClick={handleHandoff}
          >
            {completing ? "Complete phase" : "Resume phase"}
          </DocumentAction>
        </DocumentActionGroup>
      </div>

      {updatePhase.isPending ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-[11px] text-[var(--text-muted)]"
        >
          {completing
            ? handoff.next
              ? `Completing ${handoff.phase.name} and beginning ${handoff.next.name}…`
              : `Completing ${handoff.phase.name}…`
            : `Resuming ${handoff.phase.name}…`}
        </p>
      ) : null}
      {feedback ? (
        <p role="status" className="mt-2 text-[11px] text-[var(--color-sage)]">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-2 text-[11px] text-[var(--color-terracotta)]"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
