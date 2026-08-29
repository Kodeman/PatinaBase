/**
 * Document letterhead (spec v1.1 §4, prototype v0.4 .doc-letterhead):
 * mini Strata Mark, Playfair title, the client line, one-line vitals. The
 * client ("who this is for") is a first-class subtitle in the title block
 * (R68.2) — directly under the title, above the small vitals.
 *
 * R80 (Track 7): on PROJECT documents (projectId set) the letterhead stops
 * being pure presentation — the title and the vitals (start · target · budget
 * band) become blur-save fields per the R40/R70 self-save law.
 * Pre-project documents keep the static string vitals unchanged.
 *
 * Wave 1 (D-6): the in-hand room row left for the rail's head, and the vitals
 * print only fields that carry a value.
 */

import type { ReactNode } from 'react';
import { StrataMark } from './strata-mark';
import { LetterheadTitle, LetterheadVitals } from './letterhead-vitals';
import { NeedsSetupChip, type NeedsSetupEntry } from './needs-setup-chip';
import type { FillState } from '@/lib/document/fill-state';

export function DocLetterhead({
  title,
  vitals,
  fill,
  client,
  projectId = null,
  needsSetup = null,
}: {
  title: string;
  vitals: string;
  /** R15: the mark as progress device — how far the engagement has come. */
  fill?: FillState;
  /** The client this document is for — the clickable HouseholdChip, rendered as
   *  a prominent subtitle in the title block (not a tiny line below it). */
  client?: ReactNode;
  /** R80: set on project documents — the title + vitals become self-save
   *  fields writing the projects row (blur-save, quiet per-field status). */
  projectId?: string | null;
  /** W1: the open setup needs, each with its own remedy. Empty, null and
   *  undefined all render nothing — the chip never announces a zero. */
  needsSetup?: NeedsSetupEntry[] | null;
}) {
  return (
    <header id="document-project-status" tabIndex={-1} className="doc-rule-mid mb-4 pb-5 pt-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]">
      <div className="mb-2.5">
        <StrataMark state="active" size="lg" fill={fill} label={fill ? 'Document progress' : undefined} />
      </div>
      {projectId ? (
        <LetterheadTitle projectId={projectId} serverTitle={title} />
      ) : (
        <h1 className="font-heading text-[40px] font-medium leading-[1.08] tracking-[-0.015em] text-[var(--text-primary)]">
          {title}
        </h1>
      )}
      {client}
      {projectId ? (
        <LetterheadVitals projectId={projectId} />
      ) : (
        vitals && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{vitals}</p>
      )}
      <NeedsSetupChip count={needsSetup?.length ?? 0} entries={needsSetup ?? []} />
    </header>
  );
}
