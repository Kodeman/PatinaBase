'use client';

/**
 * The document spine (spec §3, D12): Put down, seven section markers, the
 * timer (D9 — capture in the document), presence line. A sticky full-height
 * rail only when the paper can keep its working measure: compact index from
 * 1180px, full labelled spine from 1440px. Below that, D13's mobile sheet is
 * the document index.
 */

import Link from 'next/link';
import { StrataMark } from './strata-mark';
import { CompactSpineTimerDoorway, SpineTimer } from './spine-timer';
import { fillStateAtSection } from '@/lib/document/fill-state';
import type { SpineSection } from '@/lib/document/section-derivation';
import type { SectionKey } from '@/lib/document/desk-derivation';

export function DocSpine({
  sections,
  others,
  onJump,
}: {
  sections: SpineSection[];
  others: string[];
  /** Click a settled/active marker to scroll to (and unfold) that section. */
  onJump?: (key: SectionKey) => void;
}) {
  return (
    <aside
      aria-label="Document spine"
      data-document-spine
      data-spine-regime="sheet-below-1180-compact-to-1439-full-from-1440"
      // D13: below 1180px the unified bar's section handle replaces the rail
      // (the spine doubles as a bottom sheet, D3-3).
      className="sticky top-0 z-[2] hidden border-r border-[var(--color-pearl)] bg-[rgba(229,226,221,0.28)] min-[1180px]:box-border min-[1180px]:block min-[1180px]:h-screen min-[1180px]:w-full min-[1180px]:overflow-x-hidden min-[1180px]:overflow-y-auto min-[1180px]:px-1.5 min-[1180px]:pb-24 min-[1180px]:pt-4 min-[1440px]:w-auto min-[1440px]:px-4 min-[1440px]:pt-6"
    >
      <Link
        href="/desk"
        aria-label="Put down document"
        className="group mb-3 inline-flex min-h-11 w-full min-w-11 items-center justify-center rounded-[3px] font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)] hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] min-[1440px]:mb-4 min-[1440px]:justify-start min-[1440px]:gap-1 min-[1440px]:px-1.5"
      >
        <span aria-hidden>←</span>
        <span className="da-score-hover hidden group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100 min-[1440px]:inline">
          Put down
        </span>
      </Link>

      <ul className="flex flex-col items-center gap-1 min-[1440px]:items-stretch min-[1440px]:gap-0">
        {sections.map((s) => {
          const inner = (
            <>
              <span className="min-[1440px]:mt-[5px]">
                {/* R35: each marker carries the engagement's fill as of its
                    section (the filling staircase); R15: only the active one
                    breathes — "alive" is literally true here. */}
                <StrataMark
                  fill={fillStateAtSection(s.key)}
                  size="sm"
                  breathing={s.state === 'active'}
                  label={
                    s.state === 'active' ? `${s.label} — ${s.sub}` : undefined
                  }
                />
              </span>
              <span
                className={`sr-only min-[1440px]:not-sr-only ${
                  s.state === 'future' || s.state === 'unrecorded' ? 'min-[1440px]:opacity-45' : ''
                }`}
              >
                <span
                  className={`block text-[12px] leading-tight ${
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
                  className={`mt-px block font-mono text-[12px] uppercase tracking-[0.05em] ${
                    s.state === 'active'
                      ? 'text-[var(--color-clay)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {s.sub}
                </span>
              </span>
            </>
          );
          // Settled + active markers jump to their section; future ones are
          // inert (nothing to reach yet). The jump button gives keyboard reach.
          return (
            <li key={s.key} className="w-full shrink-0">
              {s.state === 'future' || s.state === 'unrecorded' || !onJump ? (
                <div
                  aria-label={`${s.label}: ${s.sub}`}
                  className="flex min-h-11 items-center justify-center gap-2.5 min-[1440px]:justify-start min-[1440px]:py-[0.45rem]"
                >
                  {inner}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onJump(s.key)}
                  title={`Jump to ${s.label}`}
                  aria-label={`Jump to ${s.label}: ${s.sub}`}
                  className="flex min-h-11 w-full min-w-11 items-center justify-center gap-2.5 rounded-[4px] text-left transition-colors hover:bg-[rgba(196,165,123,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none min-[1440px]:-mx-2 min-[1440px]:justify-start min-[1440px]:px-2 min-[1440px]:py-[0.45rem]"
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <CompactSpineTimerDoorway />

      <div className="hidden min-[1440px]:block">
        <SpineTimer />
      </div>

      <div className="hidden border-t border-[var(--color-pearl)] pt-3 min-[1440px]:mt-4 min-[1440px]:block">
        <p className="mb-1 font-mono text-[12px] uppercase tracking-[0.07em] text-[var(--color-charcoal)]">
          In this document
        </p>
        <p className="text-[14px] leading-snug text-[var(--color-charcoal)]">
          {others.length === 0
            ? 'Just you · visible to the studio'
            : `You and ${others.join(', ')}`}
        </p>
      </div>
    </aside>
  );
}
