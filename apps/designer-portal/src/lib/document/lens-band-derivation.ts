/**
 * The lens band, derived — OD-1, OD-7, OD-8.
 *
 * Two lines, per spread kind. Line one is identity, stage and one right-flush
 * fact; line two is the worst standing exception with its act, or the stage's
 * guide sentence when nothing stands. Nothing here reads the viewport, the
 * network or the DOM: the band renders what this module returns.
 *
 * OD-8's reuse boundary: `ticket-derivation.ts` is byte-untouched. This module
 * reads `deriveTicket`'s rows for their `exception` and takes the household,
 * the stage and the printed figures from the caller, which already holds them.
 */

import type { RedLetterRow } from '@/components/document/red-letter-zone';
import {
  ACT_TIER,
  needActLabel,
  stageEyebrow,
  type ActTargetId,
  type ActTier,
  type OwnAct,
} from './act-names';
import type { NeedKind, NeedLine } from './desk-derivation';
import { clientShortName } from './document-guide';
import type { DocumentIndexKey } from './document-index';
import { familyLabel } from './family-label';
import type { InstallReading } from './install-reading';
import type { LensTier } from './lens-constants';
import {
  LENS_LINE2_GAP_PX,
  LENS_LINE2_MEASURE_PX,
  LENS_LINE2_PX_PER_CHAR,
  LENS_MONO_PX_PER_CHAR,
} from './lens-constants';
import {
  classOfStandingRow,
  selectNext,
  type SetupRow,
  type SetupRowKind,
  type StandingNeedRow,
} from './need-class';
import { needTieBreakRank } from './need-tie-break';
import type {
  TicketExceptionRank,
  TicketRow,
} from './ticket-derivation';

/** Which spread the paper is on. `deriveTicket`'s `SectionKey`, by another
 *  name, because the band prints a different line 1 for each. */
export type LensSpreadKind =
  | 'brief'
  | 'discovery'
  | 'direction'
  | 'proposal'
  | 'project'
  | 'install'
  | 'care';

export interface LensAct {
  /** N-05 — the act's own stable key, for telemetry. The printed LABEL is
   *  copy: it changes with the short form, with a rewording, with the tier. */
  key: string;
  label: string;
  /** D-B24 — what this act prints in the short form. Where the source states
   *  one it beats `shortenAct`, which can only cut the label it was given. */
  shortLabel?: string;
  onAct: () => void;
  /** R5 — the act's own work is in flight (the seed the leader runs). The band
   *  holds the control rather than letting it be pressed twice. */
  disabled?: boolean;
  /** D3 — offered, but this person cannot take it now. It stays in the tab
   *  order, `aria-disabled`, with its reason beneath; it is never Next (D2). */
  held?: LensHeld;
}

/** D3's gated act: one muted reason sentence, and the repair act beside it
 *  where one exists (`Link a client first.` · `Link a client`). */
export interface LensHeld {
  reason: string;
  repair?: LensAct;
}

/** D8 — whose hand a need's next move is in, as the desk rule recorded it. */
export type LensNeedOwner = NeedLine['owner'];

/** A red-letter row, with the owner its need was raised with where the caller
 *  carries it (D8 custody). */
export interface LensNeedRow extends RedLetterRow {
  owner?: LensNeedOwner;
}

/**
 * The four standing tiers. They are EYEBROW WORDS, not a ranking (W3-R1): the
 * sheet prints them as the row's kind line and the sort below never reads them
 * as an order. What they still say is which side of its day an item stands on
 * — `overdue` is past it, `decision-due` and `damage` are ahead of it, and
 * `po-silence` is a maker's quiet with no day behind it at all.
 */
export type LensStandingTier =
  | 'overdue'
  | 'decision-due'
  | 'damage'
  | 'po-silence';

/**
 * W3-R1 — where the item stands relative to its own deadline. `past` sorts
 * first (most days first), then `ahead` (soonest first), then `none` (a
 * silence, longest-standing first). A deadline exists only where the source
 * states a day count; a tier alone is not a deadline.
 */
export type LensDeadlineSense = 'past' | 'ahead' | 'none';

const SENSE_ORDER: Record<LensDeadlineSense, number> = {
  past: 0,
  ahead: 1,
  none: 2,
};

/** D-B24 — the 390 form: `<STATE> <DAYS>D · <SUBJECT>`, or `<STATE> · <SUBJECT>`
 *  when the source states no day count. */
const asLocalDate = (iso: string) =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);

const DAY_MS = 86_400_000;

/** Whole calendar days from `now` to `iso` — negative once the day has passed.
 *  Midnight-to-midnight, so "tomorrow" is 1 at any hour of either day. */
function calendarDaysUntil(iso: string, now: Date): number | null {
  const then = asLocalDate(iso);
  if (Number.isNaN(then.getTime())) return null;
  const thenMidnight = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  ).getTime();
  const nowMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.round((thenMidnight - nowMidnight) / DAY_MS);
}

export interface LensShortForm {
  state: string;
  days: number | null;
  subject: string;
}

export interface LensStandingItem {
  key: string;
  /** The sheet's kind line — the need's own stamp word (OD-6). */
  eyebrow: string;
  /** What stands, in the product's own words. Line 2 prints this one. */
  sentence: string;
  act: LensAct | null;
  tier: LensStandingTier;
  /** The day count the source states in its own prose, where it states one.
   *  A LAST RESORT for the distance — the desk prints dates, not counts. */
  days: number | null;
  /** N-01 — the ISO day this is due on, where the source holds one. */
  deadline: string | null;
  standingSince: string | null;
  /** W3-R1 — which side of its day this stands on, and how far. */
  sense: LensDeadlineSense;
  /** Days past (negative) or days ahead (positive); null for a silence. */
  distance: number | null;
  /** D-B26 — this item's sentence names the money figure line 1 would print,
   *  so line 1 drops its money half while line 2 is naming it. */
  namesMoney: boolean;
  /** W6-R1/F1 — the desk kind this item came from, where it came from a need.
   *  Null for a ticket exception, which has no kind. The short form's subject
   *  is chosen by it: a conflict's object is its DATE, an invoice's its code. */
  needKind: NeedKind | null;
  /** D8 — the need's recorded owner; null for a ticket exception, or where
   *  the caller did not carry one. */
  owner?: LensNeedOwner | null;
  /** D-B24 — the item's short form, for the 390 measure. */
  short: LensShortForm;
}

/**
 * W3-R2 — an open input on the paper's next stage. Not a standing exception:
 * it is a fact about what the stage is waiting for, and it prints in the
 * standing sheet's own `INPUT NEEDED · N` section rather than on the paper.
 */
export interface LensInputItem {
  key: string;
  /** The input's kind word — `SIGNATURE`, `BUDGET`. */
  eyebrow: string;
  /** `Client signature · Client · blocks Project activation`. */
  sentence: string;
  /** The guide's act, where the guide gives one. */
  act: LensAct | null;
  /** F2-7 — the need this count stands for, where one exists: the sheet row
   *  borrows that need's act (`2 overdue client decisions` → `Nudge Mei`). */
  needKind?: NeedKind | null;
}

/**
 * D10 — a row under the sheet's `SETUP` eyebrow (D2 class 3): something the
 * job has not been given yet, never something gone wrong. It is never the
 * band's left slot and never painted terracotta; it stands behind the door.
 */
