'use client';

/**
 * The at-rest ledger row (R143 · D8).
 *
 * The roster row given an internal grid. Its win over the row it replaces is
 * that dates align down the page across forty rows — the one thing a wrapping
 * row could never do. It takes no card edge (D4a): a row is not a component
 * boundary, and it keeps the hairline it always had. Every word in it stays
 * selectable — nothing overlays anything here.
 */

import Link from 'next/link';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import { DocumentAction } from './document-action';
import { openLedger } from './command-bar';
import { RowWash, useRowWash, type RowWashTone } from './row-wash';
import { rosterLineAnchorId } from './desk-claim-card';

const AT_REST_SENTENCE = 'Nothing needs your hand.';

export function DeskLedgerRow({
  line,
  tone,
}: {
  line: RosterLine;
  tone: RowWashTone;
}) {
  const wash = useRowWash();
  const actionKey = `roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`;
  const ariaLabel = `${line.act.label} — ${line.name}`;

  return (
    <li
      {...wash}
      id={rosterLineAnchorId(line.engagementId)}
      data-ledger-row={line.engagementId}
      className="desk-ledger-row has-wash"
    >
      <RowWash tone={tone} />
      {/* A job at rest wears a ring, never a filled mark: the two marks are
          two registers, and a third would be a third urgency tier (C4/D8). */}
      <span
        aria-hidden="true"
        data-roster-mark
        data-ledger-cell="mark"
        className="inline-block h-[7px] w-[7px] shrink-0 rounded-full border border-[color:var(--text-faint)]"
      />
      <span data-ledger-cell="name" className="min-w-0">
        <span className="block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]">
          {line.custody}
        </span>
        <Link
          href={line.jobHref}
          data-roster-name
          className="row-wash-score mt-1 block min-w-0 font-heading text-[20px] font-medium leading-[1.3] text-[var(--text-primary)] no-underline transition-colors [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)] motion-reduce:transition-none"
        >
          {line.name}
        </Link>
        {/* Person · phase, and never the body text: the sentence cell to the
            right owns that, and printing it here too put "nothing needs your
            hand" directly above "Nothing needs your hand." */}
        {line.personLine && (
          <span
            data-register="person"
            className="mt-1 block text-[14px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
          >
            {line.personLine}
          </span>
        )}
      </span>
      <span
        data-ledger-cell="sentence"
        className="min-w-0 text-[14px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
      >
        {line.motionText ?? AT_REST_SENTENCE}
      </span>
      {/* Tabular figures: the column exists so that the moment one row carries
          a date, it lines up with every other one that does. */}
      <span
        data-ledger-cell="value"
        className="font-mono text-[15px] leading-[1.5] tracking-[0.02em] tabular-nums text-[var(--text-primary)]"
      >
        {line.valueText ?? ''}
      </span>
      <span data-ledger-cell="act">
        {line.act.ledger ? (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant="tertiary"
            onClick={() =>
              openLedger(line.act.ledger!.name, line.act.ledger!.context)
            }
          >
            {line.act.label}
          </DocumentAction>
        ) : (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant="tertiary"
            href={line.act.href}
          >
            {line.act.label}
          </DocumentAction>
        )}
      </span>
    </li>
  );
}
