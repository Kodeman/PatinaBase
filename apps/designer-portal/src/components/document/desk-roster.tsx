'use client';

/**
 * The Desk roster — one line per live job, grouped by stage (direction-b §2.1,
 * mock M1). It replaces the four-up folio grid, The studio today and Recent
 * boards: "show me everything in install" is answered by a heading, at zero
 * acts.
 *
 * The density rule is the whole design: one line per job, wrapping to two or
 * three; never a card; headings never fold; nothing folded on first paint.
 */

import Link from 'next/link';
import type {
  DeskRoster as DeskRosterModel,
  RosterLine,
} from '@/lib/document/desk-roster-derivation';
import { SectionEyebrow } from './section-eyebrow';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { openLedger } from './command-bar';

/** SP-20's device — a setup chore never wears the dated-overdue colour. */
const MARK_COLOR = {
  overdue: 'var(--color-terracotta)',
  setup: 'var(--color-dusty-blue)',
} as const;

function JobLine({ line, tourAnchor }: { line: RosterLine; tourAnchor?: string }) {
  return (
    <li
      data-tour-anchor={tourAnchor}
      data-roster-line={line.engagementId}
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-dashed border-[var(--border-subtle)] py-2.5 last:border-b-0"
    >
      {/* The mark tells a dated overdue item from a setup chore at the margin.
          It never grows a count, a label, or a second urgency tier (C4/D8). */}
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
      <Link
        href={line.jobHref}
        className="font-heading text-[16px] font-medium text-[var(--text-primary)] underline decoration-transparent decoration-1 underline-offset-4 transition-colors hover:decoration-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
      >
        {line.name}
      </Link>
      <p className="doc-type-body min-w-0 flex-1 text-[var(--text-muted)]">
        {line.state}
        {line.overdueText && (
          <>
            <br />
            <span
              data-roster-overdue
              className="text-[var(--color-terracotta)]"
            >
              {line.overdueText}
            </span>
          </>
        )}
      </p>
      {line.act.ledger ? (
        <DocumentAction
          actionKey={`roster-${line.needKind ?? 'open-the-job'}`}
          variant="secondary"
          onClick={() =>
            openLedger(line.act.ledger!.name, line.act.ledger!.context)
          }
        >
          {line.act.label}
        </DocumentAction>
      ) : (
        <DocumentAction
          actionKey={`roster-${line.needKind ?? 'open-the-job'}`}
          variant="secondary"
          href={line.act.href}
        >
          {line.act.label}
        </DocumentAction>
      )}
    </li>
  );
}

export function DeskRoster({ roster }: { roster: DeskRosterModel }) {
  let lineIndex = 0;

  return (
    <section
      aria-labelledby="every-job"
      data-testid="desk-roster"
      data-tour-anchor="desk-needs-your-hand"
    >
      <SectionEyebrow>
        <span id="every-job">{roster.heading}</span>
      </SectionEyebrow>
      <p className="doc-type-body mb-8 text-[var(--text-body)]">
        {roster.overdueLine}
      </p>

      {/* One region for the whole roster: the lines are one ledger of acts,
          not N anonymous groups of one. */}
      <DocumentActionGroup
        surfaceKey="desk"
        regionKey="every-job"
        aria-label="Every job actions"
      >
        <div className="w-full">
          {roster.groups.map((group) => (
            <section
              key={group.key}
              aria-labelledby={`roster-stage-${group.key}`}
              className="mb-8 last:mb-0"
            >
              <h3
                id={`roster-stage-${group.key}`}
                className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]"
              >
                {group.label} · {group.count}
              </h3>
              <ul>
                {group.lines.map((line) => {
                  const anchor = lineIndex === 0 ? 'desk-folio' : undefined;
                  lineIndex += 1;
                  return (
                    <JobLine
                      key={line.engagementId}
                      line={line}
                      tourAnchor={anchor}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </DocumentActionGroup>

      {roster.groups.length === 0 && (
        <p
          data-tour-anchor="desk-folio"
          className="font-heading text-[15px] italic text-[var(--text-muted)]"
        >
          Nothing needs your hand. The work is in motion.
        </p>
      )}
    </section>
  );
}
