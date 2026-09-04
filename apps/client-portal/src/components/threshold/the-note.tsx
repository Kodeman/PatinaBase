'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { ScoredAction } from '@/components/making/scored-action';
import {
  parseSourceDate,
  type NoteModel,
  type PreviouslyEntry,
  type ThresholdNoteEnclosure,
} from '@/lib/threshold/derive';

/* ── THE NOTE ────────────────────────────────────────────────────────────────
   The one place on this surface that speaks in the first person, because it is
   a quotation: a line the designer wrote to this client, printed as she wrote
   it, datelined and signed with her initial. Everything around it stays in the
   third person.

   ABSENCE IS SILENCE. With no standing note the section renders nothing at all
   — the Doorstep's sentence already carries the page, and an empty letter is
   worse than no letter. ──────────────────────────────────────────────────── */

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "today", "yesterday", or the day it was written. */
function dateline(sentAt: string | null, today: Date): string | null {
  const sent = parseSourceDate(sentAt);
  if (!sent) return null;
  const days = Math.round((startOfDay(today) - startOfDay(sent)) / DAY_MS);
  if (days <= 0) return `${DAY_MONTH.format(sent)} · today`;
  if (days === 1) return `${DAY_MONTH.format(sent)} · yesterday`;
  return DAY_MONTH.format(sent);
}

/** "Nora Quist" signs "— N." — the initial, the way a note between two people is signed. */
function initialOf(authorName: string | null | undefined): string | null {
  const trimmed = authorName?.trim();
  if (!trimmed) return null;
  return `— ${trimmed[0].toUpperCase()}.`;
}

export interface NoteEnclosure extends ThresholdNoteEnclosure {
  label: string;
  /** The id of the section this enclosure stands in, e.g. `door`. */
  anchor: string;
}

export interface TheNoteProps {
  /**
   * CONTRACT: the standing note is rendered EITHER here or pinned to a
   * `DoorGate` leaf, never both — neither component dedupes, and the same
   * first-person paragraph printed twice reads as two letters.
   */
  note: NoteModel | null;
  /** Retired notes and closed instruments, unrolled behind "Earlier letters". */
  earlier: PreviouslyEntry[];
  enclosures: NoteEnclosure[];
  authorName?: string | null;
  today?: Date;
  /** The reply field, wired next door. Absent when there is nothing to write to. */
  reply?: ReactNode;
}

export function TheNote({
  note,
  earlier,
  enclosures,
  authorName,
  today = new Date(),
  reply,
}: TheNoteProps) {
  const [unrolled, setUnrolled] = useState(false);

  if (!note) return null;

  const line = dateline(note.sentAt, today);
  const signature = initialOf(authorName);

  return (
    <section
      id="note"
      // The door's "Read the note" targets this section; without a tab index
      // the fragment moves the viewport but neither the keyboard's focus nor
      // the screen reader's cursor.
      tabIndex={-1}
      data-threshold-unit="note"
      aria-label="The note"
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      {line && (
        <p
          data-testid="note-dateline"
          className="pt-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]"
        >
          {line}
        </p>
      )}

      <blockquote className="mt-3 max-w-[44ch] border-0 p-0">
        <p
          data-testid="note-body"
          className="whitespace-pre-line font-heading text-[1.2rem] leading-relaxed"
        >
          {note.body}
        </p>
        {signature && (
          <p
            data-testid="note-signature"
            className="mt-2 text-right font-heading text-[1.05rem] italic text-[var(--text-body)]"
          >
            {signature}
          </p>
        )}
      </blockquote>

      {enclosures.length > 0 && (
        <ul data-testid="note-enclosures" className="mt-4 max-w-[44ch] list-none">
          {enclosures.map((enclosure) => (
            <li
              key={`${enclosure.kind}-${enclosure.id}`}
              className="border-t border-dotted border-[var(--border-default)] py-2 text-[15px]"
            >
              <a
                href={enclosure.anchor.startsWith('#') ? enclosure.anchor : `#${enclosure.anchor}`}
                className="text-[var(--text-body)] no-underline hover:underline"
              >
                {enclosure.label}
              </a>
            </li>
          ))}
        </ul>
      )}

      {reply}

      {earlier.length > 0 && (
        <div className="mt-3">
          <ScoredAction
            actionKey="note_earlier_letters"
            regionKey="note"
            variant="tertiary"
            aria-expanded={unrolled}
            aria-controls="note-earlier"
            onClick={() => setUnrolled((open) => !open)}
          >
            {unrolled ? 'Roll the letters up' : 'Earlier letters'}
          </ScoredAction>
          <div id="note-earlier">
            {unrolled && (
              <ul
                data-testid="note-earlier"
                className="mt-2 grid max-w-[52ch] list-none gap-1.5 border-t border-dotted border-[var(--border-default)] pt-3"
              >
                {earlier.map((entry) => (
                  <li key={entry.id} className="text-[15px] text-[var(--text-body)]">
                    {entry.date ? `${DAY_MONTH.format(entry.date)} — ` : ''}
                    {entry.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
