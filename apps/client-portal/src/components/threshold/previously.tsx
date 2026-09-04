'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import type { PreviouslyEntry, PreviouslyState } from '@/lib/threshold/derive';

import { InstrumentReading } from './instrument-reading';

/* ── PREVIOUSLY ──────────────────────────────────────────────────────────────
   The house's own back matter: one dated line per thing that has closed, ruled
   with a dotted leader out to the word for how it closed, and unfolding in
   place into what it actually said. Nothing here asks anything of the client —
   it is the record, kept where she can reach it without leaving the page.

   THE STATE WORD is the fourth column of the deck's receipt line, and it is
   the model's to decide: `deriveThreshold` reads a note's own lifecycle for
   it, so a note the client answered says Answered and one still open says
   Standing. This file only spells the four words. ────────────────────────── */

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

const STATE_WORD: Record<PreviouslyState, string> = {
  answered: 'Answered',
  standing: 'Standing',
  sent: 'Sent',
  signed: 'Signed',
};

const ONE_LINE = 58;

/** The line reads at a glance; the whole of it is one click away. */
export function oneLine(label: string): string {
  const flat = label.replace(/\s+/g, ' ').trim();
  return flat.length <= ONE_LINE ? flat : `${flat.slice(0, ONE_LINE - 1).trimEnd()}…`;
}

/** Nothing to unfold when the line already carries the whole of it. */
export function isTruncated(label: string): boolean {
  return label.replace(/\s+/g, ' ').trim().length > ONE_LINE;
}

/**
 * The signed instrument behind a receipt, when the line stands for one.
 * `threshold.tsx` mints an instrument receipt's id as `instrument:<proposalId>`
 * — the same id `deriveThreshold` carries through untouched — so the paper the
 * client signed is one unfold away from its own line, read here in full rather
 * than at the end of the retired `/proposals/[id]` route.
 */
const INSTRUMENT_ID = /^instrument:(.+)$/;

function instrumentProposalId(entry: PreviouslyEntry): string | null {
  if (entry.kind !== 'instrument') return null;
  return INSTRUMENT_ID.exec(entry.id)?.[1] ?? null;
}

export interface PreviouslyProps {
  entries: PreviouslyEntry[];
  /** The letters and the notices, wired next door. */
  correspondence?: ReactNode;
}

export function Previously({ entries, correspondence }: PreviouslyProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  // The correspondence is back matter too: a house with no closed instruments
  // but a letter in it still has a Previously to keep the letter in.
  if (entries.length === 0 && !correspondence) return null;

  return (
    <section
      id="previously"
      data-threshold-unit="previously"
      data-dimmable=""
      aria-labelledby="previously-title"
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <h2
        id="previously-title"
        className="pt-2.5 font-heading text-[1.35rem] font-medium tracking-[-0.012em]"
      >
        Previously
      </h2>

      <ul className="mt-3 list-none">
        {entries.map((entry) => {
          const open = openId === entry.id;
          // An instrument's id carries a colon (`instrument:<uuid>`), which is
          // legal in an id but has to be escaped in every selector that ever
          // reaches for it; the rest of this tree strips colons for the same
          // reason.
          const bodyId = `previously-body-${entry.id.replace(/:/g, '-')}`;
          const proposalId = instrumentProposalId(entry);
          const truncated = isTruncated(entry.label);
          const foldable = truncated || proposalId !== null;

          const line = (
            <>
              <span
                data-testid="previously-date"
                className="min-w-[6.6em] shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]"
              >
                {entry.date ? DAY_MONTH.format(entry.date) : '—'}
              </span>
              <span className="font-heading text-[1.05rem]">{oneLine(entry.label)}</span>
              <span
                aria-hidden="true"
                data-testid="previously-leader"
                className="relative top-[-0.28em] mx-2 min-w-[10px] flex-auto border-b border-dotted border-[var(--border-default)]"
              />
              <span
                data-testid="previously-state"
                className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mocha)]"
              >
                {STATE_WORD[entry.state]}
              </span>
            </>
          );

          return (
            <li
              key={entry.id}
              data-testid="previously-line"
              className="border-t border-[var(--border-default)]"
            >
              {/* A line that already carries the whole of it has nothing to
                  unfold; offering a control that reveals the same words again
                  is a promise the receipt cannot keep. */}
              {foldable ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={bodyId}
                  onClick={() => setOpenId(open ? null : entry.id)}
                  className="flex min-h-[44px] w-full items-baseline gap-3 py-3 text-left"
                >
                  {line}
                </button>
              ) : (
                <p className="flex min-h-[44px] w-full items-baseline gap-3 py-3">{line}</p>
              )}
              <div id={bodyId}>
                {foldable &&
                  open &&
                  (proposalId ? (
                    <div data-testid="previously-body" className="pb-4">
                      {/* A cut line still owes the client its own words: the
                          reading is what the unfold gained, not what it
                          replaced. */}
                      {truncated && (
                        <p className="max-w-[56ch] text-[15px] leading-relaxed text-[var(--text-body)]">
                          {entry.label}
                        </p>
                      )}
                      <InstrumentReading proposalId={proposalId} />
                    </div>
                  ) : (
                    <p
                      data-testid="previously-body"
                      className="max-w-[56ch] pb-4 text-[15px] leading-relaxed text-[var(--text-body)]"
                    >
                      {entry.label}
                    </p>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>

      {correspondence}
    </section>
  );
}
