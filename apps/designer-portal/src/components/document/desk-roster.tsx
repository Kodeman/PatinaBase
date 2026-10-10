'use client';

/**
 * The Desk — every live job, one dense line each (US-25 slice 4, R143).
 *
 * The line roster sits under the Day Sheet in three groups: Owed by you ·
 * Waiting on others · at rest. Each line prints its job's head need, the
 * same need the Day Sheet and the job's band read. Monochrome: the stage
 * plates became an ink word on the line (Q7). "By person" regroups the same
 * lines; the Day Sheet's Mine · The studio's scope replaced "Only what needs
 * me" (fix-now 1).
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  deriveDeskClaims,
  deriveRosterPeople,
  groupRosterByPerson,
  type DeskRoster as DeskRosterModel,
  type RosterMember,
} from '@/lib/document/desk-roster-derivation';
import { SectionEyebrow } from './section-eyebrow';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { DeskLedgerRow, rosterLineAnchorId } from './desk-ledger-row';

/** Moved to desk-ledger-row.tsx; re-exported for this module's importers. */
export { rosterLineAnchorId };

const GROUP_HEAD =
  'border-b border-[color:var(--text-primary)] pb-2 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]';

export function DeskRoster({
  roster,
  studioMembers,
  belowHead,
}: {
  roster: DeskRosterModel;
  studioMembers?: readonly RosterMember[];
  /** The Desk arbiter's one line (§2), set above the roster. */
  belowHead?: ReactNode;
}) {
  const [byPerson, setByPerson] = useState(false);
  const claims = useMemo(
    () => deriveDeskClaims({ roster, now: new Date() }),
    [roster],
  );
  const people = useMemo(
    () => deriveRosterPeople(studioMembers ?? []),
    [studioMembers],
  );
  const groups = byPerson
    ? groupRosterByPerson(roster.groups, people)
    : claims.groups;

  return (
    <section
      aria-labelledby="every-job"
      data-testid="desk-roster"
      data-tour-anchor="desk-needs-your-hand"
      className="mt-10"
    >
      {belowHead}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <SectionEyebrow>
          <span id="every-job">Every job</span>
        </SectionEyebrow>
        {people.length > 0 && (
          // Labels never change with state (IX18) — `aria-pressed` carries it.
          <DocumentAction
            actionKey="roster-facet-by-person"
            surfaceKey="desk"
            regionKey="every-job-facets"
            variant="tertiary"
            className="!text-[11px] !font-medium !tracking-[0.08em] aria-pressed:!text-[var(--text-primary)]"
            aria-pressed={byPerson}
            onClick={() => setByPerson((on) => !on)}
          >
            By team member
          </DocumentAction>
        )}
      </div>

      <DocumentActionGroup
        surfaceKey="desk"
        regionKey="every-job"
        aria-label="Every job actions"
      >
        <div className="w-full">
          {groups.map((group, position) => (
            <div key={group.key} data-roster-group={group.key} className="mt-7">
              <h3 className={GROUP_HEAD}>{group.label}</h3>
              {/* The query container the rows' 899px collapse measures. */}
              <ul
                className="desk-ledger-list"
                data-tour-anchor={position === 0 ? 'desk-folio' : undefined}
              >
                {group.lines.map((line) => (
                  <DeskLedgerRow key={line.engagementId} line={line} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DocumentActionGroup>

      {roster.groups.length === 0 && (
        <p
          data-tour-anchor="desk-folio"
          className="mt-4 font-heading text-[15px] italic text-[var(--text-muted)]"
        >
          {roster.notChecked ?? 'No current action alerts. The work is in motion.'}
        </p>
      )}
    </section>
  );
}
