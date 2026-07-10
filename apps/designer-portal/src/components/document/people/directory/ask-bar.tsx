'use client';

/**
 * The People Room ask bar (Track A) — the Engine's standing presence in the room
 * head, over people + history. Like the librarian, the ask leaves nothing behind
 * — it routes you to the right view (the Nurture queue, the makers shelf of the
 * directory) or answers in a quiet toast. Derivation-backed v1: keyword routing,
 * no thread, no history. "Designer-Taught Intelligence," never "AI."
 *
 * Routing (routePeopleAsk, pure + exported so it stays testable here in Track A):
 *  · reconnect / quiet / touch / drift / nurture → the Nurture view
 *  · maker / vendor / supplier → the Directory, filtered to makers
 *  · anything else → 'search': the Directory (F3) — it already reads the ask
 *    bar's value live as a name/role/company/email filter, so a query that
 *    doesn't match a keyword shortcut lands there filtered, not on a toast.
 */

import type { PartyRole } from '@patina/supabase';

export type AskRoute =
  | { kind: 'nurture' }
  | { kind: 'directory'; role: PartyRole | 'all' }
  | { kind: 'search'; query: string };

/** Pure routing for the ask bar — see the module note for the keyword map. */
export function routePeopleAsk(raw: string): AskRoute | null {
  const q = raw.trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  if (/(reconnect|quiet|touch|drift|nurture|dormant|out of touch)/.test(lower)) {
    return { kind: 'nurture' };
  }
  if (/(maker|vendor|supplier|fabricator|workshop)/.test(lower)) {
    return { kind: 'directory', role: 'maker' };
  }
  if (/\b(gc|contractor|general contractor)\b/.test(lower)) {
    return { kind: 'directory', role: 'gc' };
  }
  if (/\b(lead|leads|inquiry|inquiries|prospect)\b/.test(lower)) {
    return { kind: 'directory', role: 'lead' };
  }
  return { kind: 'search', query: q };
}

export function AskBar({
  value,
  onChange,
  onAsk,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Fires on Enter / the send affordance with the current trimmed query. */
  onAsk: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-3 sm:px-6">
      <div className="flex w-full max-w-[460px] items-center gap-2.5 rounded-[24px] border border-[var(--color-pearl)] bg-white px-4 py-2.5 transition-colors focus-within:border-[var(--color-clay)]">
        <span aria-hidden className="text-[0.8rem] text-[var(--color-clay)]">
          ✦
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAsk();
          }}
          aria-label="Ask the Engine about your people"
          placeholder="Find someone — or ask the Engine who to reconnect with"
          className="min-w-0 flex-1 bg-transparent text-[0.78rem] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--color-aged-oak)]"
        />
        {value.trim() && (
          <button
            type="button"
            onClick={onAsk}
            aria-label="Ask"
            className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[var(--color-clay)] text-[0.72rem] text-white transition-opacity hover:opacity-85"
          >
            →
          </button>
        )}
      </div>
    </div>
  );
}
