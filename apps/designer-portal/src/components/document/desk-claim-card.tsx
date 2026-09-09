'use client';

/**
 * The Claim card (R143 · D10).
 *
 * A card is a treatment for NEED, not a container for a JOB: it exists only
 * for a job with a claim on the studio's hand, and it earns the box by holding
 * two things a roster row could not — a need sentence that wants two lines,
 * and a name with an honest 44px target.
 *
 * Six registers, fixed order, one type role each. DOM order IS the
 * screen-reader order, so the order below is the design.
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { SectionKey } from '@/lib/document/desk-derivation';
import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DocumentAction } from './document-action';
import { openLedger } from './command-bar';
import { RowWash, useRowWash, type RowWashTone } from './row-wash';

/** SP-20's device — a quiet need never wears the red letter's own ink.
 *  D9: both are the INK members of their pairs. The material pigments
 *  (#D4A090 at 2.13:1, #8B9CAD at 2.64:1) failed 1.4.11 as graphical objects;
 *  terracotta-ink reads 5.28:1 and mocha 7.86:1 on paper. */
export const MARK_COLOR = {
  urgent: 'var(--color-terracotta-ink)',
  quiet: 'var(--color-mocha)',
} as const;

/** The six saturated stage tabs (R126). Care is the seventh stage on the paper
 *  and has no pigment of its own, so it takes Install's. Exported so the grid,
 *  the ledger and the roster read one table rather than three copies. */
export const STAGE_TAB: Record<SectionKey, string> = {
  brief: 'bg-[var(--tab-brief)]',
  discovery: 'bg-[var(--tab-discovery)]',
  direction: 'bg-[var(--tab-direction)]',
  proposal: 'bg-[var(--tab-proposal)]',
  project: 'bg-[var(--tab-project)]',
  install: 'bg-[var(--tab-install)]',
  care: 'bg-[var(--tab-install)]',
};

export const STAGE_TONE: Record<SectionKey, RowWashTone> = {
  brief: 'brief',
  discovery: 'discovery',
  direction: 'direction',
  proposal: 'proposal',
  project: 'project',
  install: 'install',
  care: 'install',
};

const HEAD_TYPE =
  'font-mono text-[11px] font-medium uppercase tracking-[0.08em]';

/** `data-roster-line` was the row's identity; an `id` is what a link lands
 *  on, and the day's line is nothing but links into the Desk. The one
 *  definition, reached by both halves; desk-roster.tsx re-exports it for its
 *  own existing importers. */
export function rosterLineAnchorId(engagementId: string): string {
  return `roster-line-${engagementId}`;
}

export function DeskClaimCard({
  card,
  tone,
  index = 0,
  settle,
  tourAnchor,
}: {
  card: ClaimCard;
  tone: RowWashTone;
  /** The settle stagger index; ignored when `settle` is false. */
  index?: number;
  settle: boolean;
  tourAnchor?: string;
}) {
  const wash = useRowWash();
  const { line } = card;
  // The act's telemetry key carries the job: two jobs sharing a need kind are
  // two acts, not one fired twice.
  const actionKey = `roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`;
  const ariaLabel = `${line.act.label} — ${line.name}`;
  // Secondary where the act moves a reminder or opens money; tertiary where it
  // only opens something. Consequence, not emphasis.
  const variant = line.act.ledger ? 'secondary' : 'tertiary';

  return (
    <li
      {...wash}
      id={rosterLineAnchorId(line.engagementId)}
      data-claim-card={line.engagementId}
      data-tour-anchor={tourAnchor}
      className={`desk-claim-card has-wash${settle ? ' desk-settle' : ''}`}
      style={settle ? ({ '--i': index } as CSSProperties) : undefined}
    >
      <RowWash tone={tone} />
      <div className="desk-claim-upper">
        {/* D10 — everything in this wrapper is pointer-events:none, so the
            whole block is the name link's target. The cost is that these two
            lines are not selectable; R143 records why that is the right side
            of the trade. Split into two wrappers (rather than one plus a
            flex `order`) so DOM order and visual order stay identical. */}
        <span data-claim-inert className="block">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {/* 1 · stage — one word on the plate, never "· 3" on a card. The
                card has overflow:hidden, so a long single token needs its own
                wrap guard like every other name-bearing element. */}
            <span
              data-register="stage"
              className={`inline-flex min-w-0 items-center rounded-[3px] px-2.5 py-[3px] text-white [overflow-wrap:anywhere] ${HEAD_TYPE} ${STAGE_TAB[card.stage]}`}
            >
              {card.stageLabel}
            </span>
            {/* 2 · custody — whose hand, beside the 7px mark. Same wrap guard:
                "With <name>" can carry a long single token. */}
            <span
              data-register="custody"
              className={`inline-flex min-w-0 items-center gap-2 text-[var(--text-subtle)] [overflow-wrap:anywhere] ${HEAD_TYPE}`}
            >
              <span
                aria-hidden="true"
                data-roster-mark
                data-mark-tone={line.mark ?? undefined}
                data-mark-color={line.mark ? MARK_COLOR[line.mark] : undefined}
                className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                style={
                  line.mark ? { backgroundColor: MARK_COLOR[line.mark] } : undefined
                }
              />
              {card.custody}
            </span>
          </span>
        </span>
        {/* 3 · name — wraps, never truncates. A DIRECT child of
            .desk-claim-upper, never wrapped or itself positioned: the D10
            overlay is this element's own ::before, and an absolutely
            positioned pseudo-element's containing block is its nearest
            POSITIONED ancestor. `.row-wash-score` sets position:relative for
            its own underline, so it rides a NESTED span instead of this
            anchor — putting it here would make the WORD's own box the
            overlay's containing block instead of the 88px upper block. */}
        <Link
          href={line.jobHref}
          data-roster-name
          data-register="name"
          className="mt-2 block min-w-0 font-heading text-[20px] font-medium leading-[1.3] text-[var(--text-primary)] no-underline transition-colors motion-reduce:transition-none"
        >
          <span className="row-wash-score [overflow-wrap:anywhere]">
            {line.name}
          </span>
        </Link>
        {/* 4 · person · phase — no label, no ordinal, no "Client:". Its own
            inert wrapper so it needs no flex `order` to land after the name. */}
        <span data-claim-inert className="block">
          <span
            data-register="person"
            className="mt-1 block text-[14px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
          >
            {line.state}
          </span>
        </span>
      </div>
      {/* 5 · the one true sentence — the overdue clause in the red letter's own
          ink, and never a growing day count beside a date. Selectable. */}
      <p
        data-register="sentence"
        className="desk-claim-sentence mt-3 text-[15px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
      >
        {line.overdueText ? (
          <span data-roster-overdue className="text-[var(--color-terracotta-ink)]">
            {line.overdueText}
          </span>
        ) : (
          line.needText
        )}
      </p>
      {/* 6 · the one act, never two. */}
      <div data-register="act" className="desk-claim-band">
        {line.act.ledger ? (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant={variant}
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
            variant={variant}
            href={line.act.href}
          >
            {line.act.label}
          </DocumentAction>
        )}
      </div>
    </li>
  );
}
