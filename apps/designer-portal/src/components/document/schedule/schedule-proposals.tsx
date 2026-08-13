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

import { useState } from "react";
import {
  useCommitScheduleProposal,
  useDismissScheduleProposal,
  useScheduleProposals,
  type ScheduleProposalRow,
} from "@patina/supabase";
import type { ScheduleMilestoneInput, SchedulePhaseInput } from "@patina/utils";
import { scheduleEvents } from "@/lib/analytics/schedule-events";
import { formatCalendarDate } from "@/lib/document/format";
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
  "install-window-confirmed": "Install window confirmed",
  "install-window-released": "Install window released",
};

function sourceLabel(sourceEvent: string): string {
  return SOURCE_LABEL[sourceEvent] ?? sourceEvent;
}

/** A proposal only ever names an anchor — never a duration or an offset. */
type ProposalAnchorEdit = Extract<
  RipplePendingEdit,
  { kind: 'phase-anchor' } | { kind: 'milestone-anchor' }
>;

export function proposalEdit(row: ScheduleProposalRow): ProposalAnchorEdit | null {
  // A dateless row is a proposed UNPIN (R112's release, 00476/I126): the
  // ripple's edit vocabulary has no unpin shape, so such a row is dismissible
  // but never committable — the same posture as a targetless one.
  if (!row.proposed_anchor_date) return null;
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
  // One mutation pair serves the list, so the in-flight/failed row is tracked
  // explicitly — otherwise one failure paints an error under every proposal.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  const rows = proposals.data ?? [];
  if (proposals.isError || rows.length === 0) return null;

  const run = async (id: string, act: () => Promise<unknown>) => {
    setBusyId(id);
    setFailedId(null);
    try {
      await act();
    } catch {
      setFailedId(id);
    } finally {
      setBusyId(null);
    }
  };

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
          // R109's third class: a contradiction reports. It is never offered as
          // a date to commit, and it borrows the conflict register, not a
          // fourth rendering of its own.
          const contradicts = row.conflicts_with_committed === true;
          const busy = busyId === row.id;
          const committedDate =
            typeof row.disclosed_context === 'object' &&
            row.disclosed_context !== null &&
            'committedAnchorDate' in row.disclosed_context
              ? String(
                  (row.disclosed_context as Record<string, unknown>)
                    .committedAnchorDate,
                )
              : null;
          return (
            <li
              key={row.id}
              data-proposal-id={row.id}
              data-proposal-contradiction={contradicts ? 'true' : undefined}
              className="border-l-[3px] bg-[rgba(229,221,208,0.28)] px-3 py-2.5"
              style={{
                borderLeftColor: contradicts
                  ? 'var(--color-terracotta)'
                  : 'var(--color-clay)',
              }}
            >
              <p className="text-[12.5px] leading-relaxed text-[var(--color-charcoal)]">
                {sourceLabel(row.source_event)}
                {row.proposed_anchor_date
                  ? ` — proposes ${formatCalendarDate(row.proposed_anchor_date)}`
                  : ' — proposes releasing the anchor'}
              </p>
              {contradicts ? (
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-terracotta)]">
                  {committedDate
                    ? `This contradicts the anchor committed for ${formatCalendarDate(committedDate)}. Nothing moved.`
                    : 'This contradicts an anchor already committed. Nothing moved.'}
                </p>
              ) : row.proposed_anchor_date ? (
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                  {impact.computable ? impact.sentence : impact.line}
                </p>
              ) : null}
              {/* A dateless row proposes a REMOVAL. deriveScheduleImpact has
                  no question to answer there, and its generic downgrade line
                  ("this act proposes a date rather than setting one") is false
                  twice over — the line below the actions carries the meaning. */}
              <div className="mt-2 flex flex-wrap gap-2">
                {!contradicts && (
                  <DocumentAction
                    actionKey="commit-schedule-proposal"
                    surfaceKey="open-document"
                    regionKey="schedule-proposals"
                    variant="primary"
                    disabled={!edit || busy}
                    onClick={() => {
                      if (!edit) return;
                      void run(row.id, async () => {
                        await commit.mutateAsync({
                          proposalId: row.id,
                          projectId,
                          edit,
                          reason: `${sourceLabel(row.source_event)} — proposed anchor committed`,
                        });
                        scheduleEvents.scheduleProposalResolved({
                          project_id: projectId,
                          source_event: row.source_event,
                          resolution: 'committed',
                          edit_kind: edit.kind,
                        });
                      });
                    }}
                  >
                    Commit the date
                  </DocumentAction>
                )}
                <DocumentAction
                  actionKey="dismiss-schedule-proposal"
                  surfaceKey="open-document"
                  regionKey="schedule-proposals"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    void run(row.id, async () => {
                      await dismiss.mutateAsync({ proposalId: row.id, projectId });
                      scheduleEvents.scheduleProposalResolved({
                        project_id: projectId,
                        source_event: row.source_event,
                        resolution: 'dismissed',
                        edit_kind: edit?.kind ?? null,
                      });
                    });
                  }}
                >
                  Dismiss
                </DocumentAction>
              </div>
              {!edit && !contradicts && (
                <p className="mt-2 text-[11.5px] text-[var(--text-muted)]">
                  {row.proposed_anchor_date
                    ? "No phase on this project carries the date, so there is nothing to commit it onto."
                    : "Removing an anchor is not a date this block can commit — unpin it on the phase itself."}
                </p>
              )}
              {failedId === row.id && (
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
