"use client";

/**
 * Proposed anchors, on the spine (R109/R110, I130 · migration 00475).
 *
 * A proposal is what an act that could not state its schedule impact left
 * behind — an operational fact, or a ceremony executed on a screen that had no
 * chain to compute against. It is never an anchor. This block is the ONE
 * designer act that resolves it (I56 "assisted, confirmed, never silent"):
 * commit the date, or dismiss it. The preview is the same pure ripple
 * derivation the confirm strip and the ceremony IMPACT blocks use.
 */

import {
  useCommitScheduleProposal,
  useDismissScheduleProposal,
  useScheduleProposals,
  type ScheduleProposalRow,
} from "@patina/supabase";
import type { ScheduleMilestoneInput, SchedulePhaseInput } from "@patina/utils";
import { deriveScheduleImpact } from "@/lib/document/schedule-impact";
import type { RipplePendingEdit } from "@/lib/document/schedule-ripple-derivation";
import { DocumentAction } from "../document-action";

/** Actor-neutral source labels — the act, never the party (§7 guard, I125). */
const SOURCE_LABEL: Record<string, string> = {
  "design-services-executed": "Design services executed",
  "furnishings-authorization-executed": "Furnishings authorization executed",
  "trade-scope-engaged": "Trade scope engaged",
  "trade-scope-accepted": "Trade scope accepted",
  "po-sent": "Released to maker",
  delivered: "Received",
};

function sourceLabel(sourceEvent: string): string {
  return SOURCE_LABEL[sourceEvent] ?? sourceEvent;
}

export function proposalEdit(row: ScheduleProposalRow): RipplePendingEdit | null {
  if (row.target_phase_id) {
    return {
      kind: "phase-anchor",
      phaseId: row.target_phase_id,
      anchorDate: row.proposed_anchor_date,
    };
  }
  if (row.target_milestone_id) {
    return {
      kind: "milestone-anchor",
      milestoneId: row.target_milestone_id,
      anchorDate: row.proposed_anchor_date,
    };
  }
  return null;
}

export function ScheduleProposals({
  projectId,
  committedPhases,
  committedMilestones,
  today,
}: {
  projectId: string;
  committedPhases: readonly SchedulePhaseInput[];
  committedMilestones: readonly ScheduleMilestoneInput[];
  today: string;
}) {
  const proposals = useScheduleProposals(projectId);
  const commit = useCommitScheduleProposal();
  const dismiss = useDismissScheduleProposal();

  const rows = proposals.data ?? [];
  if (proposals.isError || rows.length === 0) return null;

  return (
    <div className="mt-4" data-schedule-proposals aria-label="Proposed anchors">
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Proposed
      </p>
      <ul className="mt-2 flex flex-col gap-3">
        {rows.map((row) => {
          const edit = proposalEdit(row);
          const impact = deriveScheduleImpact(
            committedPhases,
            committedMilestones,
            edit,
            today,
          );
          return (
            <li
              key={row.id}
              data-proposal-id={row.id}
              className="border-l-[3px] border-[var(--color-clay)] bg-[rgba(229,221,208,0.28)] px-3 py-2.5"
            >
              <p className="text-[12.5px] leading-relaxed text-[var(--color-charcoal)]">
                {sourceLabel(row.source_event)} — proposes {row.proposed_anchor_date}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                {impact.computable ? impact.sentence : impact.line}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <DocumentAction
                  actionKey="commit-schedule-proposal"
                  surfaceKey="open-document"
                  regionKey="schedule-proposals"
                  variant="primary"
                  disabled={!edit || commit.isPending}
                  onClick={() => {
                    if (!edit) return;
                    void commit.mutateAsync({
                      proposalId: row.id,
                      projectId,
                      edit,
                      reason: `${sourceLabel(row.source_event)} — proposed anchor committed`,
                    });
                  }}
                >
                  Commit the date
                </DocumentAction>
                <DocumentAction
                  actionKey="dismiss-schedule-proposal"
                  surfaceKey="open-document"
                  regionKey="schedule-proposals"
                  variant="secondary"
                  disabled={dismiss.isPending}
                  onClick={() => {
                    void dismiss.mutateAsync({ proposalId: row.id, projectId });
                  }}
                >
                  Dismiss
                </DocumentAction>
              </div>
              {!edit && (
                <p className="mt-2 text-[11.5px] text-[var(--text-muted)]">
                  No phase on this project carries the date, so there is nothing to
                  commit it onto.
                </p>
              )}
              {(commit.isError || dismiss.isError) && (
                <p
                  role="status"
                  className="mt-2 text-[11.5px] text-[var(--color-terracotta)]"
                >
                  That did not save — nothing was changed.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
