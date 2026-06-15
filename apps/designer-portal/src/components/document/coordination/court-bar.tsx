'use client';

/**
 * Court bar — Track 5 (Project Coordination · the ball-in-court).
 * Prototype: `.court-bar` / `.court-pill` / `.court-n` / `.court-l` / `.newitem`.
 *
 * The ball-in-court summary: one pill per court that carries open items (the
 * designer's own court always shows, even at zero), each a Playfair count over
 * a mono two-line label ("in your court" / "waiting on <who>") fronted by the
 * court dot. The designer pill goes "hot" (clay border + faint clay wash) when
 * it carries any open item — the move the designer owns. A charcoal "+ New open
 * item" button closes the bar on the right and opens the composer (band-local
 * state). Clicking a pill smooth-scrolls to that court's group.
 *
 * Pure presentational: counts arrive pre-computed (useCourtSummary, a select
 * over the items query — no second fetch); the bar renders + forwards
 * callbacks. Depth is the 1px pearl/clay border + value contrast, never a
 * shadow (D4).
 */

import type { Court, CourtCount } from '@patina/supabase';
import { isHotCourt } from '@/lib/document/coordination-derivation';
import { courtToken } from './party';

// ── court-bar.tsx — the ball-in-court summary pills + "+ New open item" ──
export interface CourtBarProps {
  projectId: string;
  /** From useCourtSummary(projectId) — CourtCount[] in COURT_ORDER. */
  summary: CourtCount[];
  /** Open the item composer (band-local state). */
  onNewItem: () => void;
  /** Scroll/focus a court group (smooth scroll to its anchor). */
  onJumpCourt: (c: Court) => void;
}

export function CourtBar({ summary, onNewItem, onJumpCourt }: CourtBarProps) {
  // A pill shows when the court carries open items; the designer's own court
  // always shows (the prototype's "In your court" pill is the constant anchor).
  const pills = summary.filter((c) => c.court === 'designer' || c.open > 0);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {pills.map((count) => {
        const token = courtToken(count.court);
        const hot = isHotCourt(count);
        return (
          <button
            key={count.court}
            type="button"
            onClick={() => onJumpCourt(count.court)}
            className="flex items-center gap-2 rounded-[8px] border bg-[var(--color-off-white)] px-3 py-2 text-left transition-colors"
            style={{
              borderColor: hot ? 'var(--color-clay)' : 'var(--color-pearl)',
              background: hot ? 'rgba(196,165,123,0.07)' : 'var(--color-off-white)',
            }}
          >
            <span className="font-heading text-[18px] font-medium leading-none text-[var(--color-charcoal)]">
              {count.open}
            </span>
            <span className="font-mono text-[9px] uppercase leading-[1.3] tracking-[0.04em] text-[var(--color-aged-oak)]">
              <span className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-[6px] w-[6px] rounded-full"
                  style={{ background: token.dotColor }}
                />
                {count.court === 'designer' ? 'in your' : 'waiting on'}
              </span>
              <span className="block">
                {count.court === 'designer' ? 'court' : token.waitingOn}
              </span>
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onNewItem}
        className="ml-auto rounded-[6px] border-0 bg-[var(--color-charcoal)] px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-off-white)] transition-opacity hover:opacity-90"
      >
        + New open item
      </button>
    </div>
  );
}
