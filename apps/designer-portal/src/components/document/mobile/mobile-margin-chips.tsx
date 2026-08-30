'use client';

/**
 * Anchored margin chips (D3-2). Margin items render as chips beneath the
 * exact line (or the letterhead) they concern; tapping one raises the full
 * item as a paper sheet. Mobile only — the desktop margin rail owns these
 * above 980px.
 *
 * D-B30: the letterhead branch reads `useLetterheadMargin` (`use-margin-
 * sheet.ts`) — kept for a >=980 (desktop) caller; it is unmounted in
 * product below 1180 (`page.tsx` deleted the call site — the Margin sheet
 * is the 390 door now).
 *
 * W5-R1: the LINE branch retires below 980 too — the Margin sheet now
 * carries the whole margin, line-anchored items included, grouped "BESIDE
 * <region>", so a chip under the same FF&E line would print it twice.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMarginItems } from '@/hooks/use-margin-items';
import { useCoordinationItems } from '@patina/supabase';
import {
  classifyMarginItems,
  marginDecisionClassificationState,
  MarginDecisionClassificationNotice,
} from '@/lib/document/stage2-approval-exclusions';
import { marginAccent, deriveKindLine, type MarginItemRow } from '@/lib/document/margin-derivation';
import { useLetterheadMargin } from '@/hooks/use-margin-sheet';
import { useMobileShell } from './mobile-shell';

/** W5-R1 — below 980 the Margin sheet already carries every line-anchored
 *  item (grouped "BESIDE <region>"); a chip under the same line would be the
 *  same item printed twice. `matches: false` by default (jest's global
 *  matchMedia stub, jest.setup.js) reads as "not narrow", so a test opts in
 *  by stubbing the query explicitly — see mobile-margin-chips.test.tsx. */
function useBelow980(): boolean {
  const [below, setBelow] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(max-width: 979px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 979px)');
    setBelow(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setBelow(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return below;
}

interface MobileMarginChipsProps {
  projectId: string | null;
  proposalId: string | null;
  /** 'line' chips sit under their FF&E row; 'letterhead' under the title. */
  anchorKind: 'line' | 'letterhead';
  anchorId?: string | null;
  clientName?: string;
}

export function MobileMarginChips(props: MobileMarginChipsProps) {
  return props.anchorKind === 'letterhead' ? (
    <LetterheadMarginChips {...props} />
  ) : (
    <LineMarginChips {...props} />
  );
}

function LetterheadMarginChips({
  projectId,
  proposalId,
  clientName = '',
}: MobileMarginChipsProps) {
  const { openMarginItem } = useMobileShell();
  const margin = useLetterheadMargin({ projectId, proposalId, clientName });

  if (
    margin.items.length === 0 &&
    margin.gates.length === 0 &&
    !margin.showDecisionNotice
  )
    return null;

  return (
    <div
      data-mobile-margin-chips="letterhead"
      className="flex flex-wrap gap-1.5 px-[0.15rem] pb-2 min-[980px]:hidden"
    >
      {margin.showDecisionNotice && (
        <MarginDecisionClassificationNotice state={margin.decisionState} />
      )}
      {margin.gates.map((gate) => (
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
      {margin.items.map((row: MarginItemRow) => {
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

function LineMarginChips({
  projectId,
  proposalId,
  anchorId = null,
}: MobileMarginChipsProps) {
  const { openMarginItem } = useMobileShell();
  const below980 = useBelow980();
  const { data: items } = useMarginItems(projectId, proposalId);
  const coordinationQuery = useCoordinationItems(projectId);
  const coordinationItems = coordinationQuery.data;
  const anchoredItems = useMemo(
    () =>
      (items ?? []).filter(
        (item) => item.anchor_kind === 'line' && item.anchor_id === anchorId,
      ),
    [anchorId, items],
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

  // W5-R1: the Margin sheet already carries every line-anchored item below
  // 980 (grouped "BESIDE <region>"); the chip would be the same item twice.
  if (below980) return null;
  if (chips.length === 0 && !showDecisionNotice) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-[0.15rem] pb-2 min-[980px]:hidden">
      {showDecisionNotice && (
        <MarginDecisionClassificationNotice
          state={classifiedMargin.decisionState}
        />
      )}
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
