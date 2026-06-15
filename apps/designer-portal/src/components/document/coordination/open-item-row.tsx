'use client';

/**
 * Open-item row — Track 5 (Project Coordination · the ball-in-court).
 * Prototype: `.item` / `.item-type` / `.item-body` / `.item-blocks` / `.item-due`.
 *
 * One open coordination item as a single editorial line: the type chip (mono,
 * 80px, the brand border+tint trio from item-type.ts), the title (Inter body
 * ink), the "this is blocking →" derivation line (with the ⊘ marker), and the
 * mono due read — terracotta-ink when due-soon, aged-oak otherwise. A right
 * chevron signals the row opens its DocSheet. Pure presentational: the row owns
 * no data and no sheet state; clicking calls `onOpen` and the band opens the
 * sheet (band-local React state, D1 — no route change).
 *
 * Depth is value contrast + a 1px hairline bottom edge, never a shadow (D4).
 */

import type { CoordinationItem } from '@patina/supabase';
import type { SectionTask } from '@/hooks/use-section-work';
import { chipStyle, itemTypeToken } from './item-type';
import { blocksText, dueState } from '@/lib/document/coordination-derivation';
import { fmtDay } from '@/lib/document/format';

// ── open-item-row.tsx — a single open item line (type chip, title, blocks, due) ──
export interface OpenItemRowProps {
  item: CoordinationItem;
  /** For blocksText(item, tasks). */
  tasks: SectionTask[];
  onOpen: () => void;
}

export function OpenItemRow({ item, tasks, onOpen }: OpenItemRowProps) {
  const token = itemTypeToken(item.coordination_kind);
  const blocks = blocksText(item, tasks);
  const due = item.due_date;
  const soon = dueState(due) === 'soon';

  // The ⊘ marker (the prototype `.bk`) fronts a real blocking line — but not the
  // "ahead of the work" / blocks-kind-less fallback, which carries no marker.
  const blocked = Boolean(blocks) && blocks!.startsWith('blocks ');

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-[var(--color-pearl)] px-1 py-2.5 text-left transition-colors hover:bg-[rgba(196,165,123,0.04)]"
    >
      {/* type chip — mono, fixed 80px, the brand border+tint+ink trio (D4: a
          1.5px flat border + faint tint, no shadow). */}
      <span
        className="w-20 flex-shrink-0 rounded-[3px] border-[1.5px] px-2 py-[3px] text-center font-mono text-[8px] font-semibold uppercase tracking-[0.07em]"
        style={chipStyle(item.coordination_kind)}
      >
        {token.label}
      </span>

      {/* body — title + the blocking line */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-snug text-[var(--color-charcoal)]">
          {item.title}
        </span>
        {blocks && (
          <span className="mt-[1px] flex items-center gap-1.5 text-[10px] text-[var(--color-aged-oak)]">
            {blocked && (
              <span aria-hidden className="font-mono" style={{ color: '#C4836F' }}>
                ⊘
              </span>
            )}
            <span className="truncate">{blocks}</span>
          </span>
        )}
      </span>

      {/* due read — mono, terracotta ink when due-soon, aged-oak otherwise */}
      {due && (
        <span
          className="flex-shrink-0 whitespace-nowrap text-right font-mono text-[9px] uppercase tracking-[0.04em]"
          style={{ color: soon ? '#C4836F' : 'var(--color-aged-oak)' }}
        >
          {soon ? `due ${fmtDay(due)}` : fmtDay(due)}
        </span>
      )}

      <span aria-hidden className="flex-shrink-0 text-[13px] text-[var(--color-aged-oak)]">
        ›
      </span>
    </button>
  );
}
