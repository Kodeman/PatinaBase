'use client';

/**
 * The scope lens (Call Sheet Wave 2, slide 8 "The Rolodex") — MINE · STUDIO,
 * two DM-mono words. Generalizes the MakerLens idiom already in
 * directory-view.tsx (roster vs marketplace): same shape, a different pair of
 * words. MINE is the directory a designer already has; STUDIO is the shared
 * rolodex (R1 — every active non-guest studio member's book). U6 (Wave 4):
 * STUDIO is the default — `DEFAULT_CONTACT_SCOPE` below is the single source
 * of truth the People Room seeds its lifted `scope` state from.
 *
 * The active word is scored held-down (`da-score-on`, charcoal); the inactive
 * word carries only the hover hairline (`da-score-hover`, aged-oak) — the same
 * globals.css Scored Ink primitives DocumentAction and the day-1 checklist's
 * SKIP word use, so a lens toggle reads identically to every other scored
 * control in the app.
 */

import type { ContactScope } from '@patina/types';

/** U6 (Wave 4) — the studio's shared book is the default lens; a designer
 *  opts INTO the narrower MINE view, not out of the shared one. */
export const DEFAULT_CONTACT_SCOPE: ContactScope = 'studio';

const LENS: ReadonlyArray<[ContactScope, string]> = [
  ['mine', 'mine'],
  ['studio', 'studio'],
];

export function ScopeLens({
  scope,
  onScope,
}: {
  scope: ContactScope;
  onScope: (scope: ContactScope) => void;
}) {
  return (
    <p
      role="group"
      aria-label="Scope"
      className="mb-4 flex items-baseline gap-x-3 border-b border-[var(--color-pearl)]/70 pb-2"
    >
      {LENS.map(([key, label]) => {
        const on = scope === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onScope(key)}
            aria-current={on ? 'true' : undefined}
            className={`da-score-hover min-h-11 inline-flex items-center font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
              on
                ? 'da-score-on text-[var(--color-charcoal)]'
                : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </p>
  );
}
