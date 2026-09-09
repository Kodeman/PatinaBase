'use client';

/**
 * The Desk — every live job, in two halves (R143).
 *
 * R143 amends the density rule that built this: one line per job in the
 * at-rest ledger; a job with a claim on the studio's hand takes a Claim card.
 * Headings never fold; nothing is folded on first paint; the card is the
 * emphasis granted to a claim, never a container granted to every job.
 *
 * The two facets compose over both halves (D2): "Only what needs me" hides the
 * ledger — the cards already ARE what needs her — and "By person" regroups
 * both. No view switcher: a switcher is one step from the dashboard the vision
 * refuses.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CLAIMS_ANCHOR_ID,
  deriveDeskClaims,
  deriveRosterPeople,
  facetHeading,
  groupClaimsByPerson,
  groupRosterByPerson,
  NOTHING_NEEDS_YOU,
  type ClaimPersonGroup,
  type DayLinePart,
  type DeskRoster as DeskRosterModel,
  type RosterGroup,
  type RosterMember,
  type RosterPersonGroup,
} from '@/lib/document/desk-roster-derivation';
import { useAnsweredNotes } from '@/hooks/use-answered-notes';
import { SectionEyebrow } from './section-eyebrow';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { DeskClaimsGrid } from './desk-claims';
import { DeskLedgerRow } from './desk-ledger-row';
import { rosterLineAnchorId, STAGE_TAB, STAGE_TONE } from './desk-claim-card';

/** Moved to desk-claim-card.tsx, where both halves can reach it. Re-exported
 *  here so this module's existing importers keep resolving. */
export { rosterLineAnchorId };

/** The house sheet's `.act--inline` grammar (§F-D): an act living inside a
 *  sentence — the surrounding family, size, case and colour, no control box,
 *  a 1px rest rule 3px under the baseline that raises to --text-faint on
 *  hover.
 *
 *  It carries the sheet's own focus rule for every tier: the 2px ring AND the
 *  proofreader's caret, which fades in on focus. The sheet sets the caret at
 *  `left: 1px`, calibrated for a padded control box; an inline act has no
 *  padding, so at 1px the mark would land on the word's first letter. It is
 *  set just outside the word instead — a proofreader marks the margin. Every
 *  inline act below carries an `aria-label`, which is what keeps the caret's
 *  pseudo-content out of the accessible name (opacity:0 does not exempt it).
 *
 *  D9: the ring is clay-INK (5.61:1). The base clay it carried before read
 *  2.18:1 and was the same defect the roster's mark carried. */
const INLINE_ACT =
  "relative border-b border-[color:var(--color-aged-oak)] pb-[3px] text-inherit no-underline transition-colors before:pointer-events-none before:absolute before:left-[-0.7em] before:top-1/2 before:-translate-y-1/2 before:text-[14px] before:leading-none before:text-[color:var(--color-quiet-ink)] before:opacity-0 before:transition-opacity before:duration-150 before:content-['‸'] hover:border-b-[1.5px] hover:border-[color:var(--text-faint)] hover:pb-[2.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)] focus-visible:before:opacity-100 motion-reduce:transition-none motion-reduce:before:transition-none";

const PERSON_PLATE_CLASS =
  'mb-1.5 inline-flex items-center rounded-[3px] bg-[var(--doc-rail-stock)] px-2.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]';

const STAGE_PLATE_CLASS =
  'mb-1.5 inline-flex items-center rounded-[3px] px-2.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white';

/** The Desk settles in ONCE per document session. A remount on return to
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

function DayLineText({ parts }: { parts: readonly DayLinePart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'job') {
          return (
            <a
              key={`${part.kind}-${index}`}
              href={`#${rosterLineAnchorId(part.engagementId)}`}
              // Two links can carry one job's name on this page — the card's
              // own link opens the job, this one only moves to the card — so
              // the accessible name says which is which.
              aria-label={`${part.text} — the card below`}
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
 *  depend on the order Tailwind happens to emit two arbitrary sizes in. */
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

/** The at-rest half. Its head carries the count because a quantity of WORK is
 *  the one count this surface permits — never a quantity of attention. */
