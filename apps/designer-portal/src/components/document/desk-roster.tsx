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

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  deriveDeskDayLine,
  deriveRosterPeople,
  facetHeading,
  filterRosterToNeeds,
  groupRosterByPerson,
  NOTHING_NEEDS_YOU,
  type DayLinePart,
  type DeskRoster as DeskRosterModel,
  type RosterGroup,
  type RosterLine,
  type RosterMember,
} from '@/lib/document/desk-roster-derivation';
import { useAnsweredNotes } from '@/hooks/use-answered-notes';
import { SectionEyebrow } from './section-eyebrow';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { openLedger } from './command-bar';
import { RowWash, useRowWash, type RowWashTone } from './row-wash';

/** SP-20's device — a quiet need (a setup chore, an unopened proposal, a PO
 *  nobody answered) never wears the red letter's own ink.
 *
 *  D9: both are the INK members of their pairs. The material pigments
 *  (#D4A090 at 2.13:1, #8B9CAD at 2.64:1) failed 1.4.11 as graphical
 *  objects; terracotta-ink reads 5.28:1 and mocha 7.86:1 on paper. */
const MARK_COLOR = {
  urgent: 'var(--color-terracotta-ink)',
  quiet: 'var(--color-mocha)',
} as const;

type StageKey = RosterGroup['key'];

/** The six saturated stage tabs (R126). Care is the seventh stage on the
 *  paper and has no pigment of its own, so it takes Install's. */
const STAGE_TAB: Record<StageKey, string> = {
  brief: 'bg-[var(--tab-brief)]',
  discovery: 'bg-[var(--tab-discovery)]',
  direction: 'bg-[var(--tab-direction)]',
  proposal: 'bg-[var(--tab-proposal)]',
  project: 'bg-[var(--tab-project)]',
  install: 'bg-[var(--tab-install)]',
  care: 'bg-[var(--tab-install)]',
};

const STAGE_TONE: Record<StageKey, RowWashTone> = {
  brief: 'brief',
  discovery: 'discovery',
  direction: 'direction',
  proposal: 'proposal',
  project: 'project',
  install: 'install',
  care: 'install',
};

/** `data-roster-line` is the row's identity; an `id` is what a link can land
 *  on, and the day's line is nothing but links into the roster. */
export function rosterLineAnchorId(engagementId: string): string {
  return `roster-line-${engagementId}`;
}

/** The house sheet's `.act--inline` grammar (§F-D): an act living inside a
 *  sentence — the surrounding family, size, case and colour, no control box,
 *  a 1px rest rule 3px under the baseline that raises to --text-faint on
 *  hover. It is written here rather than in globals.css because another lane
 *  owns that file this wave.
 *
 *  It carries the sheet's own focus rule for every tier: the 2px ring AND the
 *  proofreader's caret, which fades in on focus. The sheet sets the caret at
 *  `left: 1px`, calibrated for a padded control box; an inline act has no
 *  padding, so at 1px the mark would land on the word's first letter. It is
 *  set just outside the word instead — a proofreader marks the margin. Every
 *  inline act below carries an `aria-label`, which is what keeps the caret's
 *  pseudo-content out of the accessible name (opacity:0 does not exempt it).
 *  D9: the ring is clay-INK (5.61:1). The base clay it carried before read
 *  2.18:1 and was the same defect the roster's mark carried. */
const INLINE_ACT =
  "relative border-b border-[color:var(--color-aged-oak)] pb-[3px] text-inherit no-underline transition-colors before:pointer-events-none before:absolute before:left-[-0.7em] before:top-1/2 before:-translate-y-1/2 before:text-[14px] before:leading-none before:text-[color:var(--color-quiet-ink)] before:opacity-0 before:transition-opacity before:duration-150 before:content-['‸'] hover:border-b-[1.5px] hover:border-[color:var(--text-faint)] hover:pb-[2.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)] focus-visible:before:opacity-100 motion-reduce:transition-none motion-reduce:before:transition-none";

/** The roster settles in ONCE per document session. A remount on return to
 *  /desk must not replay it, so the flag lives on the module, not the tree. */
let settledOnce = false;

function useSettleOnce(): boolean {
  const [settle] = useState(() => !settledOnce);
  // Flipped after the first commit, never during render: React's dev
  // double-render would otherwise consume the flag before the DOM exists.
  useEffect(() => {
    settledOnce = true;
  }, []);
  return settle;
}

