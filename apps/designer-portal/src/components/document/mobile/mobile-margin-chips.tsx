'use client';

/**
 * Anchored margin chips (D3-2). Margin items render as chips beneath the
 * exact line (or the letterhead) they concern; tapping one raises the full
 * item as a paper sheet. Mobile only — the desktop margin rail owns these
 * above 980px.
 */

import { useMemo } from 'react';
import { useMarginItems } from '@/hooks/use-margin-items';
import { useCoordinationItems } from '@patina/supabase';
import {
  classifyMarginItems,
  marginDecisionClassificationState,
  MarginDecisionClassificationNotice,
} from '@/lib/document/stage2-approval-exclusions';
import { marginAccent, deriveKindLine, type MarginItemRow } from '@/lib/document/margin-derivation';
import { useMobileShell } from './mobile-shell';
import { useHandoffGates } from '../margin-handoff-item';

export function MobileMarginChips({
  projectId,
  proposalId,
  anchorKind,
  anchorId = null,
  clientName = '',
}: {
  projectId: string | null;
  proposalId: string | null;
  /** 'line' chips sit under their FF&E row; 'letterhead' under the title. */
  anchorKind: 'line' | 'letterhead';
  anchorId?: string | null;
  clientName?: string;
}) {
  const { openMarginItem } = useMobileShell();
  const { data: items } = useMarginItems(projectId, proposalId);
  const coordinationQuery = useCoordinationItems(projectId);
  const coordinationItems = coordinationQuery.data;
  const anchoredItems = useMemo(
    () =>
      (items ?? []).filter((item) => {
        if (anchorKind === 'line') {
          return item.anchor_kind === 'line' && item.anchor_id === anchorId;
        }
        return (
          item.anchor_kind === 'letterhead' || item.anchor_kind === 'section'
        );
      }),
    [anchorId, anchorKind, items],
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

  const chips = useMemo(
    () => classifiedMargin.items.filter((item) => item.kind !== 'time'),
    [classifiedMargin.items],
  );
  const showDecisionNotice = classifiedMargin.withheldDecisionCount > 0;
  // Handoffs anchor to the document, not to a line, so they ride the
  // letterhead chips beside the other letterhead-anchored items.
  const handoffNow = useMemo(() => new Date(), []);
  const { gates: handoffGates } = useHandoffGates({
    projectId,
    clientName,
    now: handoffNow,
  });
  const anchoredGates = anchorKind === 'letterhead' ? handoffGates : [];

  if (chips.length === 0 && anchoredGates.length === 0 && !showDecisionNotice)
    return null;

  return (
    // W3-R5 §4 — the 390 header budget is measured net of this block, and
    // D-B27 (the mockup's 390 Margin sheet) will move it; both need a handle.
    <div
      data-mobile-margin-chips
      className="flex flex-wrap gap-1.5 px-[0.15rem] pb-2 min-[980px]:hidden"
    >
      {showDecisionNotice && (
        <MarginDecisionClassificationNotice
          state={classifiedMargin.decisionState}
        />
      )}
      {anchoredGates.map((gate) => (
        <span
          key={gate.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] py-1.5 pl-2 pr-2.5 text-[11px] text-[var(--color-charcoal)]"
          style={{ borderLeft: '2.5px solid var(--color-golden-hour)' }}
        >
          <span className="truncate">
            {gate.lane} · {gate.terms}
          </span>
        </span>
      ))}
      {chips.map((row: MarginItemRow) => {
        const accent = marginAccent(row.kind);
        return (
          <button
            key={`${row.kind}-${row.item_id}`}
            type="button"
            id={row.kind === 'pulse' ? 'document-pulse-control-mobile' : undefined}
            onClick={() => openMarginItem(row.item_id)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] py-1.5 pl-2 pr-2.5 text-[11px] text-[var(--color-charcoal)] active:border-[#cfc8bb]"
            style={{ borderLeft: `2.5px solid ${accent.border}` }}
          >
            <span
              className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.07em]"
              style={{ color: accent.label }}
            >
              {deriveKindLine(row)}
            </span>
            <span className="truncate">{row.title}</span>
          </button>
        );
      })}
    </div>
  );
}