export interface LensSetupItem {
  key: string;
  /** `schedule_unconfigured` arrives as a desk need; the rest have no kind. */
  setup: SetupRowKind | 'schedule_unconfigured';
  sentence: string;
  act: LensAct | null;
  /** `Link a client` opens the HouseholdSheet over this one. Every other
   *  setup act lands on the paper, so the sheet is put back before it runs. */
  opensSheet: boolean;
}

/** A setup fact the caller holds, with the press its act makes. The words are
 *  the derivation's, so every surface prints the row the same way. */
export interface LensSetupInput {
  kind: SetupRowKind;
  onAct: () => void;
}

/** D10 — the setup rows' own words: the sentence states the gap, the act is
 *  D3's plain act for it. */
const SETUP_WORDS: Record<SetupRowKind, { sentence: string; act: string }> = {
  no_client_linked: { sentence: 'No client linked', act: 'Link a client' },
  target_date_unset: { sentence: 'No target date set', act: 'Set dates' },
  budget_band_unset: { sentence: 'No budget band set', act: 'Set a budget band' },
};

/** D10 — a job that is finished or held asks for no client. */
const NO_CLIENT_SUPPRESSED = new Set(['completed', 'on_hold']);

/** The guide's line, as `document-guide.tsx` hands it over (C-6). */
export interface LensGuideLine {
  text: string;
  act: LensAct | null;
  /** D-B24 — the rung between: R2's grammar and the household's name, with
   *  the recital given up. Tried before the count, so a desktop reader is
   *  told WHO is waiting rather than only how many. */
  medium?: string | null;
  /** D-B24 — the guide's own 327 form. Without it a guide line had no second
   *  form at all: `fits()` was never consulted and the sentence was left to
   *  CSS ellipsis, which at 390 amputated the whole of it. */
  short?: string | null;
}

/** Where she is standing, and what that stop's own count line says (OD-7). */
export interface LensReadingStop {
  key: DocumentIndexKey;
  label: string;
  countLine: string;
}

export interface LensBandLine1 {
  /** The household, as the letterhead prints it. */
  identity: string;
  /** `PROCUREMENT & ORDERS 4 OF 6` — never the current stop's name. */
  stage: string | null;
  /** The right slot at s1+; absent on a spread with no dated or money fact. */
  rightFlush: string | null;
  /** What survives at s0, where the letterhead prints everything else. */
  moneyOnly: string | null;
}

/** One printable form of line 2 — the sentence and the act that go with it. */
export interface LensLine2Form {
  sentence: string;
  act: LensAct | null;
}

export interface LensBandLine2 {
  kind: 'standing' | 'guide' | 'none';
  /** The form that fit the tier's measure. */
  sentence: string;
  act: LensAct | null;
  /** Which of the three forms is printed (D-B24). */
  form: 'long' | 'medium' | 'short';
  /** The whole sentence with the whole act. */
  long: LensLine2Form;
  /** The middle rung, with the act's FULL label — the pairing tried first.
   *  Null on a line whose source states no medium form. */
  medium: LensLine2Form | null;
  /** D-B24's 390 form. Null only when neither the standing item nor the guide
   *  supplied one. */
  short: LensLine2Form | null;
  /** Every standing exception, every open input AND every setup row — the
   *  sheet's row count. */
  standingCount: number;
  /**
   * N-02 — what the `+N MORE` door prints. NOT `standingCount − 1`: line 2 only
   * takes a row off the door when it is NAMING one. On a guide line nothing on
   * the paper is a sheet row, so a guide with one open input prints `+1 MORE`
   * (W3-R2's own example) where the old arithmetic printed no door at all.
   *
   * D1 — an input the guide's act NAMES (`Add Working budget`) is not one of
   * these rows either. The exclusion is made HERE, against the kind line 2
   * actually resolved to: a standing exception outranking the guide leaves the
   * named input unnamed on the paper, and dropping it upstream then hid it
   * everywhere at once.
   */
  withheld: number;
  /**
   * W3-F7 — whether anything behind the door is a standing exception. The door
   * is painted in the register of what it withholds: terracotta for an
   * exception, clay where every withheld row is an open input (D1) or a setup
   * row (D10).
   */
  withheldHasException: boolean;
}

export interface LensBandModel {
  line1: LensBandLine1;
  line2: LensBandLine2;
  /** Every standing exception, ranked — the standing sheet's list (OD-6).
   *  Classes 1–2 only: setup (class 3) stands in `setup`. */
  standing: readonly LensStandingItem[];
  /** The open inputs — the sheet's `INPUT NEEDED · N` section (W3-R2). */
  inputs: readonly LensInputItem[];
  /** D10 — the sheet's `SETUP` group, at its foot. Never line 2. */
  setup: readonly LensSetupItem[];
  /** `Now at Pieces · 36 lines · 4 rooms · 1 damaged` (OD-7 / DL-03). */
  announcement: string | null;
  /** Slice 2 (`one-voice`, D2) — derived on every model, printed only behind
   *  the flag. */
  voice: LensVoice;
}

/**
 * The stage's own act (D1) — Next's third place (D2) — with the sentence line
 * 2 prints beside it when it is Next.
 */
export interface LensOwnAct {
  key: string;
  label: string;
  /** The control a press lands on (L-10). Null where the press runs its own
   *  landing (R5's Retry). */
  targetId: ActTargetId | null;
  tier: ActTier;
  /** 498-c — the region's own status sentence (`3 lines unspecified.`), or
   *  null where the region states none: the act then prints alone. Never the
   *  guide line. */
  sentence: string | null;
  shortSentence?: string | null;
  onAct: () => void;
  disabled?: boolean;
  held?: LensHeld;
}

/** The act Next names: the label every surface prints (D1), and its D3 tier. */
export interface LensNextAct extends Omit<LensAct, 'shortLabel'> {
  targetId: ActTargetId | null;
  tier: ActTier;
}

/** D2 — the one thing the band names on line 2's left. The dock (D7) prints
 *  the same act in the same words. */
export interface LensNext {
  /** Empty where the act prints alone (498-c: an own act with no status). */
  sentence: string;
  /** D-B24 / W6-R1 — the 390 form. The act is never shortened (D1: never the
   *  bare `Record`). */
  shortSentence: string;
  act: LensNextAct;
  /** The sheet row Next names, so the door does not count it twice. Null for
   *  the stage's own act, which is no sheet row. */
  rowKey: string | null;
}

/** One printable form of the voice's line 2. `act` is F2-4's last rung: the
 *  lead and the act, the sentence given up whole. */
export interface LensVoiceRung {
  form: LensBandLine2['form'] | 'act';
  /** `Next ─` beside the long sentence and the act alone, `Next` beside the
   *  short one and alone while the own act loads; null where no Next prints
   *  (a closed or held job). */
  lead: string | null;
  /** Next's, in the form that fit; the hold sentence; or today's line-2
   *  sentence where there is no Next. */
  sentence: string;
}

