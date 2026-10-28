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

import { useContext, type ReactNode } from 'react';
import { StrataMark } from './strata-mark';
import { LetterheadTitle, LetterheadVitals } from './letterhead-vitals';
import { Round8MarginContext } from './paper/margin-layout';
import type { FillState } from '@/lib/document/fill-state';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { STAGE_WORD } from '@/lib/document/act-names';

/** US-28 S7 (V20 U-Q14) — the stage once, as the 3px title rule. Care has no
 *  stage pigment (`--tab-*` stops at install), so its title takes no rule. */
const TITLE_RULE_STAGE: Partial<Record<SectionKey, string>> = {
  brief: 'st-brief',
  discovery: 'st-discovery',
  direction: 'st-direction',
  proposal: 'st-proposal',
  project: 'st-project',
  install: 'st-install',
};

export function DocLetterhead({
  title,
  vitals,
  fill,
  client,
  subject,
  projectId = null,
  instruments = null,
  stageWord,
  stage,
}: {
  title: string;
  /** The paper's stage: its pigment draws the 3px rule beside the title. */
  stage?: SectionKey;
  vitals: string;
  /** FR3 F3-12 (`one-voice`) — the project vitals print this stage word
   *  (`Install`) where they printed the workflow phase (`Installation`). */
  stageWord?: string;
  /** R15: the mark as progress device — how far the engagement has come. */
  fill?: FillState;
  /** The client this document is for — the clickable HouseholdChip, rendered as
   *  a prominent subtitle in the title block (not a tiny line below it). */
  client?: ReactNode;
  /** R4 — the engagement's one-line description, printed under the name and
   *  edited in place. Row 2 left, above the vitals. */
  subject?: ReactNode;
  /** R80: set on project documents — the title + vitals become self-save
   *  fields writing the projects row (blur-save, quiet per-field status). */
  projectId?: string | null;
  /** W3: the letterhead instruments' ledger — its own column at ≥1180. */
  instruments?: ReactNode;
}) {
  const round8 = useContext(Round8MarginContext);
  const titleBlock = projectId ? (
    <LetterheadTitle projectId={projectId} serverTitle={title} />
  ) : (
    /* R6 — 34px at every width. The 40px step and the negative
       tracking both went with it: 40px of Playfair spent ~11
       characters of a 390 measure, and the standing sentence, not the
       name, is the head's largest true fact. */
    <h1
      data-part="name"
      className="min-w-0 break-words font-heading text-[34px] font-medium leading-[1.08] text-[var(--text-primary)]"
    >
      {title}
    </h1>
  );
  const vitalsLine = projectId ? (
    <LetterheadVitals projectId={projectId} stageWord={stageWord} />
  ) : (
    vitals && (
      /* D5 — 15px, and it WRAPS. The clip trio said the line was one
         row long whatever it carried; a vital the paper cannot finish
         is not a vital. */
      <p
        data-letterhead-vitals
        data-part="f1"
        className="mt-1 text-[15px] text-[var(--text-muted)]"
      >
        {vitals}
      </p>
    )
  );

  if (round8) {
    // RC-4 D3 — the round-8 cover (Room Proof 08): kicker, serif title, the
    // italic subject, one facts line closed by its rule, then the
    // photograph's slot, which the ledger's Press band fills. No stage mark
    // and no title rule. The job type is the only kicker fact the paper
    // holds (there is no job number), so nothing else is printed there. With
    // the stage word in the kicker, the facts line does not repeat it.
    const stageInKicker = Boolean(projectId && stageWord);
    const kicker = projectId
      ? stageWord && stageWord !== 'Project'
        ? `Project · ${stageWord}`
        : 'Project'
      : stage
        ? STAGE_WORD[stage]
        : null;
    return (
      <header
        id="document-project-status"
        tabIndex={-1}
        data-part="head"
        data-r8-cover=""
        className="mb-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <div data-r8-cover-line="" className="r8-small">
          {kicker && <span data-r8-cover-kicker="">{kicker}</span>}
          {/* The chip prints nothing while no client is linked; the CSS then
              drops this span, so "Prepared" never stands alone. */}
          {client && <span data-r8-cover-client="">Prepared {client}</span>}
        </div>
        <div className="min-w-0">{titleBlock}</div>
        {subject}
        <div data-r8-cover-facts="" data-r8-stage-in-kicker={stageInKicker ? '' : undefined}>
          {vitalsLine}
        </div>
        {instruments && <div data-r8-cover-plate="">{instruments}</div>}
      </header>
    );
  }

  return (
    <header
      id="document-project-status"
      tabIndex={-1}
      // US-14 `head`: the arrival's landing focus for a terminal verb or no
      // act — a focus target only, never card text.
      data-part="head"
      className="doc-rule-mid mb-4 pb-[18px] pt-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <div data-part="crown" className="mb-2.5">
        <StrataMark state="active" size="lg" fill={fill} label={fill ? 'Document progress' : undefined} />
      </div>
      <div className="grid grid-cols-1 items-start gap-x-[1.5rem] gap-y-[0.5rem] min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        {/* Row 1 — the title, across BOTH tracks. D-B48: the heading is TEXT
            at rest and WRAPS at word boundaries, so a starved track stacks it
            rather than amputating it ("Aspen Lo"); the `<input>` appears only
            in edit mode, in the same box. Spanning the grid still hands it the
            whole measure. */}
        <div
          data-title-rule={stage && TITLE_RULE_STAGE[stage] ? stage : undefined}
          className={`min-w-0 min-[1180px]:col-span-2 ${
            stage && TITLE_RULE_STAGE[stage] ? `title-rule ${TITLE_RULE_STAGE[stage]}` : ''
          }`}
        >
          {titleBlock}
        </div>
        {/* Row 2, left — who it is for, and the vitals. */}
        <div className="min-w-0">
          {client}
          {subject}
          {vitalsLine}
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
