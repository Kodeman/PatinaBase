"use client";

import { useMemo } from "react";
import { useProjectWorkflow, useResolvedSchedule } from "@patina/supabase";
import {
  phaseFidelity,
  positionText,
  selectActivePhase,
  type Fidelity,
  type PhaseStatus,
  type ScheduleSelection,
} from "@patina/utils";

import { SectionStageLine } from "./workflow/section-stage-line";
import type { SectionKey } from "@/lib/document/desk-derivation";
import {
  deriveSectionWorkflowStageDocument,
  deriveWorkflowStageDocument,
} from "@/lib/document/workflow-stage-derivation";
import { deriveSectionStageLine } from "@/lib/document/section-stage-line";

const NO_SELECTION: ScheduleSelection = { activePhaseId: null, reason: "none" };

export interface SectionStageLineMountProps {
  projectId: string | null;
  activeSection: SectionKey;
}

export function SectionStageLineMount({
  projectId,
  activeSection,
}: SectionStageLineMountProps) {
  const workflow = useProjectWorkflow(projectId);
  const schedule = useResolvedSchedule(projectId ?? undefined);

  const resolverFacts = useMemo<{
    selection: ScheduleSelection;
    fidelity: Fidelity | null;
    position: string | null;
  }>(() => {
    const resolved = schedule.resolved;
    // No schedule to read (a section-mode Document, or still loading): no
    // selection, no register — the classifier falls back to canonical track
    // order and claims no position.
    if (!resolved) {
      return { selection: NO_SELECTION, fidelity: null, position: null };
    }
    const statuses = new Map<string, PhaseStatus>(
      schedule.phases.map((p) => [p.id, (p.status ?? "pending") as PhaseStatus]),
    );
    const sortOrders = new Map<string, number>(
      schedule.phases.map((p) => [p.id, p.sort_order ?? 0]),
    );
    const today = new Date().toISOString().slice(0, 10);
    const selection = selectActivePhase(resolved, statuses, today, sortOrders);
    const active = resolved.phases.find((p) => p.id === selection.activePhaseId) ?? null;
    return {
      selection,
      fidelity: active ? phaseFidelity(active, statuses.get(active.id) ?? "pending") : "band",
      position: positionText(resolved, selection, today),
    };
  }, [schedule.resolved, schedule.phases]);

  const model = useMemo(
    () =>
      deriveSectionStageLine(
        projectId
          ? deriveWorkflowStageDocument(workflow.data ?? [])
          : deriveSectionWorkflowStageDocument(activeSection),
        resolverFacts.selection,
        resolverFacts.fidelity,
        resolverFacts.position,
      ),
    [activeSection, projectId, workflow.data, resolverFacts],
  );

  // The schedule query joins the loading gate so no half-derived label flashes
  // — a stage named before its position resolves would be the same lie in a
  // slower form.
  if (projectId && (workflow.isLoading || schedule.isLoading)) {
    return (
      <section
        aria-label="Workflow stage"
        aria-busy="true"
        data-workflow-document
        data-section-stage-line
        className="mb-1 min-w-0"
      >
        <p className="font-mono text-[12px] uppercase tracking-[0.09em] text-[var(--text-muted)]">
          Reading project workflow…
        </p>
      </section>
    );
  }

  if (projectId && workflow.isError) {
    return (
      <section
        aria-label="Workflow stage"
        data-workflow-document
        data-section-stage-line
        className="mb-1 min-w-0"
      >
        <p
          role="status"
          className="font-mono text-[12px] uppercase tracking-[0.09em] text-[var(--text-muted)]"
        >
          Stage position unavailable · the schedule itself is unchanged
        </p>
      </section>
    );
  }

  return (
    <SectionStageLine
      model={model}
      fidelity={projectId ? resolverFacts.fidelity : null}
    />
  );
}