export interface LensVoice extends LensVoiceRung {
  /** Line 1, left (D1, F2-1): `Project · Chen Residence` — the JOB's name,
   *  never the household — `Project · On hold`, `Care · Closed`. Caps in CSS;
   *  never a count. */
  eyebrow: string;
  /** F2-1 — the eyebrow's two halves: the stage word never clips, the name
   *  may ellipsise. Null where there is no name to print. */
  eyebrowStage: string;
  eyebrowDetail: string | null;
  /** Line 1, right — the agreed figure, yielding where Next names it (D-B26). */
  rightFlush: string | null;
  moneyOnly: string | null;
  next: LensNext | null;
  /** F2-4 — the printed form first, then every form below it in yield order:
   *  the band measures the printed sentence and drops a rung while it clips.
   *  The act never yields. */
  rungs: readonly LensVoiceRung[];
  /** `Standing · N` — every sheet row minus the one Next names. 0 is silence. */
  standingCount: number;
  /** F2-22 — a class-1 row (money or a signature) stands behind the door, Next
   *  excluded: the door's terracotta. Clay otherwise. */
  doorClassOne: boolean;
  /** D2 at 390 — the measure cannot fit the door after the act, so the band
   *  prints Next alone and the dock's More carries `Standing · N` (SQ-2C). */
  doorInDock: boolean;
  /** The sheet's exception rows, each act named from the one table (D1), each
   *  row carrying its own act where one can be named (F2-7). */
  standing: readonly LensStandingItem[];
  /** The open inputs behind the door; they file under `NEEDS YOU` (D2). */
  inputs: readonly LensInputItem[];
  /** The sheet's `SETUP` rows — none on a closed or held job (F2-10, F2-11). */
  setup: readonly LensSetupItem[];
}

export interface LensBandInput {
  spreadKind: LensSpreadKind;
  /** `deriveTicket(input)` — read for `row.exception` only (OD-8). */
  ticket: readonly TicketRow[];
  /** The red letter's rows, as `page.tsx` composes them. */
  needs: readonly LensNeedRow[];
  /** The stage's open inputs, from the guide model (C-6, W3-R2). ALL of them:
   *  the D1 exclusion is made below, against the kind line 2 resolves to. */
  inputs?: readonly LensInputItem[];
  /** D1 — the key of the input the guide's act names, where it names one. */
  namedInputKey?: string | null;
  guide: LensGuideLine | null;
  /** D-B24 — which measure line 2 has to fit. The page's own media tier. */
  tier: LensTier;
  /** N-01 — the day the deadlines are measured against. Injected so a test can
   *  state it and so the model does not change under the reader at midnight. */
  now?: Date;
  household: string;
  /** F2-1 — the job's own name (`Chen Residence`), the voice's line 1. Never
   *  the household. */
  jobName?: string | null;
  /** 499-1 — the client's first name, through the placeholder guard; null
   *  where there is none. Left out, it is read from the household. */
  clientFirstName?: string | null;
  /** `Procurement & Orders`, `Proposal`, `Brief` — the stage, never the stop. */
  stageWord: string;
  stageIndex: { position: number; of: number } | null;
  /** `SEP 15` — the install day, already formatted by the caller. */
  installDate: string | null;
  /** `$17,500 OUT` — the money row's emphasis figure. */
  moneyFigure: string | null;
  /** The proposal's own investment total (DL-01), not an FF&E budget. */
  proposalInvestment: string | null;
  /** `AUG 19` — the day the proposal went out. */
  sentDate: string | null;
  readingStop?: LensReadingStop | null;
  /** D10 — the setup facts the caller holds (no client linked, no target, no
   *  budget band), each with its press. Unset values only. */
  setup?: readonly LensSetupInput[];
  /** D10 — `project_status`. `No client linked` is suppressed on a
   *  `completed` or `on_hold` job. */
  projectStatus?: string | null;
  /** D1 — the stage's own act, from `ownAct()` and the facts it reads; null
   *  states the stage has none. Left out, it is not known yet (500-5): the
   *  guide line never stands in for it (498-c). */
  ownAct?: LensOwnAct | null;
  /** D6 — the install reading; line 2 quotes it when its act is Next. */
  installReading?: InstallReading | null;
}

const STOP_WORDS = new Set(['A', 'AN', 'THE', 'OF', 'FOR', 'TO', 'WITH', 'ON']);

/**
 * The act, shortened to its VERB (C-07, D-B24): the first word after the
 * leading articles — `FOLLOW UP` → `FOLLOW`, `CHASE THE APPROVAL` → `CHASE`,
 * `FILE THE CLAIM` → `FILE`, `Chase Sturdy Oak` → `Chase`.
 *
 * The old rule kept the LAST word, which printed `UP` for `FOLLOW UP` and a
 * maker's surname for `Chase Sturdy Oak` — a press whose word names nothing.
 */
export function shortenAct(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const kept = words.filter((word) => !STOP_WORDS.has(word.toUpperCase()));
  return kept[0] ?? words[0] ?? label;
}

/** Words that qualify the object without naming it — `Primary bedroom
 *  approval` is about the bedroom, not about `Primary`. */
const SUBJECT_QUALIFIERS = new Set([
  'A',
  'AN',
  'THE',
  'FIRST',
  'SECOND',
  'GUEST',
  'MAIN',
  'NEW',
  'OLD',
  'OPEN',
  'PRIMARY',
  'THIS',
]);

/** `INV-2026-114`, `FDL-0912`, `PO-2026-0418` — a piece, an invoice or an
 *  order stating its own number. */
const CODE_TOKEN = /\b[A-Za-z]{2,4}-\d[\w-]*\b/;
const MONEY_TOKEN = /\$[\d,]+(?:\.\d+)?/;

/** A stated calendar day inside a sentence — `Sep 21`, `21 Sep`, `Sep 21, 2026`.
 *  W6-R1/F1: this is the OBJECT of a schedule conflict; the sentence's first
 *  word is its subject only by accident of grammar. */
const DATE_TOKEN =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\b/i;

/**
 * W6-R1 · F1 — the short form's subject is the need's OBJECT, chosen by KIND.
 *
 * The design lead's final walk found `…d7` at 390 printing `CONFLICT · TWO`
 * `RESOLVE`: a schedule conflict reads "Two milestones land on Sep 21", and
 * the generic rule took the first word long enough to qualify. "TWO" is a
 * quantity, not a subject — it names nothing the reader can act on, and the
 * one half of the short form she cannot reconstruct from the state word beside
 * it is exactly the subject.
 *
 * So each kind states where its object lives, and the generic scan is the
 * fallback for the kinds that have no better answer:
 *
 *   conflict / proposed date → the DATE (`SEP 21`)
 *   invoice, PO silence      → the CODE (`INV-2026-114`, `PO-0912`)
 *   damage                   → the PIECE (its code, else the head noun)
 *   decision                 → the room or subject noun
 *
 * Kept as `(sentence, kind)` rather than `(item)` so the ten existing call
 * sites that only have a sentence keep working and keep asserting the generic
 * rule, which is still what every unlisted kind gets.
 */
const SUBJECT_BY_KIND: Partial<Record<NeedKind, readonly ('date' | 'code' | 'money')[]>> = {
  schedule_conflict: ['date'],
  schedule_proposal: ['date'],
  overdue_invoice: ['code', 'money'],
  po_unacknowledged: ['code'],
  po_unsent: ['code'],
  damage_claim: ['code'],
};

/** D-B24 — the head noun of the item's object, capped at 12 characters: the
 *  room, the invoice number, the piece. Never the act's verb, never the owner. */