function JobLine({
  line,
  tone,
  index,
  settle,
  tourAnchor,
}: {
  line: RosterLine;
  tone: RowWashTone;
  index: number;
  settle: boolean;
  tourAnchor?: string;
}) {
  const wash = useRowWash();

  return (
    <li
      {...wash}
      id={rosterLineAnchorId(line.engagementId)}
      data-tour-anchor={tourAnchor}
      data-roster-line={line.engagementId}
      className={`has-wash doc-rule-hair flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 last:border-b-0${
        settle ? ' desk-settle' : ''
      }`}
      style={settle ? ({ '--i': index } as CSSProperties) : undefined}
    >
      <RowWash tone={tone} />
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
      {/* The name WRAPS, never truncates (the sheet's own rule). A flex child's
          min-width is auto, so without `min-w-0` a long job name sets the row's
          minimum width and the whole Desk scrolls sideways at 390;
          `[overflow-wrap:anywhere]` is what lets a name with no space in it
          break rather than push. */}
      <Link
        href={line.jobHref}
        data-roster-name
        className="row-wash-score min-w-0 font-heading text-[16px] font-medium text-[var(--text-primary)] no-underline transition-colors [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)] motion-reduce:transition-none"
      >
        {line.name}
      </Link>
      {/* `min-w-0` lets this sentence be squeezed to nothing so the name gets
          its room — which means its OWN longest word then overflows the box it
          was squeezed into, and the page scrolls sideways at 390 whatever the
          name does. Measured on the seed: names alone left the Desk at
          scrollWidth 437/390; wrapping this sentence too lands it at 390/390. */}
      <p className="doc-type-body min-w-0 flex-1 text-[var(--text-muted)] [overflow-wrap:anywhere]">
        {line.state}
        {line.overdueText && (
          <>
            <br />
            <span
              data-roster-overdue
              className="text-[var(--color-terracotta-ink)]"
            >
              {line.overdueText}
            </span>
          </>
        )}
      </p>
      {/* The visible label alone does not say which job it belongs to, and
          eleven lines yield eleven acts reading `Open the job` — so the
          accessible name carries the job, as the folio card's did. The
          telemetry key carries it for the same reason: two jobs sharing a need
          kind are two acts, not one fired twice. */}
      {line.act.ledger ? (
        <DocumentAction
          actionKey={`roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`}
          aria-label={`${line.act.label} — ${line.name}`}
          variant="secondary"
          onClick={() =>
            openLedger(line.act.ledger!.name, line.act.ledger!.context)
          }
        >
          {line.act.label}
        </DocumentAction>
      ) : (
        <DocumentAction
          actionKey={`roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`}
          aria-label={`${line.act.label} — ${line.name}`}
          variant="secondary"
          href={line.act.href}
        >
          {line.act.label}
        </DocumentAction>
      )}
    </li>
  );
}

function DayLineText({ parts }: { parts: readonly DayLinePart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'job') {
          return (
            <a
              key={`${part.kind}-${index}`}
              href={`#${rosterLineAnchorId(part.engagementId)}`}
              // Two links can carry one job's name on this page — the row's
              // own link opens the job, this one only moves to the row — so
              // the accessible name says which is which.
              aria-label={`${part.text} — the row below`}
              className={INLINE_ACT}
            >
              {part.text}
            </a>
          );
        }
        if (part.kind === 'overdue') {
          return (
            <span
              key={`${part.kind}-${index}`}
              data-day-line-overdue
              className="text-[var(--color-terracotta-ink)]"
            >
              {part.text}
            </span>
          );
        }
        return <span key={`${part.kind}-${index}`}>{part.text}</span>;
      })}
    </>
  );
}

/** The facet acts carry the running head's own type (11px, 500, .08em), which
 *  the tertiary variant sets at 12px/300/.1em — `!` so the override does not
 *  depend on the order Tailwind happens to emit two arbitrary sizes in. A
 *  pressed act takes full ink; its two-score rule is `.da-*` CSS and belongs to
 *  globals.css, which this lane does not own. */
const FACET_CLASS =
  '!text-[11px] !font-medium !tracking-[0.08em] aria-pressed:!text-[var(--text-primary)]';

function FacetAct({
  actionKey,
  pressed,
  onToggle,
  children,
}: {
  actionKey: string;
  pressed: boolean;
  onToggle: () => void;
  children: string;
}) {
  return (
    <DocumentAction
      actionKey={actionKey}
      surfaceKey="desk"
      regionKey="every-job-facets"
      variant="tertiary"
      className={FACET_CLASS}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {children}
    </DocumentAction>
  );
}

