'use client';

/**
 * Anchored margin chips (D3-2). Margin items render as chips beneath the
 * exact line (or the letterhead) they concern; tapping one raises the full
 * item as a paper sheet. Mobile only — the desktop margin rail owns these
 * above 980px.
 */

import { useMemo } from 'react';
import { useMarginItems } from '@/hooks/use-margin-items';
import { marginAccent, deriveKindLine, type MarginItemRow } from '@/lib/document/margin-derivation';
import { useMobileShell } from './mobile-shell';

export function MobileMarginChips({
  projectId,
  proposalId,
  anchorKind,
  anchorId = null,
}: {
  projectId: string | null;
  proposalId: string | null;
  /** 'line' chips sit under their FF&E row; 'letterhead' under the title. */
  anchorKind: 'line' | 'letterhead';
  anchorId?: string | null;
}) {
  const { openMarginItem } = useMobileShell();
  const { data: items } = useMarginItems(projectId, proposalId);

  const chips = useMemo(
    () =>
      (items ?? []).filter((i) => {
        if (i.kind === 'time') return false;
        if (anchorKind === 'line') return i.anchor_kind === 'line' && i.anchor_id === anchorId;
        // letterhead band also carries section-anchored items (no line home).
        return i.anchor_kind === 'letterhead' || i.anchor_kind === 'section';
      }),
    [items, anchorKind, anchorId],
  );

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-[0.15rem] pb-2 min-[980px]:hidden">
      {chips.map((row: MarginItemRow) => {
        const accent = marginAccent(row.kind);
        return (
          <button
            key={`${row.kind}-${row.item_id}`}
            type="button"
            id={row.kind === 'pulse' ? 'document-pulse-control-mobile' : undefined}
            onClick={() => openMarginItem(row.item_id)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] py-[0.32rem] pl-2 pr-2.5 text-[11px] text-[var(--color-charcoal)] active:border-[#cfc8bb]"
            style={{ borderLeft: `2.5px solid ${accent.border}` }}
          >
            <span
              className="shrink-0 font-mono text-[7.5px] font-semibold uppercase tracking-[0.07em]"
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