export function shortSubject(sentence: string, kind?: NeedKind): string {
  const preferred = kind ? SUBJECT_BY_KIND[kind] : undefined;
  if (preferred) {
    for (const source of preferred) {
      const found =
        source === 'date'
          ? DATE_TOKEN.exec(sentence)?.[0]
          : source === 'code'
            ? CODE_TOKEN.exec(sentence)?.[0]
            : MONEY_TOKEN.exec(sentence)?.[0];
      // A date prints as its own two tokens (`SEP 21`), never cut at 12 —
      // it is already shorter than the cap.
      if (found) return found.replace(/\s+/g, ' ').trim().toUpperCase();
    }
    // The kind named a source the sentence does not carry. Fall through to the
    // generic scan rather than print nothing — a missing subject is worse than
    // an imperfect one.
  }
  // The clause the object stands in. A comma inside a figure is not a clause
  // break, so the split only takes one that starts a new word.
  const lead = sentence.split(/\s+[·—]\s+|,\s+(?=[A-Za-z])/)[0] ?? sentence;
  const code = CODE_TOKEN.exec(sentence)?.[0];
  const money = MONEY_TOKEN.exec(lead)?.[0];
  const word = lead
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9$,.-]/g, ''))
    .find(
      (token) =>
        token.length >= 3 &&
        !/^\d/.test(token) &&
        !SUBJECT_QUALIFIERS.has(token.toUpperCase()),
    );
  const chosen = (code ?? money ?? word ?? lead.trim()).toUpperCase();
  if (chosen.length <= 12) return chosen;
  // N-08 — cut at a word boundary, never mid-word: `UNSPECIFIED LI` names
  // nothing, and a subject is the one half of the short form a reader cannot
  // reconstruct from the state word beside it.
  const cut = chosen.slice(0, 12);
  const boundary = cut.lastIndexOf(' ');
  return (boundary > 0 ? cut.slice(0, boundary) : cut).trim();
}

/** The need kinds that are something already past its day. */
const NEED_TIER: Record<NeedKind, LensStandingTier> = {
  overdue_decision: 'overdue',
  overdue_invoice: 'overdue',
  proposal_expired: 'overdue',
  claim_window: 'damage',
  damage_claim: 'damage',
  po_unacknowledged: 'po-silence',
  po_unsent: 'po-silence',
  proposal_signed: 'decision-due',
  proposal_declined: 'decision-due',
  lines_flagged: 'decision-due',
  new_lead: 'decision-due',
  ceremony_pending: 'decision-due',
  reconnect_due: 'decision-due',
  hesitating_proposal: 'decision-due',
  awaiting_inspection: 'decision-due',
  schedule_conflict: 'decision-due',
  schedule_proposal: 'decision-due',
  task_due: 'decision-due',
  schedule_unconfigured: 'decision-due',
  pulse_due: 'decision-due',
  payment_due: 'overdue',
  payment_failed: 'overdue',
  ack_discrepancy: 'decision-due',
  quote_expiring: 'decision-due',
  cfa_pending: 'decision-due',
  memo_return: 'decision-due',
  exception_open: 'damage',
  return_by: 'decision-due',
};

/** The sheet's kind line — the need's own stamp word, `desk-derivation.ts`. */
const NEED_EYEBROW: Record<NeedKind, string> = {
  overdue_decision: 'DECISION DUE',
  overdue_invoice: 'PAST DUE',
  proposal_expired: 'EXPIRED',
  claim_window: 'CLAIM WINDOW',
  damage_claim: 'CLAIM OPEN',
  po_unacknowledged: 'NO ACK',
  po_unsent: 'NOT SENT',
  proposal_signed: 'SIGNED',
  proposal_declined: 'DECLINED',
  lines_flagged: 'FLAGGED',
  new_lead: 'NEW LEAD',
  ceremony_pending: 'INTRODUCTION',
  reconnect_due: 'RECONNECT',
  hesitating_proposal: 'HESITATING',
  awaiting_inspection: 'AWAITING INSPECTION',
  schedule_conflict: 'CONFLICT',
  schedule_proposal: 'PROPOSED DATE',
  task_due: 'TASK DUE',
  schedule_unconfigured: 'SET UP',
  pulse_due: 'PULSE DUE',
  payment_due: 'PAYMENT DUE',
  payment_failed: 'NOT PAID',
  ack_discrepancy: 'ACK MISMATCH',
  quote_expiring: 'PRICE AGING',
  cfa_pending: 'CFA PENDING',
  memo_return: 'MEMO RETURN',
  exception_open: 'EXCEPTION',
  return_by: 'RETURN BY',
};

/** After rank 4, the desk's last. */
const TICKET_TIE_BREAK = 5;

/** A ticket row's exception, in the same four tiers. `RANK_ORDER`'s first two
 *  ranks are things past their day; a stuck piece is the maker's silence. */
const TICKET_TIER: Record<TicketExceptionRank, LensStandingTier> = {
  'money-at-risk': 'overdue',
  'promise-past-due': 'overdue',
  'piece-stuck': 'po-silence',
};

const TICKET_EYEBROW: Record<TicketExceptionRank, string> = {
  'money-at-risk': 'AT RISK',
  'promise-past-due': 'PAST DUE',
  'piece-stuck': 'STUCK',
};

/** `overdue 6 days`, `14 days`, `unopened 6d` — the day count the source
 *  states, so the worst of a tier is the one that has stood longest. */
function statedDays(text: string): number | null {
  const match = /(\d+)\s*(?:d\b|days?\b)/i.exec(text);
  return match ? Number(match[1]) : null;
}

const normalise = (sentence: string) =>
  sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * D-B24's state words. A thing past its day is `OVERDUE` whatever kind it is —
 * the mockup's `OVERDUE 6D · BEDROOM` is an overdue DECISION. Everything else
 * keeps its own stamp word, shortened only where the sheet's word is too long
 * for the 390 measure.
 */
const SHORT_STATE: Record<string, string> = {
  'AWAITING INSPECTION': 'INSPECT',
};

function shortState(eyebrow: string, sense: LensDeadlineSense): string {
  if (sense === 'past') return 'OVERDUE';
  return SHORT_STATE[eyebrow] ?? eyebrow;
}

/**
 * W3-R1 / N-01 — which side of its day an item stands on, and how far.
 *
 * The distance comes from the STRUCTURED deadline the source holds, measured
 * against an injected `now`. The regex over the printed sentence is the last
 * resort only: the desk's templates print dates ("— oldest due Aug 23"), so a
 * scrape finds nothing and every overdue item collapses to the same distance,
 * which is the sort going inert on real data.
 *
 * A `po-silence` is a silence whatever date it carries: `po_unacknowledged`
 * sets `dueOn` from the PO's SENT day, which is provenance, not a deadline —
 * and W3-R1 ranks a maker's fourteen-day quiet last, below a window closing
 * tomorrow. When nothing dates the item, an `overdue` tier still stands past
 * its day (distance 0, behind everything that states how far past it is).
 */
function deadlineOf(
  tier: LensStandingTier,
  deadline: string | null,
  statedDayCount: number | null,
  now: Date,
): { sense: LensDeadlineSense; distance: number | null } {
  if (tier === 'po-silence') return { sense: 'none', distance: null };
  const structured = deadline != null ? calendarDaysUntil(deadline, now) : null;
  const scraped =
    statedDayCount == null
      ? null
      : tier === 'overdue'
        ? -statedDayCount
        : statedDayCount;
  const days = structured ?? scraped;
  if (days == null) {
    return tier === 'overdue'
      ? { sense: 'past', distance: 0 }
      : { sense: 'none', distance: null };
  }
  return days < 0 ? { sense: 'past', distance: days } : { sense: 'ahead', distance: days };
}

/**
 * Every standing exception the document is carrying, ranked worst first —
 * the whole set, never `deriveTicketSeam`'s two (OD-8, F50).
 *
 * Both sources speak: the red letter's needs carry their own acts, the ticket's
 * rows carry the exceptions the desk's needs do not reach. A sentence that
 * arrives from both is printed once, the need's copy winning because it is the
 * one holding an act.
 */