export function DeskRoster({
  roster,
  studioMembers,
}: {
  roster: DeskRosterModel;
  studioMembers?: readonly RosterMember[];
}) {
  const settle = useSettleOnce();
  const [needsMe, setNeedsMe] = useState(false);
  const [byPerson, setByPerson] = useState(false);
  const { data: answeredNotes } = useAnsweredNotes();
  // The day's line is a view of the roster it sits above: it re-derives from
  // the same model, so a line can never name a job the roster does not list.
  const dayLine = useMemo(
    () => deriveDeskDayLine(roster, answeredNotes ?? [], new Date()),
    [roster, answeredNotes],
  );
  let lineIndex = 0;

  const people = useMemo(
    () => deriveRosterPeople(studioMembers ?? []),
    [studioMembers],
  );
  const narrowed = needsMe ? filterRosterToNeeds(roster.groups) : roster.groups;
  const personGroups = byPerson ? groupRosterByPerson(narrowed, people) : [];
  // The facet emptied the roster — as against a Desk that has no live jobs at
  // all, which keeps its own sentence below.
  const facetEmpty =
    roster.groups.length > 0 &&
    (byPerson ? personGroups.length === 0 : narrowed.length === 0);

  // The wash follows the JOB's stage, not its group's: By person regroups the
  // same lines away from their stage, and the row's pigment belongs to the
  // stage the job is in either way.
  const renderLine = (line: RosterLine) => {
    const anchor = lineIndex === 0 ? 'desk-folio' : undefined;
    const index = lineIndex;
    lineIndex += 1;
    return (
      <JobLine
        key={line.engagementId}
        line={line}
        tone={STAGE_TONE[line.stage]}
        index={index}
        settle={settle}
        tourAnchor={anchor}
      />
    );
  };

  return (
    <section
      aria-labelledby="every-job"
      data-testid="desk-roster"
      data-tour-anchor="desk-needs-your-hand"
    >
      {/* The head row: the sentence left, the facets right, wrapping to a
          second line at 390 and still standing above the first plate. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <SectionEyebrow>
          <span id="every-job">
            {facetHeading(roster.heading, { needsMe, byPerson })}
          </span>
        </SectionEyebrow>
        {/* Labels never change with state (IX18) — `aria-pressed` carries it. */}
        <div className="-my-2 flex flex-wrap items-baseline gap-x-6">
          <FacetAct
            actionKey="roster-facet-needs-me"
            pressed={needsMe}
            onToggle={() => setNeedsMe((on) => !on)}
          >
            Only what needs me
          </FacetAct>
          {people.length > 0 && (
            <FacetAct
              actionKey="roster-facet-by-person"
              pressed={byPerson}
              onToggle={() => setByPerson((on) => !on)}
            >
              By person
            </FacetAct>
          )}
        </div>
      </div>
      <p className="doc-type-body mb-8 text-[var(--text-body)]">
        {roster.overdueLine}
      </p>

      {/* The day's line: at most three lines, each an act into a row already
          on the page, and NOTHING at all when nothing needs her. */}
      {dayLine && (
        <div
          data-desk-day-line
          className="mb-8 border-t border-[color:var(--doc-ink-border)] pt-3"
        >
          {dayLine.lines.map((line) => (
            <p
              key={line.key}
              data-day-line={line.key}
              className="doc-type-body mb-3 text-[var(--text-body)] last:mb-0"
            >
              <DayLineText parts={line.parts} />
            </p>
          ))}
          {dayLine.more && (
            <p className="doc-type-body mt-3 text-[var(--text-body)]">
              <a
                href={`#roster-stage-${dayLine.more.stageKey}`}
                data-day-line-more
                aria-label={`and ${dayLine.more.count} more below`}
                className={INLINE_ACT}
              >
                and {dayLine.more.count} more below
              </a>
            </p>
          )}
        </div>
      )}

      {/* One region for the whole roster: the lines are one ledger of acts,
          not N anonymous groups of one. */}
      <DocumentActionGroup
        surfaceKey="desk"
        regionKey="every-job"
        aria-label="Every job actions"
      >
        <div className="w-full">
          {/* A plain div, not a named <section>: seven stage groups would add
              seven `region` landmarks nested inside this one group, and the
              <h3> already navigates a screen reader to each of them. */}
          {facetEmpty ? (
            <p
              data-tour-anchor="desk-folio"
              data-roster-facet-empty
              className="font-heading text-[15px] italic text-[var(--text-muted)]"
            >
              {NOTHING_NEEDS_YOU}
            </p>
          ) : byPerson ? (
            personGroups.map((group) => (
              <div key={group.key} className="mb-8 last:mb-0">
                {/* A person plate takes the rail, never a stage pigment:
                    people are not stages. */}
                <h3
                  id={`roster-${group.key}`}
                  data-person-plate={group.key}
                  className="mb-1.5 inline-flex items-center rounded-[3px] bg-[var(--doc-rail-stock)] px-2.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]"
                >
                  {group.label} · {group.count}
                </h3>
                <ul>{group.lines.map(renderLine)}</ul>
              </div>
            ))
          ) : (
            narrowed.map((group) => (
              <div key={group.key} className="mb-8 last:mb-0">
                {/* The stage tab: a small plate, not a band. The rows below it
                    stay on the cream ground. */}
                <h3
                  id={`roster-stage-${group.key}`}
                  data-stage-tab={group.key}
                  className={`mb-1.5 inline-flex items-center rounded-[3px] px-2.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white ${
                    STAGE_TAB[group.key]
                  }`}
                >
                  {group.label} · {group.count}
                </h3>
                <ul>{group.lines.map(renderLine)}</ul>
              </div>
            ))
          )}
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
