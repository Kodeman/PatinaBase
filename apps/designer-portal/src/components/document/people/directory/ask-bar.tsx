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
  if (
    /(reconnect|quiet|touch|drift|nurture|dormant|out of touch)/.test(lower)
  ) {
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
  // US-28 (people specimen) — "Search the directory": an eyebrow over one
  // house field on --paper-lift with the card edge, never a borderless line.
  // It sits in the Room's own measure (people-room.tsx).
  return (
    <form
      data-people-ask-bar
      className="people-search"
      onSubmit={(event) => {
        event.preventDefault();
        onAsk();
      }}
    >
      <label htmlFor="people-engine-ask" className="eb">
        Search the directory
      </label>
      <div className="people-search-row">
        <input
          id="people-engine-ask"
          data-people-ask-input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="A name, a firm or an email"
          className="people-search-field"
        />
        {value.trim() && (
          <button
            type="submit"
            aria-label="Ask the Engine"
            className="doc-type-control flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[var(--text-primary)] transition-colors hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)] motion-reduce:transition-none"
          >
            →
          </button>
        )}
      </div>
    </form>
  );
}
