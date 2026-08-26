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

import type { CoordinationItem, Court } from '@patina/supabase';
import type { SectionTask } from '@/hooks/use-section-work';
import { chipStyle, itemTypeToken } from './item-type';
import { partyFor, type PartyLike } from './party';
import { blocksText, dueState } from '@/lib/document/coordination-derivation';
import { fmtDay, todayYmd } from '@/lib/document/format';

// ── open-item-row.tsx — a single open item line (type chip, title, blocks, due) ──
export interface OpenItemRowProps {
  item: CoordinationItem;
  /** For blocksText(item, tasks). */
  tasks: SectionTask[];
  onOpen: () => void;
  /** Ball-in-court read, inline (the Schedule Spine's phase rows carry it —
   *  prototype `Ball: you` / `Ball: sub`). Omitted by the court groups, whose
   *  section heads already name the court; when absent the row renders exactly
   *  as before. Resolution mirrors court-group: a concrete party row wins,
   *  else the generic court token / the client's name (partyFor). */
  court?: { court: Court; party?: PartyLike | null; clientName?: string };
}

export function OpenItemRow({ item, tasks, onOpen, court }: OpenItemRowProps) {
  const token = itemTypeToken(item.coordination_kind);
  const blocks = blocksText(item, tasks);
  const due = item.due_date;
  const soon = dueState(due) === 'soon';

  // The ⊘ marker (the prototype `.bk`) fronts a real blocking line — but not the
  // "ahead of the work" / blocks-kind-less fallback, which carries no marker.
  const blocked = Boolean(blocks) && blocks!.startsWith('blocks ');

  // The ball-in-court chip (only when the host passes `court`): terracotta ink
  // when the row is blocking AND past due — the ball someone is sitting on.
  const courtToken = court
    ? partyFor(court.court, { party: court.party, clientName: court.clientName })
    : null;
  const courtLate = blocked && due != null && due < todayYmd();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-pearl)] px-1 py-2.5 text-left transition-colors hover:bg-[rgba(196,165,123,0.04)]"
    >
      {/* type chip + title/blocking, grouped with a readable floor width —
          on a crowded/narrow row the trailing meta group wraps to a second
          line instead of squeezing this group (and so the title) toward
          zero (wrapping is fine, clipping is not). */}
      <span className="flex min-w-[9rem] flex-1 items-center gap-3">
        {/* type chip — mono, fixed 80px, the brand border+tint+ink trio (D4:
            a 1.5px flat border + faint tint, no shadow). */}
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
                <span aria-hidden className="font-mono" style={{ color: 'var(--color-terracotta-ink)' }}>
                  ⊘
                </span>
              )}
              <span className="truncate">{blocks}</span>
            </span>
          )}
        </span>
      </span>

      {/* ball-in-court chip + due read + chevron — a second group so it can
          wrap below the title group as a unit rather than each shrinking
          independently. */}
      <span className="ml-auto flex flex-shrink-0 items-center gap-3">
        {/* ball-in-court chip — dot + mono label (Spine rows only; absent
            when `court` isn't passed) */}
        {courtToken && (
          <span
            className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.04em]"
            style={{ color: courtLate ? 'var(--color-terracotta-ink)' : 'var(--color-aged-oak)' }}
          >
            <span
              aria-hidden
              className="inline-block h-[6px] w-[6px] rounded-full"
              style={{ background: courtToken.dotColor }}
            />
            Ball: {court!.court === 'designer' ? 'you' : courtToken.label}
          </span>
        )}

        {/* due read — mono, terracotta ink when due-soon, aged-oak otherwise */}
        {due && (
          <span
            className="flex-shrink-0 whitespace-nowrap text-right font-mono text-[9px] uppercase tracking-[0.04em]"
            style={{ color: soon ? 'var(--color-terracotta-ink)' : 'var(--color-aged-oak)' }}
          >
            {soon ? `due ${fmtDay(due)}` : fmtDay(due)}
          </span>
        )}

        <span aria-hidden className="flex-shrink-0 text-[13px] text-[var(--color-aged-oak)]">
          ›
        </span>
      </span>
    </button>
  );
}
