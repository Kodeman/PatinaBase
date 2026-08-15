'use client';

/**
 * The document spine (spec §3, D12): Put down, seven section markers, the
 * timer (D9 — capture in the document), presence line. A sticky full-height
 * rail only when the paper can keep its working measure: compact index from
 * 1180px; from 1440px the seven marks travel in one row with only the active
 * phase's line beneath them. Below 1180px, D13's mobile sheet is the
 * document index.
 */

import type { ReactNode } from 'react';
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
  shelved,
}: {
  sections: SpineSection[];
  others: string[];
  /** Click a settled/active marker to scroll to (and unfold) that section. */
  onJump?: (key: SectionKey) => void;
  /** The running index, the rooms and the shelves — the full spine's three
   *  blocks (≥1440px only; the compact rail and the mobile sheet are
   *  untouched). Absent on documents with no Project section open. */
  shelved?: ReactNode;
}) {
  const activeSection = sections.find((s) => s.state === 'active');
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

      {/* Full tier (≥1440): the seven marks travel in one row rather than
          seven labelled rows, and all seven must sit AT REST — the
          progression is the point, so nothing may hide behind a scroll.
          The fixed 200px spine column leaves ~168px inside its own px-4;
          `xs` marks (22px) plus a reclaimed slice of that padding (-mx-2)
          fit seven with room to spare. Per-mark text drops out here; the
          active phase's line renders once, below the row. */}
      <ul className="flex flex-col items-center gap-1 min-[1440px]:flex-row min-[1440px]:flex-nowrap min-[1440px]:items-center min-[1440px]:gap-0.5 min-[1440px]:-mx-2">
        {sections.map((s) => {
          const mark = (
            <StrataMark
              // R35: each marker carries the engagement's fill as of its
              // section (the filling staircase); R15: only the active one
              // breathes — "alive" is literally true here.
              fill={fillStateAtSection(s.key)}
              size="sm"
              breathing={s.state === 'active'}
              label={
                s.state === 'active' ? `${s.label} — ${s.sub}` : undefined
              }
            />
          );
          const markXs = (
            <StrataMark
              fill={fillStateAtSection(s.key)}
              size="xs"
              breathing={s.state === 'active'}
              label={
                s.state === 'active' ? `${s.label} — ${s.sub}` : undefined
              }
            />
          );
          // Settled + active markers jump to their section; future ones are
          // inert (nothing to reach yet). The jump button gives keyboard reach.
          // The full-tier cell holds the row's 44px height but only 24px of
          // width (the xs mark is 22px) — narrower than the usual 44px
          // target, so it stays at the 24px floor rather than the mark's
          // own 22px.
          return (
            <li key={s.key} className="w-full shrink-0 min-[1440px]:w-auto">
              {s.state === 'future' || s.state === 'unrecorded' || !onJump ? (
                <div
                  aria-label={`${s.label}: ${s.sub}`}
                  className="flex min-h-11 items-center justify-center min-[1440px]:w-6"
                >
                  <span className="min-[1440px]:hidden">{mark}</span>
                  <span className="hidden min-[1440px]:block">{markXs}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onJump(s.key)}
                  title={`Jump to ${s.label}`}
                  aria-label={`Jump to ${s.label}: ${s.sub}`}
                  className="flex min-h-11 w-full min-w-11 items-center justify-center rounded-[4px] transition-colors hover:bg-[rgba(196,165,123,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none min-[1440px]:w-6"
                >
                  <span className="min-[1440px]:hidden">{mark}</span>
                  <span className="hidden min-[1440px]:block">{markXs}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {activeSection && (
        <p className="mt-2.5 hidden min-[1440px]:block">
          <span className="block text-[12px] font-semibold leading-tight text-[var(--color-charcoal)]">
            {activeSection.label}
          </span>
          <span className="mt-px block font-mono text-[12px] uppercase tracking-[0.05em] text-[var(--color-clay)]">
            {activeSection.sub}
          </span>
        </p>
      )}

      {/* The shelved spine's three blocks — the running index, the rooms, the
          shelves. Full spine only: below 1440px the paper needs its measure
          more than the rail needs its furniture. */}
      {shelved && <div className="hidden min-[1440px]:block">{shelved}</div>}

      <CompactSpineTimerDoorway />

      <div className="hidden min-[1440px]:mt-4 min-[1440px]:block">
        <SpineTimer />
        {/* Presence, unlabelled, at the spine's foot: "In this document" is now
            the running index's name, and one rail cannot carry it twice. */}
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] leading-relaxed text-[var(--color-aged-oak)]">
          {others.length === 0
            ? 'Just you · visible to the studio'
            : `You and ${others.join(', ')}`}
        </p>
      </div>
    </aside>
  );
}
