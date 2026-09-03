'use client';

/**
 * The contextual help panel's KEYS block (onboarding Wave 1) — the third rung
 * of the shortcut ladder: the chips inside ⌘K teach recognition, this block
 * teaches the surface in hand, and "The keys" carries the whole system.
 *
 * Every printed chord comes from the registry's own `shortcut` field
 * (`shortcutsForSurface`), never from a hand-kept list here — a re-chord in
 * registry.tsx re-prints this block rather than leaving it lying.
 *
 * D4 — flat edges only, no drop; D8 — these are rows of text, not badges.
 */

import Link from 'next/link';
import { shortcutsForSurface } from '@/lib/document/registry';
import { THE_KEYS_HREF, THE_WORDS_HREF } from '@/lib/help-system/keys-reference';

export function PanelKeysBlock({ surfaceKey }: { surfaceKey?: string }) {
  const rows = surfaceKey ? shortcutsForSurface(surfaceKey) : [];

  return (
    <div
      data-testid="panel-keys"
      className="border-t border-[var(--doc-ink-border)] px-4 py-3"
    >
      {rows.length > 0 ? (
        <>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-aged-oak)]">
            KEYS
          </p>
          <ul className="mt-2 space-y-1.5">
            {rows.map((row) => (
              <li key={row.label} className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] text-[var(--color-charcoal)]">{row.label}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {row.keys.map((key) => (
                    <kbd
                      key={key}
                      className="border border-[var(--doc-ink-border)] px-1 font-mono text-[10px] uppercase leading-[1.6] text-[var(--color-aged-oak)]"
                    >
                      {key}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className={rows.length > 0 ? 'mt-3 flex gap-4' : 'flex gap-4'}>
        <Link
          href={THE_WORDS_HREF}
          className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)]"
        >
          The words
        </Link>
        <Link
          href={THE_KEYS_HREF}
          className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)]"
        >
          The keys
        </Link>
      </div>
    </div>
  );
}
