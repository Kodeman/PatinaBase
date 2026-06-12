'use client';

/**
 * Project / Install section (spec §6, §13 Slice 2): the FF&E table as
 * typographic lines with R2 stamps. Built from the ffe/* kit's canon —
 * useProjectFFEItems (unified query key) + STAGE_CONFIG (R2 label/color
 * source). Read-only; line unfolds arrive in Slice 4.
 */

import { useProjectFFEItems } from '@patina/supabase';
import { MobileMarginChips } from './mobile/mobile-margin-chips';
import { STAGE_CONFIG } from '@/components/portal/ffe/stages';
import type { FFEStageKey } from '@patina/types';
import { useState } from 'react';
import { deriveLineStamp, type LineStamp } from '@/lib/document/stamp-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { Stamp } from './stamp';
import { LineUnfold } from './line-unfold';

/** Warm borders need darker text ink on paper (prototype stamp treatment). */
const STAGE_INK: Partial<Record<FFEStageKey, string>> = {
  approved: '#A8895E',
  production: '#B89A2E',
  shipped: '#B89A2E',
  delivered: '#85947C',
  installed: '#85947C',
};

function stampProps(stamp: LineStamp): { label: string; color: string; ink?: string } {
  switch (stamp.kind) {
    case 'decision_due':
      return {
        label: stamp.dueDate ? `Decision due · ${fmtDay(stamp.dueDate)}` : 'Decision due',
        color: 'var(--color-terracotta)',
        ink: '#C4836F',
      };
    case 'received':
      return { label: 'Received', color: 'var(--color-sage)', ink: '#85947C' };
    case 'partial':
      // R18: the W5-T2 short receipt, surfaced — golden hour like the
      // inspection outcome it derives from.
      return { label: 'Partial', color: 'var(--color-golden-hour)', ink: '#B89A2E' };
    case 'damaged':
      // Item-grain truth only (00196): an open claim attributed to THIS line.
      return { label: 'Damaged', color: 'var(--color-terracotta)', ink: '#C4836F' };
    default: {
      const cfg = STAGE_CONFIG[stamp.kind];
      return { label: cfg.label, color: cfg.color, ink: STAGE_INK[stamp.kind] };
    }
  }
}

const UNDERWAY = new Set(['ordered', 'production', 'shipped', 'delivered', 'received', 'partial', 'installed']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FFERow = any; // row from useProjectFFEItems (untyped hook, view-shaped)

function vendorLine(item: FFERow, stamp: LineStamp): string {
  const parts: string[] = [];
  const maker = item.vendor_name ?? item.product?.brand;
  if (maker) parts.push(maker);
  if (item.room?.name) parts.push(item.room.name);
  if (stamp.kind === 'delivered') parts.push('awaiting inspection');
  else if (
    item.eta &&
    (stamp.kind === 'ordered' || stamp.kind === 'production' || stamp.kind === 'shipped')
  )
    parts.push(`arrives ~${fmtDay(item.eta)}`);
  return parts.join(' · ');
}

export function FFESection({
  projectId,
  projectName = '',
  mode,
  highlightId = null,
  onAddNote = () => {},
}: {
  projectId: string;
  projectName?: string;
  mode: 'project' | 'install';
  /** Line hovered in the margin (§13 Slice 3 anchored highlight). */
  highlightId?: string | null;
  /** Slice 4 (R14): open the margin note composer pre-anchored to a line. */
  onAddNote?: (lineId: string) => void;
}) {
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const { data: items, isLoading } = useProjectFFEItems(projectId) as {
    data: FFERow[] | undefined;
    isLoading: boolean;
  };

  const rows = (items ?? []).map((item) => ({ item, stamp: deriveLineStamp(item) }));
  const total = rows.length;
  const underway = rows.filter((r) => UNDERWAY.has(r.stamp.kind)).length;
  const installed = rows.filter((r) => r.stamp.kind === 'installed').length;

  const meta =
    mode === 'install'
      ? total > 0
        ? `${installed} of ${total} installed`
        : ''
      : total > 0
        ? `${underway} of ${total} underway`
        : '';

  return (
    <section>
      <div className="mb-1.5 mt-5 flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
          {mode === 'install' ? 'Install' : 'Project · FF&E'}
        </h2>
        {meta && (
          <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            {meta}
          </span>
        )}
      </div>

      {isLoading && (
        <p className="py-3 text-[11.5px] italic text-[var(--text-muted)]">Reading the schedule…</p>
      )}

      {!isLoading && total === 0 && (
        <p className="border-t border-[var(--color-pearl)] py-3 text-[11.5px] text-[var(--text-muted)]">
          No FF&E lines yet.
        </p>
      )}

      <ul>
        {rows.map(({ item, stamp }) => {
          const sp = stampProps(stamp);
          const line = vendorLine(item, stamp);
          const unfolded = openLineId === item.id;
          return (
            <li key={item.id} className="border-b border-[var(--color-pearl)]">
              <button
                type="button"
                onClick={() => setOpenLineId(unfolded ? null : item.id)}
                aria-expanded={unfolded}
                className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-2 py-2.5 text-left transition-colors duration-150 ${
                  item.id === highlightId
                    ? 'bg-[rgba(196,165,123,0.08)]'
                    : stamp.kind === 'decision_due'
                      ? 'bg-[rgba(232,197,71,0.05)]'
                      : 'hover:bg-[rgba(196,165,123,0.04)]'
                }`}
              >
                <div>
                  <p className="text-[12.5px] font-medium leading-snug text-[var(--color-charcoal)]">
                    {item.name}
                    {item.quantity > 1 ? ` · ×${item.quantity}` : ''}
                  </p>
                  {line && <p className="mt-px text-[10.5px] text-[var(--text-muted)]">{line}</p>}
                </div>
                <Stamp label={sp.label} color={sp.color} ink={sp.ink} />
                <span className="whitespace-nowrap text-right font-heading text-[13px] font-medium text-[var(--color-charcoal)]">
                  {item.line_total_cents != null ? fmtUsd(item.line_total_cents) : '—'}
                </span>
              </button>
              {/* D13: this line's margin items as chips beneath it (mobile). */}
              <MobileMarginChips
                projectId={projectId}
                proposalId={null}
                anchorKind="line"
                anchorId={item.id}
              />
              {unfolded && (
                <LineUnfold
                  item={item}
                  projectId={projectId}
                  projectName={projectName}
                  onAddNote={onAddNote}
                  onFold={() => setOpenLineId(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
