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
  return (
    <div
      data-people-ask-bar
      className="mx-auto w-full max-w-[1100px] px-4 pt-4 sm:px-6"
    >
      <form
        className="w-full max-w-[640px]"
        onSubmit={(event) => {
          event.preventDefault();
          onAsk();
        }}
      >
        <label
          htmlFor="people-engine-ask"
          className="doc-type-meta block font-semibold uppercase tracking-[0.1em]"
        >
          Ask the Engine
        </label>
        <div className="mt-1 flex min-h-12 items-center gap-2 border-b border-[var(--border-default)] transition-colors focus-within:border-[var(--color-charcoal)] motion-reduce:transition-none">
          <input
            id="people-engine-ask"
            data-people-ask-input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Find someone, or ask who to reconnect with"
            className="doc-type-control min-h-11 min-w-0 flex-1 bg-transparent px-1 text-[var(--text-primary)] placeholder:text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          />
          {value.trim() && (
            <button
              type="submit"
              aria-label="Ask the Engine"
              className="doc-type-control flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[var(--text-primary)] transition-colors hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
            >
              →
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
