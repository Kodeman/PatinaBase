'use client';

/**
 * The scope lens (Call Sheet Wave 2, slide 8 "The Rolodex") — MINE · STUDIO,
 * two DM-mono words. Generalizes the MakerLens idiom already in
 * directory-view.tsx (roster vs marketplace): same shape, a different pair of
 * words. MINE is the directory a designer already has; STUDIO is the shared
 * rolodex (R1 — every active non-guest studio member's book). Default MINE
 * this wave — the STUDIO default flip is Wave 4 (U6).
 *
 * The active word is scored held-down (`da-score-on`, charcoal); the inactive
 * word carries only the hover hairline (`da-score-hover`, aged-oak) — the same
 * globals.css Scored Ink primitives DocumentAction and the day-1 checklist's
 * SKIP word use, so a lens toggle reads identically to every other scored
 * control in the app.
 */

import type { ContactScope } from '@patina/types';

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
            className={`da-score-hover min-h-11 inline-flex items-center font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors ${
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