export function rankStanding(
  rows: readonly TicketRow[],
  needs: readonly LensNeedRow[],
  /** N-01 — injected, never read off the clock in here: a derivation that
   *  reads `Date.now()` cannot be tested at a stated day and re-renders into
   *  a different answer at midnight. */
  now: Date = new Date(),
): LensStandingItem[] {
  const items: { item: LensStandingItem; tieBreak: number }[] = [];
  const seen = new Set<string>();

  const compose = (
    parts: Omit<LensStandingItem, 'sense' | 'distance' | 'short'>,
  ): LensStandingItem => {
    const { sense, distance } = deadlineOf(
      parts.tier,
      parts.deadline,
      parts.days,
      now,
    );
    // N-01 — the short form's day count is the SAME distance the sort used, so
    // `OVERDUE 7D` cannot disagree with the order it was ranked in.
    const days =
      distance != null && distance !== 0 ? Math.abs(distance) : null;
    return {
      ...parts,
      sense,
      distance,
      short: {
        state: shortState(parts.eyebrow, sense),
        days,
        // W6-R1/F1 — by KIND where the kind knows where its object lives.
        subject: shortSubject(parts.sentence, parts.needKind ?? undefined),
      },
    };
  };

  // Input order is the desk's own ranking; the sort below is stable on it.
  needs.forEach((need) => {
    const fingerprint = normalise(need.text);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    items.push({
      tieBreak: needTieBreakRank(need.kind),
      item: compose({
        key: `need:${need.key}`,
        eyebrow: NEED_EYEBROW[need.kind],
        sentence: need.text,
        act: need.actionLabel
          ? { key: need.key, label: need.actionLabel, onAct: need.onAct }
          : null,
        tier: NEED_TIER[need.kind],
        days: statedDays(need.text),
        deadline: need.dueOn ?? null,
        standingSince: null,
        namesMoney: need.kind === 'overdue_invoice',
        needKind: need.kind,
        owner: need.owner,
      }),
    });
  });

  rows.forEach((row) => {
    const exception = row.exception;
    if (!exception) return;
    const fingerprint = normalise(exception.phrase);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    items.push({
      // A ticket exception carries no NeedKind, so it has no desk rank; it
      // breaks after every need the desk did rank.
      tieBreak: TICKET_TIE_BREAK,
      item: compose({
        key: `ticket:${row.key}`,
        eyebrow: TICKET_EYEBROW[exception.rank],
        sentence: exception.phrase,
        // A-11: this lane may not mint an act. A ticket exception the desk did
        // not also raise prints its sentence and opens nothing.
        act: null,
        // W6-R1/F1 — no desk kind, so the generic head-noun scan is its
        // subject, exactly as before.
        needKind: null,
        tier: TICKET_TIER[exception.rank],
        days: statedDays(exception.phrase),
        // OD-8 keeps `ticket-derivation.ts` byte-untouched, and a ticket
        // exception states only when it BEGAN standing, never when it is due.
        deadline: null,
        standingSince: exception.standingSince,
        namesMoney: row.key === 'money',
      }),
    });
  });

  // W3-R1 — deadline distance, not kind. Past their day first (most days
  // first), then a deadline ahead (soonest first), then the silences (longest
  // standing first). The desk's tie-break speaks only inside equal distance.
  return items
    .map((entry, order) => ({ ...entry, order }))
    .sort((a, b) => {
      const deadline = compareDeadline(a.item, b.item);
      if (deadline !== 0) return deadline;
      if (a.tieBreak !== b.tieBreak) return a.tieBreak - b.tieBreak;
      return a.order - b.order;
    })
    .map((entry) => entry.item);
}

/**
 * W3-R1's deadline order between two standing items: past their day first
 * (most days first), then a deadline ahead (soonest first), then the silences
 * (longest standing first). 0 when the deadline cannot tell them apart; the
 * caller breaks that tie. Exported so the D2 class order (`need-class.ts`)
 * sorts inside a class by this same order.
 */
export function compareDeadline(
  a: Pick<LensStandingItem, 'sense' | 'distance' | 'standingSince'>,
  b: Pick<LensStandingItem, 'sense' | 'distance' | 'standingSince'>,
): number {
  const sense = SENSE_ORDER[a.sense] - SENSE_ORDER[b.sense];
  if (sense !== 0) return sense;
  const aDistance = a.distance;
  const bDistance = b.distance;
  if (aDistance != null && bDistance != null && aDistance !== bDistance) {
    return aDistance - bDistance;
  }
  // "Longest-standing first" is the SILENCES' order: they have no deadline
  // to sort on, so the day they started standing is all there is.
  if (a.sense === 'none') {
    const aSince = a.standingSince;
    const bSince = b.standingSince;
    if (aSince !== bSince) {
      if (aSince == null) return 1;
      if (bSince == null) return -1;
      return aSince < bSince ? -1 : 1;
    }
  }
  return 0;
}

/** The stage phrase — `PROCUREMENT & ORDERS 4 OF 6`, `PROPOSAL`, `BRIEF`. */
function stagePhrase(input: LensBandInput): string | null {
  const word = input.stageWord.trim();
  if (!word) return null;
  const phrase = input.stageIndex
    ? `${word} ${input.stageIndex.position} OF ${input.stageIndex.of}`
    : word;
  return phrase.toUpperCase();
}

/** The right slot, per spread kind (OD-1, and the print contract's table). */
function rightSlot(
  input: LensBandInput,
  moneyIsTheStop: boolean,
  /** D-B26 — line 2's worst item names the money, so line 1 does not print it
   *  twice. The same yield the Money reading stop already takes. */
  lineTwoNamesMoney: boolean,
): { rightFlush: string | null; moneyOnly: string | null } {
  const money = moneyIsTheStop || lineTwoNamesMoney ? null : input.moneyFigure;
  const parts: string[] = [];

  switch (input.spreadKind) {
    case 'project':
    case 'install':
      if (input.installDate) parts.push(`INSTALL ${input.installDate}`);
      if (money) parts.push(money);
      break;
    case 'care':
      // Nothing is installed after install; the right slot carries money or
      // stands empty, which is honest.
      if (money) parts.push(money);
      break;
    case 'proposal':
      if (input.sentDate) parts.push(`SENT ${input.sentDate}`);
      if (input.proposalInvestment) parts.push(input.proposalInvestment);
      break;
    default:
      // brief · discovery · direction — no dated or money fact exists on these
      // spreads (E1 §4, A-06). The slot is absent, never a fallback string.
      return { rightFlush: null, moneyOnly: null };
  }

  const rightFlush = parts.length > 0 ? parts.join(' · ').toUpperCase() : null;
  const figure =
    input.spreadKind === 'proposal' ? input.proposalInvestment : money;
  return {
    rightFlush,
    moneyOnly: figure ? figure.toUpperCase() : null,
  };
}

/** D-B24 — the sentence's own width in the band's type. */
const sentencePx = (sentence: string) =>
  sentence.length * LENS_LINE2_PX_PER_CHAR;

/** The act and the `+N MORE` door are mono, and neither ever truncates. */
const monoPx = (label: string) => label.length * LENS_MONO_PX_PER_CHAR;

/** D-B24 — a standing item's 390 form: `<STATE> <DAYS>D · <SUBJECT>`. */
const shortSentenceOf = (item: LensStandingItem) =>
  item.short.days == null
    ? `${item.short.state} · ${item.short.subject}`
    : `${item.short.state} ${item.short.days}D · ${item.short.subject}`;

