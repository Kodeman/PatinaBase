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
 *
 * Wave 3 (R127): the letterhead takes the instruments' ledger. At ≥1180 it
 * stands in its own column beside the title block; below that the grid
 * collapses to one column and the ledger falls under the vitals, where the row
 * mounted before. One mount either way — the instruments register the mobile
 * bar's primary act, and two of them would register it twice.
 *
 * W3-R4 (D-B26 as amended): the ledger's column starved the title's. The title
 * now takes its OWN row across BOTH tracks — an <input> cannot wrap, only clip,
 * so the measure it is given is the measure it must have — and the household
 * chip, the vitals and the ledger share the row beneath it. The ledger's track
 * is bounded (minmax(18rem,24rem)) rather than `auto`, so its acts can no
 * longer take the width away from the left.
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
  instruments = null,
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
  /** W3: the letterhead instruments' ledger — its own column at ≥1180. */
  instruments?: ReactNode;
}) {
  return (
    <header id="document-project-status" tabIndex={-1} className="doc-rule-mid mb-4 pb-[18px] pt-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]">
      <div className="mb-2.5">
        <StrataMark state="active" size="lg" fill={fill} label={fill ? 'Document progress' : undefined} />
      </div>
      <div className="grid grid-cols-1 items-start gap-x-[1.5rem] gap-y-[0.5rem] min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        {/* Row 1 — the title, across BOTH tracks. On a project document the
            heading IS an <input>, and an input cannot wrap: a starved track
            does not stack it, it amputates it ("Aspen Lo"). Spanning the grid
            hands it the whole measure. A title longer than the WHOLE measure
            still clips — pre-existing; a wrapping title needs a <textarea>,
            which is not this wave's work. */}
        <div className="min-w-0 min-[1180px]:col-span-2">
          {projectId ? (
            <LetterheadTitle projectId={projectId} serverTitle={title} />
          ) : (
            /* 32px below 1180, 40px from 1180 up (NF-02: the SHELL's own tier,
               never Tailwind's `sm`): 40px of Playfair spends ~46 characters of a
               1440 measure but only ~11 of a 390 one. */
            <h1 className="font-heading text-[32px] font-medium leading-[1.08] tracking-[-0.015em] text-[var(--text-primary)] min-[1180px]:text-[40px]">
              {title}
            </h1>
          )}
        </div>
        {/* Row 2, left — who it is for, and the vitals. */}
        <div className="min-w-0">
          {client}
          {projectId ? (
            <LetterheadVitals projectId={projectId} />
          ) : (
            vitals && (
              <p
                data-letterhead-vitals
                className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--text-muted)]"
              >
                {vitals}
              </p>
            )
          )}
          <NeedsSetupChip count={needsSetup?.length ?? 0} entries={needsSetup ?? []} />
        </div>
        {/* Row 2, right — the ledger, MOUNTED at every width (D-B20): below
            1180 the single column simply stacks it under the vitals. */}
        {instruments && (
          <div className="min-w-0 min-[1180px]:justify-self-end">{instruments}</div>
        )}
      </div>
    </header>
  );
}
