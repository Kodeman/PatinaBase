'use client';

import { useState } from 'react';

import type { PreviouslyEntry } from '@/lib/threshold/derive';

/* ── PREVIOUSLY ──────────────────────────────────────────────────────────────
   The house's own back matter: one dated line per thing that has closed, ruled
   with a dotted leader out to the word for how it closed, and unfolding in
   place into what it actually said. Nothing here asks anything of the client —
   it is the record, kept where she can reach it without leaving the page.

   THE STATE WORD is the fourth column of the deck's receipt line. The model
   holds two kinds of closed thing — a note the studio took down, and an
   instrument that was executed — so only two of the four words are reachable
   from data; the vocabulary is stated whole so the mapping stays visible when
   the model grows an answered note. ──────────────────────────────────────── */

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

const STATE_WORD = {
  answered: 'Answered',
  standing: 'Standing',
  sent: 'Sent',
  signed: 'Signed',
} as const;

function stateWord(entry: PreviouslyEntry): string {
  return entry.kind === 'instrument' ? STATE_WORD.signed : STATE_WORD.sent;
}

/** The line reads at a glance; the whole of it is one click away. */
function oneLine(label: string): string {
  const flat = label.replace(/\s+/g, ' ').trim();
  return flat.length <= 58 ? flat : `${flat.slice(0, 57).trimEnd()}…`;
}

export interface PreviouslyProps {
  entries: PreviouslyEntry[];
}

export function Previously({ entries }: PreviouslyProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  return (
    <section
      id="previously"
      data-threshold-unit="previously"
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
          const bodyId = `previously-body-${entry.id}`;
          return (
            <li
              key={entry.id}
              data-testid="previously-line"
              className="border-t border-[var(--border-default)]"
            >
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpenId(open ? null : entry.id)}
                className="flex min-h-[44px] w-full items-baseline gap-3 py-3 text-left"
              >
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
                  {stateWord(entry)}
                </span>
              </button>
              <div id={bodyId}>
                {open && (
                  <p
                    data-testid="previously-body"
                    className="max-w-[56ch] pb-4 text-[15px] leading-relaxed text-[var(--text-body)]"
                  >
                    {entry.label}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