/** D2's door, in its own words: the word and the count, nothing else. */
export const standingDoorLabel = (count: number) => `Standing · ${count}`;

/** D1 — a need's act is named from the one table, whatever its source printed,
 *  with the client's first name where the act names her (499-1: `Nudge Mei`;
 *  `the client` only as the family fallback). A ticket exception has no kind,
 *  and no act to rename. */
function voiceItem(item: LensStandingItem, clientFirstName: string | null): LensStandingItem {
  if (!item.act || !item.needKind) return item;
  return {
    ...item,
    act: { ...item.act, label: needActLabel(item.needKind, clientFirstName) },
  };
}

/** The desk's `payment_due` line (`desk-derivation.ts`, PAYMENT_KIND_WORD):
 *  `Balance to Woodward & Sons · $3,400 due 12 May — WS-188`. The need holds
 *  no structured payee, figure or PO, so the band reads its own template back.
 *  The figure and the day are each optional; anything else is not this line. */
const PAYMENT_LINE =
  /^(Payment in full|Deposit|Balance|Payment) to (.+?)(?: · (\$[\d,]+(?:\.\d+)?))? due(?: [^—]+?)? — (.+)$/;

const dayCount = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * 498-j — the payment Next as prose, not the Desk's ledger cell:
 * `Pay Woodward & Sons the WS-188 balance, $3,400 — 148 days overdue.` and
 * `WS-188 balance, 148 days overdue.` Every part is read from the need; a
 * line the template does not describe keeps its own words (null).
 */
function paymentProse(
  item: LensStandingItem,
): { sentence: string; shortSentence: string } | null {
  if (item.needKind !== 'payment_due') return null;
  const match = PAYMENT_LINE.exec(item.sentence);
  if (!match) return null;
  const [, word, payee, figure, po] = match;
  const what = `${po} ${word.toLowerCase()}`;
  const distance = item.distance;
  // DESIGN-Q (SQ-512): 498-j states the overdue form only; a payment not yet
  // due reads `due today` / `due in N days`, and an undated one names no day.
  const when =
    item.sense === 'past' && distance != null && distance < 0
      ? `${dayCount(-distance)} overdue`
      : item.sense === 'ahead' && distance != null
        ? distance === 0
          ? 'due today'
          : `due in ${dayCount(distance)}`
        : null;
  const sentence = `Pay ${payee} the ${what}${figure ? `, ${figure}` : ''}${
    when ? ` — ${when}` : ''
  }.`;
  const shortSentence = `${what}${when ? `, ${when}` : ''}.`;
  return { sentence, shortSentence };
}

/** F2-7 — the ticket's Pieces clause for a maker's silence. */
const UNANSWERED_PO = / unanswered, \d+ days?$/;
/** F2-7 — the ticket's Spec clause. */
const UNSPECIFIED = /^(\d+) unspecified$/;

/**
 * F2-7 / 498-e — every sheet row carries its own act. A ticket exception may
 * not mint one (A-11), so it carries the act the paper already holds for the
 * same fact: `3 unspecified` the stage's `Spec the 3 unspecified`, a PO's
 * silence the standing `po_unacknowledged` need's `Follow up with the maker`,
 * an input that counts a need that need's act. Where the paper holds none, the
 * row keeps none. Next is chosen before this and never from a borrowed act.
 */
function borrowedAct(
  key: string,
  sentence: string,
  needKind: NeedKind | null | undefined,
  voiced: readonly LensStandingItem[],
  ownAct: LensOwnAct | null,
): LensAct | null {
  const actOfKind = (kind: NeedKind) =>
    voiced.find((item) => item.needKind === kind && item.act)?.act ?? null;
  if (needKind) return actOfKind(needKind);
  if (key === 'ticket:pieces' && UNANSWERED_PO.test(sentence)) {
    return actOfKind('po_unacknowledged');
  }
  const unspecified = key === 'ticket:spec' ? UNSPECIFIED.exec(sentence) : null;
  if (unspecified && ownAct?.label === `Spec the ${unspecified[1]} unspecified`) {
    return {
      key: ownAct.key,
      label: ownAct.label,
      onAct: ownAct.onAct,
      disabled: ownAct.disabled,
      held: ownAct.held,
    };
  }
  return null;
}

/** D8 — custody, only as a recorded owner allows it. The studio's own pen
 *  prints nothing: "yours" never names a person. */
function withCustody(
  sentence: string,
  owner: LensNeedOwner | null | undefined,
  clientFirstName: string | null,
): string {
  if (owner === 'client') return `Waiting on ${clientFirstName ?? 'the client'}: ${sentence}`;
  if (owner === 'maker') return `With the maker: ${sentence}`;
  return sentence;
}

const nextAct = (act: LensAct, targetId: ActTargetId | null, tier: ActTier): LensNextAct => ({
  key: act.key,
  label: act.label,
  onAct: act.onAct,
  disabled: act.disabled,
  held: act.held,
  targetId,
  tier,
});

/** A setup row has no deadline: it is something not yet given, not late. */
const NO_DEADLINE = { sense: 'none', distance: null, standingSince: null } as const;

export interface DeriveNextInput {
  /** The sheet's exception rows, classes 1–2, ranked (`deriveLensBand`'s). */
  standing: readonly LensStandingItem[];
  /** The sheet's `SETUP` rows (class 3). */
  setup?: readonly LensSetupItem[];
  /** The stage's own act (D1), or null where the stage has none. */
  ownAct: LensOwnAct | null;
  /** D6 — when the reading's act is Next, the sentence quotes the reading. */
  installReading?: InstallReading | null;
  /** D8 — the client's first name; null where only a placeholder stands. */
  clientFirstName: string | null;
  /** A closed job prints no Next (D2). */
  closed: boolean;
}

/**
 * D2's Next — the one act line 2 names, and the one the phone dock's centre
 * repeats (D7). Built on `selectNext`: class 1, then class 2, then the stage's
 * own act, then setup; the first the person can take. A row with no act, or a
 * held one, cannot be taken, so it stands in the sheet and is never Next.
 */
export function deriveNext({
  standing,
  setup = [],
  ownAct,
  installReading = null,
  clientFirstName,
  closed,
}: DeriveNextInput): LensNext | null {
  type Row = (StandingNeedRow | SetupRow) & { next: LensNext | null };
  const rows: Row[] = [
    ...standing.map((item): Row => {
      const { act } = voiceItem(item, clientFirstName);
      const prose = paymentProse(item);
      return {
        needKind: item.needKind,
        tier: item.tier,
        sense: item.sense,
        distance: item.distance,
        standingSince: item.standingSince,
        next: act
          ? {
              sentence: withCustody(
                prose?.sentence ?? item.sentence,
                item.owner,
                clientFirstName,
              ),
              shortSentence: prose?.shortSentence ?? shortSentenceOf(item),
              act: nextAct(act, null, ACT_TIER[act.label] ?? 'plain'),
              rowKey: item.key,
            }
          : null,
      };
    }),
    ...setup.map((item): Row => {
      const next = item.act
        ? {
            sentence: item.sentence,
            shortSentence: item.sentence,
            act: nextAct(item.act, null, ACT_TIER[item.act.label] ?? 'plain'),
            rowKey: item.key,
          }
        : null;
      return item.setup === 'schedule_unconfigured'
        ? { needKind: 'schedule_unconfigured', tier: 'decision-due', ...NO_DEADLINE, next }
        : { setup: item.setup, ...NO_DEADLINE, next };
    }),
  ];

  const choice = selectNext<Row>({
    needs: rows,
    // `selectNext` only places the own act; it never reads the landing, which
    // R5's Retry does not have.
    ownAct: ownAct
      ? ({ label: ownAct.label, tier: ownAct.tier, targetId: ownAct.targetId } as OwnAct)
      : null,
    canTake: (choice) =>
      choice.kind === 'own'
        ? !ownAct?.held
        : Boolean(choice.row.next && !choice.row.next.act.held),
    closed,
  });
  if (!choice) return null;
  if (choice.kind === 'need') return choice.row.next;
  if (!ownAct) return null;

  const quoted = Boolean(installReading?.act && installReading.act.label === ownAct.label);
  // 498-c — the region's status where it states one, else the act alone.
  const sentence =
    quoted && installReading ? installReading.sentence : (ownAct.sentence ?? '');
  return {
    sentence,
    shortSentence: quoted ? sentence : (ownAct.shortSentence ?? sentence),
    act: nextAct(ownAct, ownAct.targetId, ownAct.tier),
    rowKey: null,
  };
}

