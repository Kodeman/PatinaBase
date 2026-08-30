'use client';

/**
 * D-B30 — the letterhead- and section-anchored margin set, extracted from
 * `mobile-margin-chips.tsx`'s old `anchorKind="letterhead"` derivation
 * (:36-86) so the 390 chips block and the new Margin sheet (`mobile-sheets`
 * `'margin'` branch) count and list exactly the same items — one
 * derivation, never two lists that can drift apart. Line-anchored chips
 * (`ffe-section.tsx`'s per-line mount) are a different anchor and keep
 * their own inline filter in `mobile-margin-chips.tsx`.
 */

import { useMemo } from 'react';
import { useMarginItems } from '@/hooks/use-margin-items';
import { useCoordinationItems } from '@patina/supabase';
import {
  classifyMarginItems,
  marginDecisionClassificationState,
  type MarginDecisionClassificationState,
} from '@/lib/document/stage2-approval-exclusions';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { useHandoffGates } from '@/components/document/margin-handoff-item';
import type { WorkflowGate } from '@/lib/document/workflow-gate';

export interface LetterheadMargin {
  /** Non-time items anchored to the letterhead or a section — what the
   *  deleted chips block printed as buttons. */
  items: MarginItemRow[];
  /** Handoff gates — anchored to the document, not a line; the block's
   *  read-only rows. */
  gates: WorkflowGate[];
  decisionState: MarginDecisionClassificationState;
  showDecisionNotice: boolean;
  /** items.length + gates.length — everything the block (and now the door
   *  and the sheet head) count. */
  count: number;
  /** Items whose own state names them overdue, plus overdue gates. */
  overdueCount: number;
}

export function useLetterheadMargin({
  projectId,
  proposalId,
  clientName = '',
}: {
  projectId: string | null;
  proposalId: string | null;
  clientName?: string;
}): LetterheadMargin {
  const { data: items } = useMarginItems(projectId, proposalId);
  const coordinationQuery = useCoordinationItems(projectId);
  const coordinationItems = coordinationQuery.data;

  const anchoredItems = useMemo(
    () =>
      (items ?? []).filter(
        (item) =>
          item.anchor_kind === 'letterhead' || item.anchor_kind === 'section',
      ),
    [items],
  );

  const classificationState = marginDecisionClassificationState({
    projectId,
    coordinationItems,
    isLoading:
      coordinationQuery.isLoading === true ||
      coordinationQuery.isPending === true,
    isError: coordinationQuery.isError === true,
  });

  const classifiedMargin = useMemo(
    () =>
      classifyMarginItems(
        anchoredItems,
        coordinationItems ?? [],
        classificationState,
      ),
    [anchoredItems, classificationState, coordinationItems],
  );

  const items_ = useMemo(
    () => classifiedMargin.items.filter((item) => item.kind !== 'time'),
    [classifiedMargin.items],
  );

  // Handoffs anchor to the document, not to a line, so they ride beside the
  // other letterhead-anchored items (mirrors the old chips block).
  const handoffNow = useMemo(() => new Date(), []);
  const { gates } = useHandoffGates({ projectId, clientName, now: handoffNow });

  const overdueCount = useMemo(
    () =>
      items_.filter((row) => row.state === 'overdue').length +
      gates.filter((gate) => gate.overdue.isOverdue).length,
    [items_, gates],
  );

  return {
    items: items_,
    gates,
    decisionState: classifiedMargin.decisionState,
    showDecisionNotice: classifiedMargin.withheldDecisionCount > 0,
    count: items_.length + gates.length,
    overdueCount,
  };
}
