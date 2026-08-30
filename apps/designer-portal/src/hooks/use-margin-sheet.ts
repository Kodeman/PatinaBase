'use client';

/**
 * D-B30 / W5-R1 — the margin, derived once for the mobile bar's door and the
 * 390 Margin sheet.
 *
 * `useMarginSheet` is the whole margin (every anchor kind), grouped exactly
 * as the desktop rail groups it (`margin-rail.tsx`'s `anchorGroups`,
 * `marginAnchorRegion`/`marginRegionName` from `margin-item.tsx`): "THE
 * WHOLE JOB" (letterhead/section-anchored) and one "BESIDE <region>" group
 * per paper region with a line-anchored member — the sheet prints WHOLE JOB
 * first (the rail prints it last; W5-R1 reverses the print order, not the
 * grouping mechanic). A line-anchored row also carries its line's own label
 * (room · item name) so a row lifted into a bottom sheet still says what it
 * sits beside.
 *
 * D-B45 — `useLetterheadMargin` and `MobileMarginChips` are DELETED. The chips
 * were mobile-only from the start (the component's own docstring: "the desktop
 * margin rail owns these above 980px", `min-[980px]:hidden` since `1b93def1a`),
 * so "they stay >=980" was a misreading: they never printed at desktop widths,
 * and printing them there would double every line item beside the rail. Below
 * 980 this sheet carries the whole margin, line-anchored rows included. One
 * derivation, one surface.
 */

import { useMemo } from 'react';
import { useMarginItems } from '@/hooks/use-margin-items';
import { useCoordinationItems, useProjectFFEItems } from '@patina/supabase';
import {
  classifyMarginItems,
  marginDecisionClassificationState,
  type MarginDecisionClassificationState,
} from '@/lib/document/stage2-approval-exclusions';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { marginAnchorRegion, marginRegionName } from '@/components/document/margin-item';
import {
  PROJECT_PAPER_ORDER,
  type DocumentIndexKey,
} from '@/lib/document/document-index';
import { useHandoffGates } from '@/components/document/margin-handoff-item';
import type { WorkflowGate } from '@/lib/document/workflow-gate';

export interface MarginSheetRow {
  row: MarginItemRow;
  /** Set only for a line-anchored row: "<Room> · <FF&E line name>" (falls
   *  back to whichever half is known, null if neither resolved yet). */
  lineLabel: string | null;
}

export interface MarginSheetGroup {
  /** null = "the whole job"; a DocumentIndexKey names a "beside <region>"
   *  group (only ever 'ffe' today — `marginAnchorRegion` never yields
   *  another region). */
  key: DocumentIndexKey | null;
  heading: string;
  rows: MarginSheetRow[];
}

export interface MarginSheet {
  /** "THE WHOLE JOB" first (W5-R1's print order), then one "BESIDE <region>"
   *  group per paper region with a member, in `PROJECT_PAPER_ORDER`. Empty
   *  groups never print (mirrors the rail). */
  groups: MarginSheetGroup[];
  gates: WorkflowGate[];
  decisionState: MarginDecisionClassificationState;
  showDecisionNotice: boolean;
  /** Every item across every group, plus gates — what the door and the head
   *  count (W5-R1: "Margin · 7" on `…d5`). */
  count: number;
  /** Overdue DECISIONS only — money is never counted (W5-R1). */
  overdueCount: number;
}

export function useMarginSheet({
  projectId,
  proposalId,
  clientName = '',
}: {
  projectId: string | null;
  proposalId: string | null;
  clientName?: string;
}): MarginSheet {
  const { data: items } = useMarginItems(projectId, proposalId);
  const coordinationQuery = useCoordinationItems(projectId);
  const coordinationItems = coordinationQuery.data;

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
      classifyMarginItems(items ?? [], coordinationItems ?? [], classificationState),
    [classificationState, coordinationItems, items],
  );

  // The whole margin, every anchor kind — W5-R1 supersedes D-B30's
  // letterhead-only scope.
  const allItems = useMemo(
    () => classifiedMargin.items.filter((item) => item.kind !== 'time'),
    [classifiedMargin.items],
  );

  // A line-anchored row's second line names its FF&E line (room · name),
  // the same embed margin-rail.tsx already fetches for its line-rank sort.
  const { data: ffeItems } = useProjectFFEItems(projectId ?? '');
  const lineById = useMemo(() => {
    const map = new Map<string, { name: string; room: string | null }>();
    for (const it of (ffeItems ?? []) as Array<{
      id: string;
      name: string;
      room?: { name?: string | null } | null;
    }>) {
      map.set(it.id, { name: it.name, room: it.room?.name ?? null });
    }
    return map;
  }, [ffeItems]);

  const groups = useMemo(() => {
    const byKey = new Map<DocumentIndexKey | null, MarginSheetRow[]>();
    for (const row of allItems) {
      const key = marginAnchorRegion(row);
      const line = row.anchor_id ? lineById.get(row.anchor_id) : undefined;
      const lineLabel =
        key && line ? [line.room, line.name].filter(Boolean).join(' · ') : null;
      const entry: MarginSheetRow = { row, lineLabel };
      const bucket = byKey.get(key);
      if (bucket) bucket.push(entry);
      else byKey.set(key, [entry]);
    }

    const ordered: MarginSheetGroup[] = [];
    const wholeJob = byKey.get(null);
    if (wholeJob?.length) {
      ordered.push({ key: null, heading: 'THE WHOLE JOB', rows: wholeJob });
    }
    for (const region of PROJECT_PAPER_ORDER) {
      const rows = byKey.get(region.key);
      if (rows?.length) {
        ordered.push({
          key: region.key,
          heading: `BESIDE ${marginRegionName(region.key)}`,
          rows,
        });
      }
    }
    return ordered;
  }, [allItems, lineById]);

  const handoffNow = useMemo(() => new Date(), []);
  const { gates } = useHandoffGates({ projectId, clientName, now: handoffNow });

  const overdueCount = useMemo(
    () =>
      allItems.filter((row) => row.state === 'overdue').length +
      gates.filter((gate) => gate.overdue.isOverdue).length,
    [allItems, gates],
  );

  return {
    groups,
    gates,
    decisionState: classifiedMargin.decisionState,
    showDecisionNotice: classifiedMargin.withheldDecisionCount > 0,
    count: allItems.length + gates.length,
    overdueCount,
  };
}