/** The household as line 1 prints it: through the placeholder guard (FR1 F9),
 *  so a seeded `Client User` reads `the client`; nothing when there is none. */
function printedHousehold(household: string): string {
  return household.trim() ? familyLabel(household) : '';
}

/**
 * F14 / R20 — on a Direction or Proposal paper the open inputs are the
 * proposal's own missing pieces: one row, `The proposal needs N inputs`,
 * carrying D1's Direction act where the paper offers it, never a
 * `… · blocks Client proposal` row per gap.
 */
const PROPOSAL_INPUTS_KEY = 'proposal-inputs';
const WRITE_THE_PROPOSAL = 'Write the proposal';

function proposalInputs(input: LensBandInput): readonly LensInputItem[] {
  const all = input.inputs ?? [];
  if (all.length === 0) return all;
  if (input.spreadKind !== 'direction' && input.spreadKind !== 'proposal') return all;
  const write =
    [input.ownAct, input.guide?.act].find((act) => act?.label === WRITE_THE_PROPOSAL) ?? null;
  return [
    {
      key: PROPOSAL_INPUTS_KEY,
      eyebrow: '',
      sentence: `The proposal needs ${all.length} input${all.length === 1 ? '' : 's'}`,
      act: write
        ? { key: write.key, label: WRITE_THE_PROPOSAL, onAct: write.onAct, disabled: write.disabled }
        : null,
    },
  ];
}

/** D1 — whether the act line 2 prints is the one this input row stands for. */
function namesInput(
  item: LensInputItem,
  namedInputKey: string | null | undefined,
  printedActLabel: string | null | undefined,
): boolean {
  return item.key === PROPOSAL_INPUTS_KEY
    ? printedActLabel === WRITE_THE_PROPOSAL
    : item.key === namedInputKey;
}

export function deriveLensBand(input: LensBandInput): LensBandModel {
  const ranked = rankStanding(input.ticket, input.needs, input.now);
  // D2 / D10 — setup (class 3) never takes line 2: it stands in the sheet's
  // `SETUP` group, so the winner is chosen from classes 1–2 alone and a quiet
  // job falls through to the stage's own guide line.
  const standing = ranked.filter((item) => classOfStandingRow(item) !== 3);
  const setup: LensSetupItem[] = [
    ...ranked
      .filter((item) => classOfStandingRow(item) === 3)
      .map(
        (item): LensSetupItem => ({
          key: item.key,
          setup: 'schedule_unconfigured',
          sentence: item.sentence,
          act: item.act,
          opensSheet: false,
        }),
      ),
    ...(input.setup ?? [])
      .filter(
        (row) =>
          row.kind !== 'no_client_linked' ||
          !NO_CLIENT_SUPPRESSED.has(input.projectStatus ?? ''),
      )
      .map(
        (row): LensSetupItem => ({
          key: `setup:${row.kind}`,
          setup: row.kind,
          sentence: SETUP_WORDS[row.kind].sentence,
          act: {
            key: `setup:${row.kind}`,
            label: SETUP_WORDS[row.kind].act,
            onAct: row.onAct,
          },
          opensSheet: row.kind === 'no_client_linked',
        }),
      ),
  ];
  const worst = standing[0] ?? null;
  const kind: LensBandLine2['kind'] = worst
    ? 'standing'
    : input.guide
      ? 'guide'
      : 'none';
  const allInputs = proposalInputs(input);
  // D1 — only a GUIDE line names an open input. On a standing line the guide's
  // act is not printed at all, so every input stays behind the door.
  const inputs =
    kind === 'guide'
      ? allInputs.filter(
          (item) => !namesInput(item, input.namedInputKey, input.guide?.act?.label),
        )
      : allInputs;
  const readingStop = input.readingStop ?? null;
  const { rightFlush, moneyOnly } = rightSlot(
    input,
    readingStop?.key === 'money',
    Boolean(worst?.namesMoney),
  );

  const line1: LensBandLine1 = {
    identity: printedHousehold(input.household).toUpperCase(),
    stage: stagePhrase(input),
    rightFlush,
    moneyOnly,
  };

  // W3-R2 — the door counts the open inputs too: at every offset they are one
  // press away, in the sheet's own section.
  const standingCount = standing.length + inputs.length + setup.length;
  // N-02 — line 2 discounts a row only when it is naming one.
  const withheld = standingCount - (worst ? 1 : 0);
  // W3-F7 — every standing exception except the one line 2 is naming.
  const withheldHasException = (worst ? standing.length - 1 : standing.length) > 0;

  const long: LensLine2Form = {
    sentence: worst ? worst.sentence : (input.guide?.text ?? ''),
    act: worst ? worst.act : (input.guide?.act ?? null),
  };
  /** D-B24 — the act at the short measure: the source's own short label where
   *  it states one, else the label cut to its verb. */
  const shortAct = (act: LensAct | null): LensAct | null =>
    act
      ? {
          key: act.key,
          label: act.shortLabel ?? shortenAct(act.label),
          onAct: act.onAct,
          disabled: act.disabled,
        }
      : null;
  const short: LensLine2Form | null = worst
    ? { sentence: shortSentenceOf(worst), act: shortAct(worst.act) }
    : input.guide?.short
      ? { sentence: input.guide.short, act: shortAct(input.guide.act) }
      : null;
  // Only a guide line has a medium rung: a standing item's short form is a
  // state and an object, with nothing between it and its whole sentence.
  const medium: LensLine2Form | null =
    !worst && input.guide?.medium
      ? { sentence: input.guide.medium, act: input.guide.act }
      : null;
  const mediumShort: LensLine2Form | null = medium
    ? { sentence: medium.sentence, act: shortAct(medium.act) }
    : null;

  // The door's own words print whole in both forms, so its width is spent
  // before the sentence gets its measure.
  const doorPx =
    withheld > 0 ? monoPx(`+${withheld} MORE`) + LENS_LINE2_GAP_PX : 0;
  // Never negative: past the point where the act and the door have eaten the
  // whole measure there is no form left to fall back to, and a negative budget
  // said "nothing fits" about a sentence that still has to be printed.
  const budgetPx = (act: LensAct | null) =>
    Math.max(
      0,
      LENS_LINE2_MEASURE_PX[input.tier] -
        doorPx -
        (act ? monoPx(act.label) + LENS_LINE2_GAP_PX : 0),
    );
  const fits = (form: LensLine2Form) =>
    sentencePx(form.sentence) <= budgetPx(form.act);

  // D-B24 — one trigger, three rungs: the whole sentence, then R2's grammar
  // with the recital given up, then the count. The medium rung is tried with
  // the act's own label first and with its short one second, because giving up
  // the act's words costs less than giving up the household's name. There is
  // no character cap: a cap calibrated for the 900px measure never fires
  // before CSS ellipsis at 327, which is how a sentence came to lie about
  // itself.
  const { form, printed } = ((): {
    form: 'long' | 'medium' | 'short';
    printed: LensLine2Form;
  } => {
    if (fits(long)) return { form: 'long', printed: long };
    if (medium && fits(medium)) return { form: 'medium', printed: medium };
    if (mediumShort && fits(mediumShort)) {
      return { form: 'medium', printed: mediumShort };
    }
    if (short) return { form: 'short', printed: short };
    // Nothing fits and there is no rung below: the sentence is printed anyway
    // and LINE_CLIP takes the overhang. An empty line 2 is never an answer.
    if (mediumShort) return { form: 'medium', printed: mediumShort };
    return { form: 'long', printed: long };
  })();

  const line2: LensBandLine2 = {
    kind,
    sentence: printed.sentence,
    act: printed.act,
    form,
    long,
    medium,
    short,
    standingCount,
    withheld,
    withheldHasException,
  };

  return {
    line1,
    line2,
    standing,
    inputs,
    setup,
    announcement: readingStop
      ? `Now at ${readingStop.label} · ${readingStop.countLine}`
      : null,
    voice: deriveVoice(input, { standing, setup, allInputs, line2 }),
  };
}

