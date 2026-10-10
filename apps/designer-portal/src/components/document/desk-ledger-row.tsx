'use client';

/**
 * The roster line (R143 · D8 · US-25 slice 4).
 *
 * One dense line per job, in every group of the line roster: the job, the
 * phase as an ink word (Q7 — the stage plates are gone), the head need's
 * sentence, its date and its one act. Monochrome: no wash, no mark, no
 * pigment. Every word stays selectable — nothing overlays anything here.
 */

import Link from 'next/link';
import type { Landing } from '@/lib/arrival/types';
import { STAGE_WORD } from '@/lib/document/act-names';
import { paperRegionsForSection } from '@/lib/document/document-index';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import { DocumentAction } from './document-action';
import { openLedger } from './command-bar';

const AT_REST_SENTENCE = 'No current action alerts.';

/** The id a link lands on — the put-down row lands on it after a return. */
export function rosterLineAnchorId(engagementId: string): string {
  return `roster-line-${engagementId}`;
}

/** US-14 R-DM21 A — where the act lands when it opens the job's own
 *  Document: where the Document's own act for the same need lands
 *  (needGuideAction, document-guide.ts), in the arrival token's shape. A
 *  purchase order lands on the FF&E region; every other need on its stage's
 *  section. An act that opens a sheet or another room carries none. */
export function actLanding(line: RosterLine): Landing | null {
  if (line.act.ledger || line.act.href !== line.jobHref) return null;
  const po = line.needKind === 'po_unsent' || line.needKind === 'po_unacknowledged';
  if (po && line.projectId && paperRegionsForSection(line.stage).some((r) => r.key === 'ffe')) {
    return { kind: 'region', region: 'ffe' };
  }
  return { kind: 'section', sectionKey: line.stage };
}

export function DeskLedgerRow({ line }: { line: RosterLine }) {
  const actionKey = `roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`;
  const ariaLabel = `${line.act.label} — ${line.name}`;
  const landing = line.needKind ? actLanding(line) : null;
  const sentence = line.needKind
    ? (line.overdueText ?? line.needText)
    : (line.motionText ?? line.notChecked ?? AT_REST_SENTENCE);

  return (
    <li
      id={rosterLineAnchorId(line.engagementId)}
      data-ledger-row={line.engagementId}
      className="desk-ledger-row"
    >
      <span data-ledger-cell="name" className="min-w-0">
        <Link
          href={line.jobHref}
          data-roster-name
          className="block min-w-0 font-heading text-[18px] leading-[1.3] text-[var(--text-primary)] no-underline [overflow-wrap:anywhere] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
        >
          {line.name}
        </Link>
        <span className="mt-1 block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]">
          {line.custody}
        </span>
      </span>
      <span
        data-ledger-cell="phase"
        className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--text-subtle)]"
      >
        {STAGE_WORD[line.stage]}
      </span>
      <span
        data-ledger-cell="sentence"
        className="min-w-0 text-[15px] leading-[1.45] text-[var(--text-muted)] [overflow-wrap:anywhere]"
      >
        {sentence}
      </span>
      {/* Tabular figures: the column exists so that the moment one row carries
          a date, it lines up with every other one that does. */}
      <span
        data-ledger-cell="value"
        className="font-mono text-[14px] leading-[1.5] tracking-[0.02em] tabular-nums text-[var(--text-primary)]"
      >
        {line.valueText ?? ''}
      </span>
      {/* `data-register="act"` is what the arrival click token reads (US-14
          R-DM21 A): an act opens the record straight, with its landing. */}
      <span data-ledger-cell="act" data-register="act">
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
            data-landing={landing ? JSON.stringify(landing) : undefined}
            href={line.act.href}
          >
            {line.act.label}
          </DocumentAction>
        )}
      </span>
    </li>
  );
}
