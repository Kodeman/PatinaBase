'use client';

/**
 * The document spine (spec §3, D12): Put down, seven section markers, the
 * timer (D9 — capture in the document), presence line. A sticky full-height
 * rail on desktop; the D12 interim mobile pattern is a sticky horizontal
 * paper strip (the dedicated D13 pattern still gates the flip).
 */

import Link from 'next/link';
import { StrataMark } from './strata-mark';
import { SpineTimer } from './spine-timer';
import type { SpineSection } from '@/lib/document/section-derivation';

export function DocSpine({ sections, others }: { sections: SpineSection[]; others: string[] }) {
  return (
    <aside
      aria-label="Document spine"
      // D13: below 980px the unified bar's section handle replaces the rail
      // (the spine doubles as a bottom sheet, D3-3).
      className="sticky top-0 z-[2] hidden items-start gap-5 overflow-x-auto border-b border-[var(--color-pearl)] bg-[var(--doc-paper)] px-5 py-3 min-[980px]:block min-[980px]:h-screen min-[980px]:overflow-y-auto min-[980px]:border-b-0 min-[980px]:border-r min-[980px]:bg-[rgba(229,226,221,0.28)] min-[980px]:px-4 min-[980px]:pb-24 min-[980px]:pt-6"
    >
      <Link
        href="/desk"
        className="mb-0 mt-1 inline-block shrink-0 rounded-[3px] border border-transparent px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:border-[rgba(196,165,123,0.35)] hover:text-[var(--color-clay)] min-[980px]:mb-4 min-[980px]:mt-0"
      >
        ← Put down
      </Link>

      <ul className="flex gap-5 min-[980px]:block min-[980px]:gap-0">
        {sections.map((s) => (
          <li
            key={s.key}
            className="flex shrink-0 items-start gap-2.5 py-1 min-[980px]:py-[0.45rem]"
          >
            <span className="mt-[5px]">
              {/* R15: only the active marker breathes — "alive" is literally true here. */}
              <StrataMark state={s.state} size="sm" breathing={s.state === 'active'} />
            </span>
            <span className={s.state === 'future' ? 'opacity-45' : ''}>
              <span
                className={`block text-[11.5px] leading-tight ${
                  s.state === 'active'
                    ? 'font-semibold text-[var(--color-charcoal)]'
                    : s.state === 'settled'
                      ? 'text-[var(--color-aged-oak)]'
                      : 'text-[var(--text-muted)]'
                }`}
              >
                {s.label}
              </span>
              <span
                className={`mt-px block font-mono text-[8.5px] uppercase tracking-[0.05em] ${
                  s.state === 'active' ? 'text-[var(--color-clay)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {s.sub}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <SpineTimer />

      <div className="hidden border-t border-[var(--color-pearl)] pt-3 min-[980px]:mt-4 min-[980px]:block">
        <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
          In this document
        </p>
        <p className="text-[10.5px] leading-snug text-[var(--color-aged-oak)]">
          {others.length === 0
            ? 'Just you · visible to the studio'
            : `You and ${others.join(', ')}`}
        </p>
      </div>
    </aside>
  );
}