/** F2-10 — what a held job's line 2 says in place of Next. */
export const HELD_SENTENCE = 'Paused — nothing moves until it resumes.';

/**
 * Slice 2 (`one-voice`) — D1's eyebrow on line 1; D2's two fixed positions on
 * line 2: Next ─ sentence and act at the left, the `Standing · N` door at the
 * right. Next and the door no longer compete for one slot (R1-01).
 */
function deriveVoice(
  input: LensBandInput,
  {
    standing,
    setup,
    allInputs,
    line2,
  }: {
    standing: readonly LensStandingItem[];
    setup: readonly LensSetupItem[];
    allInputs: readonly LensInputItem[];
    line2: LensBandLine2;
  },
): LensVoice {
  const status = input.projectStatus ?? null;
  // F2-11 — a closed job prints today's closed sentence, no Next, no setup
  // rows and a silent door. F2-10 — a held job prints no Next and no setup
  // rows; its door speaks only while a class 1–2 row stands.
  const closed = status === 'completed';
  const held = status === 'on_hold';
  // 500-5 / 498-c — an own act left out is not known yet. Nothing stands in
  // for it, and setup waits too: it is never Next while an own act may stand.
  const pending = input.ownAct === undefined;
  const ownAct = input.ownAct ?? null;
  const household = familyLabel(input.household.trim());
  const clientFirstName =
    input.clientFirstName !== undefined
      ? input.clientFirstName
      : household === 'the client'
        ? null
        : clientShortName(household);
  const next =
    closed || held
      ? null
      : deriveNext({
          standing,
          setup: pending ? [] : setup,
          ownAct,
          installReading: input.installReading,
          clientFirstName,
          closed: false,
        });
  const loading = pending && next === null && !closed && !held;

  // F14 — the proposal's collapsed row is named whenever Next is its act.
  const nextIsOwn = next !== null && next.rowKey === null;
  const inputs = allInputs.filter(
    (item) =>
      !(item.key === PROPOSAL_INPUTS_KEY && nextIsOwn && namesInput(item, null, next?.act.label)),
  );
  const voicedSetup = closed || held ? [] : setup;
  const standingCount =
    closed || loading
      ? 0
      : standing.length + inputs.length + voicedSetup.length - (next?.rowKey ? 1 : 0);
  // F2-22 — terracotta only for a class-1 row behind the door; Next's own row
  // is not behind it.
  const doorClassOne =
    standingCount > 0 &&
    standing.some((item) => item.key !== next?.rowKey && classOfStandingRow(item) === 1);

  const named = next?.rowKey ? standing.find((item) => item.key === next.rowKey) : undefined;
  const { rightFlush, moneyOnly } = rightSlot(
    input,
    input.readingStop?.key === 'money',
    Boolean(named?.namesMoney),
  );
  // F2-1 — the job's name, never the household (nor its no-login suffix).
  const { stage, detail } = stageEyebrow(input.spreadKind, status, (input.jobName ?? '').trim());
  const eyebrowDetail = detail || null;

  // D2 / 498-g — the measure picks the form. The order of yield is the door,
  // then the sentence, never the act: at the phone's measure the door goes to
  // the dock first; elsewhere it stays and the sentence gives way.
  const doorPx =
    standingCount > 0 ? monoPx(standingDoorLabel(standingCount)) + LENS_LINE2_GAP_PX : 0;
  const actPx = next ? monoPx(next.act.label) + LENS_LINE2_GAP_PX : 0;
  const fits = ({ lead, sentence }: LensVoiceRung, withDoor: boolean) =>
    (lead ? monoPx(lead) + LENS_LINE2_GAP_PX : 0) +
      sentencePx(sentence) +
      actPx +
      (withDoor ? doorPx : 0) <=
    LENS_LINE2_MEASURE_PX[input.tier];
  const forms: LensVoiceRung[] = next
    ? [
        ...(next.sentence
          ? [{ form: 'long' as const, lead: 'Next ─', sentence: next.sentence }]
          : []),
        ...(next.shortSentence
          ? [{ form: 'short' as const, lead: 'Next', sentence: next.shortSentence }]
          : []),
        // F2-4 — the last rung: `NEXT ─ RECORD THE PAYMENT`, the sentence
        // given up whole rather than clipped.
        { form: 'act', lead: 'Next ─', sentence: '' },
      ]
    : held
      ? [{ form: 'long', lead: null, sentence: HELD_SENTENCE }]
      : loading
        ? [{ form: 'long', lead: 'Next', sentence: '' }]
        : [{ form: line2.form, lead: null, sentence: line2.sentence }];
  const doorInDock =
    standingCount > 0 && input.tier === 'mobile' && !fits(forms[0], true);
  const withDoor = standingCount > 0 && !doorInDock;
  const at = forms.findIndex((form) => fits(form, withDoor));
  const rungs = forms.slice(at === -1 ? forms.length - 1 : at);
  const printed = rungs[0];

  const voicedStanding = standing.map((item) => voiceItem(item, clientFirstName));
  return {
    eyebrow: eyebrowDetail ? `${stage} · ${eyebrowDetail}` : stage,
    eyebrowStage: stage,
    eyebrowDetail,
    rightFlush,
    moneyOnly,
    next,
    lead: printed.lead,
    sentence: printed.sentence,
    form: printed.form,
    rungs,
    standingCount,
    doorClassOne,
    doorInDock,
    standing: voicedStanding.map((item) =>
      item.act
        ? item
        : {
            ...item,
            act: borrowedAct(item.key, item.sentence, item.needKind, voicedStanding, ownAct),
          },
    ),
    inputs: inputs.map((item) =>
      item.act
        ? item
        : {
            ...item,
            act: borrowedAct(item.key, item.sentence, item.needKind, voicedStanding, ownAct),
          },
    ),
    setup: voicedSetup,
  };
}
