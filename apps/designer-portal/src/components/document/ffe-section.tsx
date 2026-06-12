'use client';

/**
 * Project / Install section (spec §6, §13 Slice 2): the FF&E table as
 * typographic lines with R2 stamps. Built from the ffe/* kit's canon —
 * useProjectFFEItems (unified query key) + STAGE_CONFIG (R2 label/color
 * source). Read-only; line unfolds arrive in Slice 4.
 */

import { useProjectFFEItems } from '@patina/supabase';
import { STAGE_CONFIG } from '@/components/portal/ffe/stages';
import type { FFEStageKey } from '@patina/types';
import { deriveLineStamp, type LineStamp } from '@/lib/document/stamp-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { Stamp } from './stamp';

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
    case 'damaged':
      // Item-grain truth only (00193): an open claim attributed to THIS line.
      return { label: 'Damaged', color: 'var(--color-terracotta)', ink: '#C4836F' };
    default: {
      const cfg = STAGE_CONFIG[stamp.kind];
      return { label: cfg.label, color: cfg.color, ink: STAGE_INK[stamp.kind] };
    }
  }
}

const UNDERWAY = new Set(['ordered', 'production', 'shipped', 'delivered', 'received', 'installed']);

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
  mode,
  highlightId = null,
}: {
  projectId: string;
  mode: 'project' | 'install';
  /** Line hovered in the margin (§13 Slice 3 anchored highlight). */
  highlightId?: string | null;
}) {
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
          return (
            <li
              key={item.id}
              className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[var(--color-pearl)] px-2 py-2.5 transition-colors duration-150 ${
                item.id === highlightId
                  ? 'bg-[rgba(196,165,123,0.08)]'
                  : stamp.kind === 'decision_due'
                    ? 'bg-[rgba(232,197,71,0.05)]'
                    : ''
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
