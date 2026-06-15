'use client';

/**
 * Court group — Track 5 (Project Coordination · the ball-in-court).
 * Prototype: `.court-group` / `.cg-head` / `.cg-name` / `.cg-meta` + the rule.
 *
 * One court's open items: a head (party dot + Playfair-italic court name +
 * mono meta — "N need your move" for the designer's own court, "N open" for
 * the others), the canonical StrataMiniRule separator (the repo's two-line
 * clay rule — the prototype's 3-line strata-rule maps to it per ruling), then
 * the open-item rows. The party name resolves a concrete project_parties row
 * (the named GC / vendor) when one is attached, else the generic court token
 * (R46). The group carries a scroll anchor id so the court bar can jump to it.
 *
 * Pure presentational: the caller pre-filters to THIS court's open items via
 * groupByCourt; the group renders + forwards onOpenItem. No data, no sheets.
 * Depth is value contrast + the hairline row edges, never a shadow (D4).
 */

import type { Court, CoordinationItem, ProjectParty } from '@patina/supabase';
import type { SectionTask } from '@/hooks/use-section-work';
import { StrataMiniRule } from '../strata-mini-rule';
import { partyFor } from './party';
import { OpenItemRow } from './open-item-row';

// ── court-group.tsx — one court's open items (head + StrataMiniRule + rows) ──
export interface CourtGroupProps {
  court: Court;
  /** Already filtered to THIS court's OPEN items (caller groups via groupByCourt). */
  items: CoordinationItem[];
  /** All section tasks (for each row's "blocks N tasks" derivation). */
  tasks: SectionTask[];
  onOpenItem: (id: string) => void;
  /** Concrete party rows + client name for partyFor() display. Optional —
   *  falls back to generic court tokens (R46). */
  parties?: ProjectParty[];
  clientName?: string;
}

/** The stable scroll/focus anchor a court bar pill jumps to. */
export function courtAnchorId(court: Court): string {
  return `coordination-court-${court}`;
}

export function CourtGroup({
  court,
  items,
  tasks,
  onOpenItem,
  parties,
  clientName,
}: CourtGroupProps) {
  if (items.length === 0) return null;

  // Resolve a concrete party ONLY for the gc/vendor courts (the named GC /
  // vendor row, when one is attached to any item in this group). The designer
  // court is always "In your court" and the client court shows the client's
  // name — neither is ever overridden by a court_party an item happens to carry
  // (e.g. a submittal in YOUR court submitted BY a vendor still groups as yours).
  const party =
    court === 'gc' || court === 'vendor'
      ? (parties?.find((p) => items.some((it) => it.court_party_id === p.id)) ??
         items.find((it) => it.court_party)?.court_party ??
         null)
      : null;
  const token = partyFor(court, { party, clientName });

  const isYours = court === 'designer';
  const meta = isYours
    ? `${items.length} need${items.length === 1 ? 's' : ''} your move`
    : `${items.length} open`;

  return (
    <section
      id={courtAnchorId(court)}
      className="mt-5 scroll-mt-24"
      aria-label={`${token.label} · ${meta}`}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="font-heading text-[16px] font-medium italic text-[var(--color-charcoal)]">
          <span
            aria-hidden
            className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full align-middle"
            style={{ background: token.dotColor }}
          />
          {token.label}
        </span>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.05em]"
          style={{ color: isYours ? 'var(--color-clay)' : 'var(--color-aged-oak)' }}
        >
          {meta}
        </span>
      </div>

      <StrataMiniRule className="my-1.5" />

      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <OpenItemRow
              item={item}
              tasks={tasks}
              onOpen={() => onOpenItem(item.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