function LedgerHalf({
  groups,
  heading,
  byPerson = false,
  tourAnchor,
}: {
  groups: readonly (RosterGroup | RosterPersonGroup)[];
  heading: string;
  byPerson?: boolean;
  tourAnchor?: string;
}) {
  return (
    <div className="mt-12">
      <p
        data-desk-rest-head
        data-tour-anchor={tourAnchor}
        className="mb-4 border-t border-[color:var(--doc-ink-border)] pt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]"
      >
        {heading}
      </p>
      {groups.map((group) => (
        <div key={group.key} className="mb-8 last:mb-0">
          <h3
            id={byPerson ? `roster-${group.key}` : `roster-stage-${group.key}`}
            data-person-plate={byPerson ? group.key : undefined}
            data-stage-tab={byPerson ? undefined : group.key}
            className={
              byPerson
                ? PERSON_PLATE_CLASS
                : `${STAGE_PLATE_CLASS} ${STAGE_TAB[(group as RosterGroup).key]}`
            }
          >
            {group.label} · {group.count}
          </h3>
          <ul>
            {group.lines.map((line) => (
              <DeskLedgerRow
                key={line.engagementId}
                line={line}
                tone={STAGE_TONE[line.stage]}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
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

  // One derivation for the whole Desk: the day's line, the cards and the
  // ledger are three views of it, so no line can name a job the grid does not
  // print and no count can disagree with what is on the page.
  const claims = useMemo(
    () =>
      deriveDeskClaims({
        roster,
        answeredNotes: answeredNotes ?? [],
        now: new Date(),
      }),
    [roster, answeredNotes],
  );

  const people = useMemo(
    () => deriveRosterPeople(studioMembers ?? []),
    [studioMembers],
  );

  // IA-11 — "Only what needs me" hides the ledger outright: the cards already
  // ARE what needs her, so narrowing them again would be a no-op that looked
  // like a filter.
  const showLedger = !needsMe && claims.ledger.length > 0;
  const cardGroups: ClaimPersonGroup[] = byPerson
    ? groupClaimsByPerson(claims.cards, people)
    : [];
  const ledgerGroups = byPerson
    ? groupRosterByPerson(claims.ledger, people)
    : claims.ledger;

  // The facet emptied the Desk — as against a Desk that has no live jobs at
  // all, which keeps its own sentence below.
  const facetEmpty =
    roster.groups.length > 0 &&
    claims.cards.length === 0 &&
    !showLedger &&
    (needsMe || byPerson);

  // The walkthrough's fourth stop must land on something in every state. It
  // prefers the first card; with no cards it falls to the at-rest head.
  const cardsAnchor = claims.cards.length > 0 ? 'desk-folio' : undefined;
  const ledgerAnchor = claims.cards.length === 0 ? 'desk-folio' : undefined;

  return (
    <section
      aria-labelledby="every-job"
      data-testid="desk-roster"
      data-tour-anchor="desk-needs-your-hand"
    >
      {/* The head row: the sentence left, the facets right, wrapping to a
          second line at 390 and still standing above the first card. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <SectionEyebrow>
          <span id="every-job">
            {facetHeading(claims.heading, { needsMe, byPerson })}
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

      {/* The day's line: it quotes the grid below it (D7), each line an act
          into a card already on the page, and NOTHING at all when nothing
          claims her hand. It sits above the grid at every width, which is what
          the 390 reflow asks for. */}
      {claims.dayLine && (
        <div
          data-desk-day-line
          className="mb-8 border-t border-[color:var(--doc-ink-border)] pt-3"
        >
          {claims.dayLine.lines.map((line) => (
            <p
              key={line.key}
              data-day-line={line.key}
              className="doc-type-body mb-3 text-[var(--text-body)] last:mb-0"
            >
              <DayLineText parts={line.parts} />
            </p>
          ))}
          {claims.dayLine.more && (
            <p className="doc-type-body mt-3 text-[var(--text-body)]">
              <a
                href={`#${claims.dayLine.more.anchorId}`}
                data-day-line-more
                aria-label={`and ${claims.dayLine.more.count} more below`}
                className={INLINE_ACT}
              >
                and {claims.dayLine.more.count} more below
              </a>
            </p>
          )}
        </div>
      )}

      {/* One region for the whole Desk: the acts are one ledger of acts, not N
          anonymous groups of one. */}
      <DocumentActionGroup
        surfaceKey="desk"
        regionKey="every-job"
        aria-label="Every job actions"
      >
        <div className="w-full">
          {facetEmpty ? (
            <p
              data-tour-anchor="desk-folio"
              data-roster-facet-empty
              className="font-heading text-[15px] italic text-[var(--text-muted)]"
            >
              {NOTHING_NEEDS_YOU}
            </p>
          ) : byPerson ? (
            <>
              {cardGroups.map((group, position) => (
                <div key={group.key} className="mb-8 last:mb-0">
                  {/* A person plate takes the rail, never a stage pigment:
                      people are not stages. One person can head a card group
                      AND a ledger group, so the two plates cannot share an
                      id — the card half is prefixed `claims-`. */}
                  <h3
                    id={`claims-${group.key}`}
                    data-person-plate={group.key}
                    className={PERSON_PLATE_CLASS}
                  >
                    {group.label} · {group.count}
                  </h3>
                  <DeskClaimsGrid
                    cards={group.cards}
                    settle={settle}
                    startIndex={cardGroups
                      .slice(0, position)
                      .reduce((total, g) => total + g.count, 0)}
                    firstTourAnchor={position === 0 ? cardsAnchor : undefined}
                    id={position === 0 ? CLAIMS_ANCHOR_ID : undefined}
                  />
                </div>
              ))}
              {showLedger && (
                <LedgerHalf
                  groups={ledgerGroups}
                  heading={claims.restHeading}
                  byPerson
                  tourAnchor={ledgerAnchor}
                />
              )}
            </>
          ) : (
            <>
              <DeskClaimsGrid
                cards={claims.cards}
                settle={settle}
                firstTourAnchor={cardsAnchor}
                id={CLAIMS_ANCHOR_ID}
              />
              {showLedger && (
                <LedgerHalf
                  groups={ledgerGroups}
                  heading={claims.restHeading}
                  tourAnchor={ledgerAnchor}
                />
              )}
            </>
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
