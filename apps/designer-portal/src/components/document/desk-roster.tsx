'use client';

/**
 * The ledger under Today (US-25 slice 4; US-28 S3 change 2): every live job
 * not on Today's cards, one S1 ledger row each, in four groups — Also yours ·
 * With others · Coming back · No current alert. In the studio's scope each
 * person is a section ("Leah’s"). The quiet group folds behind one Show; its
 * rows are not rendered until it opens. Never a count.
 */

import { useState, type ReactNode } from 'react';
import type { DeskLedger, DeskLedgerGroup } from '@/lib/document/desk-roster-derivation';
import type { DeskHolder } from '@/lib/document/desk-scope';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { DeskLedgerRow, rosterLineAnchorId } from './desk-ledger-row';

/** Moved to desk-ledger-row.tsx; re-exported for this module's importers. */
export { rosterLineAnchorId };

function LedgerGroup({
  group,
  sectionKey,
  sectionLabel,
  holderOf,
  first,
}: {
  group: DeskLedgerGroup;
  sectionKey: string;
  sectionLabel: string | null;
  holderOf?: (jobId: string) => DeskHolder;
  first: boolean;
}) {
  const folds = group.key === 'rest';
  const [open, setOpen] = useState(false);
  const shown = !folds || open;
  return (
    <div
      data-roster-group={group.key}
      data-tour-anchor={first ? 'desk-folio' : undefined}
      className="desk-ledger-group"
    >
      <p className="eb sub">
        <span>{group.label}</span>
        {folds && (
          // The label never changes with state (IX18): `aria-expanded` does.
          <DocumentAction
            actionKey={`roster-show-rest-${sectionKey}`}
            variant="tertiary"
            aria-expanded={open}
            aria-label={`Show ${sectionLabel ? `${sectionLabel} ` : ''}jobs with no current alert`}
            onClick={() => setOpen((was) => !was)}
          >
            Show
          </DocumentAction>
        )}
      </p>
      {shown && (
        <ul className="rows">
          {group.lines.map((ledgerLine) => (
            <DeskLedgerRow
              key={ledgerLine.line.engagementId}
              {...ledgerLine}
              holder={holderOf?.(ledgerLine.line.projectId ?? ledgerLine.line.engagementId) ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function DeskRoster({
  ledger,
  holderOf,
  belowHead,
  othersHold,
}: {
  ledger: DeskLedger;
  /** Who carries each job (`deskHolderOf`): a row she does not carry prints
   *  whose move it is, and no act. */
  holderOf?: (jobId: string) => DeskHolder;
  /** The Desk arbiter's one line (§2), set above the ledger. */
  belowHead?: ReactNode;
  /** Mine: whose the rest of the studio's jobs are ("…are Jordan’s."). */
  othersHold?: string | null;
}) {
  const sections = ledger.sections.filter((section) => section.groups.some((group) => group.lines.length > 0));
  let firstGroup = true;

  return (
    <section
      aria-labelledby="every-job"
      data-testid="desk-roster"
      data-tour-anchor="desk-needs-your-hand"
      className="section desk-ledger"
    >
      <h2 id="every-job" className="sr-only">
        The rest of the jobs
      </h2>
      {belowHead}
      <DocumentActionGroup surfaceKey="desk" regionKey="every-job" aria-label="The rest of the jobs, actions">
        <div className="ledger w-full">
          {sections.map((section) => (
            <div key={section.key} data-ledger-section={section.key}>
              {section.label && (
                <div className="sec-head">
                  <p className="eb">
                    <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
                      <path d="M0 2h34M0 6h28M0 10h20" />
                    </svg>
                    <span>{section.label}</span>
                  </p>
                </div>
              )}
              {section.groups
                .filter((group) => group.lines.length > 0)
                .map((group) => {
                  const first = firstGroup;
                  firstGroup = false;
                  return (
                    <LedgerGroup
                      key={group.key}
                      group={group}
                      sectionKey={section.key}
                      sectionLabel={section.label}
                      holderOf={holderOf}
                      first={first}
                    />
                  );
                })}
            </div>
          ))}
        </div>
      </DocumentActionGroup>
      {othersHold && <p className="desk-rest-note t-body-sm">{othersHold}</p>}
      {sections.length === 0 && ledger.notChecked && (
        <p data-tour-anchor="desk-folio" className="t-body-sm text-[var(--text-muted)]">
          {ledger.notChecked}
        </p>
      )}
    </section>
  );
}
