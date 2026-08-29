'use client';

/**
 * The document spine (spec §3, D12; R127 Wave 1). Above the `--rule-mid`: the
 * head — `Put down`, the household, the seven-mark arc, the stage phrase — one
 * reserved block that keeps its height at every offset. Below it: this paper's
 * own furniture. A sticky full-height rail only when the paper can keep its
 * working measure: 136px of words from 1180px, 200px from 1440px. Below
 * 1180px, D13's mobile sheet is the document index.
 *
 * The timer and the presence line are evicted (R127 §4 / OD-16): the studio
 * drawer already prints `IN HAND TODAY`, and neither tenant is true across the
 * whole document at once.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { StrataMark } from './strata-mark';
import { fillStateAtSection } from '@/lib/document/fill-state';
import type { SpineSection } from '@/lib/document/section-derivation';
import type { SectionKey } from '@/lib/document/desk-derivation';

export interface DocSpineProps {
  sections: SpineSection[];
  others: string[];
  /** Click a settled/active marker to scroll to (and unfold) that section. */
  onJump?: (key: SectionKey) => void;
  /** The running index — the full spine's one block (≥1440px only; the
   *  narrow rail and the mobile sheet are untouched). The rooms and the
   *  shelves are the ticket's rows on the paper now (B1). Absent on documents
   *  with no Project section open. */
  shelved?: ReactNode;
  /** Who this document is for — the same name the letterhead's HouseholdChip
   *  prints (`row.client_name`). Absent on documents that carry no household. */
  household?: string;
  /** C-1 · the room lens. The room taken in hand, named in the head and put
   *  down from it, so the release is reachable at every offset. */
  roomInHand?: { id: string; name: string } | null;
  onReleaseRoom?: (roomId: string) => void;
}

export function DocSpine({
  sections,
  onJump,
  shelved,
  household,
  roomInHand = null,
  onReleaseRoom,
}: DocSpineProps) {
  const activeSection = sections.find((s) => s.state === 'active');
  return (
    <aside
      aria-label="Document spine"
      data-document-spine
      data-spine-regime="sheet-below-1180-narrow-to-1439-full-from-1440"
      // D13: below 1180px the unified bar's section handle replaces the rail
      // (the spine doubles as a bottom sheet, D3-3).
      className="sticky top-0 z-[2] hidden border-r border-[var(--color-pearl)] bg-[var(--doc-rail-stock)] min-[1180px]:box-border min-[1180px]:block min-[1180px]:h-screen min-[1180px]:w-full min-[1180px]:overflow-x-hidden min-[1180px]:overflow-y-auto min-[1180px]:px-3 min-[1180px]:pb-24 min-[1180px]:pt-4 min-[1440px]:w-auto min-[1440px]:px-4 min-[1440px]:pt-6"
    >
      <Link
        href="/desk"
        aria-label="Put down document"
        className="group mb-3 inline-flex min-h-11 w-full min-w-11 items-center justify-center rounded-[3px] font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)] hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] min-[1440px]:mb-4 min-[1440px]:justify-start min-[1440px]:gap-1 min-[1440px]:px-1.5"
      >
        <span aria-hidden>←</span>
        <span className="da-score-hover hidden group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100 min-[1180px]:inline">
          Put down
        </span>
      </Link>

      {/* The rail head — one tense: the job, and where it stands. Its height is
          RESERVED, never measured, so nothing above the rule moves as the
          paper scrolls. L-6's yield (the stage phrase goes quiet while the
          letterhead is in frame) arrives with the lens band in Wave 3; this
          wave the head prints statically. */}
      <div
        data-spine-head
        className="doc-rule-mid mb-3 min-h-[84px] pb-3 min-[1440px]:min-h-[100px]"
      >
        {household && (
          <p className="truncate text-[13px] leading-tight text-[var(--text-primary)]">
            {household}
          </p>
        )}

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
          <p
            data-spine-stage-phrase
            className="mt-2 font-mono text-[11px] uppercase leading-tight tracking-[0.05em] text-[var(--text-muted)]"
          >
            {/* Truncate the subject, never the number: the stage name loses
                its tail before `4 OF 6` gives up a character. At 1180–1439
                the 112px measure wraps it at spaces rather than clipping it
                against the rail's own overflow-x-hidden. */}
            <span className="block break-words">{activeSection.label}</span>
            <span className="block break-words">{activeSection.sub}</span>
          </p>
        )}

        {roomInHand && (
          <p
            data-spine-room-in-hand
            className="mt-2 break-words font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)]"
          >
            In hand · {roomInHand.name}
          </p>
        )}
        {roomInHand && onReleaseRoom && (
          <button
            type="button"
            data-spine-release-room
            onClick={() => onReleaseRoom(roomInHand.id)}
            className="group inline-flex min-h-11 w-full min-w-11 items-center justify-start rounded-[3px] font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            <span className="da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
              Put down the room
            </span>
          </button>
        )}
      </div>

      {/* The shelved spine's one block — the running index. Full spine only:
          below 1440px the paper needs its measure more than the rail needs its
          furniture, and the ticket carries the map at every width. */}
      {shelved && <div className="hidden min-[1440px]:block">{shelved}</div>}
    </aside>
  );
}
