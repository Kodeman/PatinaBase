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
import type { NeedKind } from './desk-derivation';
import type { DocumentIndexKey } from './document-index';
import type { LensTier } from './lens-constants';
import {
  LENS_LINE2_GAP_PX,
  LENS_LINE2_MEASURE_PX,
  LENS_LINE2_PX_PER_CHAR,
  LENS_MONO_PX_PER_CHAR,
} from './lens-constants';
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
  onAct: () => void;
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
}

/** The guide's line, as `document-guide.tsx` hands it over (C-6). */
export interface LensGuideLine {
  text: string;
  act: LensAct | null;
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
  /** The form that fit the tier's measure — `long.sentence` or `short.sentence`. */
  sentence: string;
  act: LensAct | null;
  /** Which of the two forms is printed (D-B24). */
  form: 'long' | 'short';
  /** The whole sentence with the whole act. */
  long: LensLine2Form;
  /** D-B24's 390 form. Null when the line has no standing item behind it (the
   *  guide's sentence has no state, no day count and no object to shorten to). */
  short: LensLine2Form | null;
  /** Every standing exception AND every open input — the sheet's row count. */
  standingCount: number;
  /**
   * N-02 — what the `+N MORE` door prints. NOT `standingCount − 1`: line 2 only
   * takes a row off the door when it is NAMING one. On a guide line nothing on
   * the paper is a sheet row, so a guide with one open input prints `+1 MORE`
   * (W3-R2's own example) where the old arithmetic printed no door at all.
   */
  withheld: number;
}

export interface LensBandModel {
  line1: LensBandLine1;
  line2: LensBandLine2;
  /** Every standing exception, ranked — the standing sheet's list (OD-6). */
  standing: readonly LensStandingItem[];
  /** The open inputs — the sheet's `INPUT NEEDED · N` section (W3-R2). */
  inputs: readonly LensInputItem[];
  /** `Now at Pieces · 36 lines · 4 rooms · 1 damaged` (OD-7 / DL-03). */
  announcement: string | null;
}

export interface LensBandInput {
  spreadKind: LensSpreadKind;
  /** `deriveTicket(input)` — read for `row.exception` only (OD-8). */
  ticket: readonly TicketRow[];
  /** The red letter's rows, as `page.tsx` composes them. */
  needs: readonly RedLetterRow[];
  /** The stage's open inputs, from the guide model (C-6, W3-R2). */
  inputs?: readonly LensInputItem[];
  guide: LensGuideLine | null;
  /** D-B24 — which measure line 2 has to fit. The page's own media tier. */
  tier: LensTier;
  /** N-01 — the day the deadlines are measured against. Injected so a test can
   *  state it and so the model does not change under the reader at midnight. */
  now?: Date;
  household: string;
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

/** D-B24 — the head noun of the item's object, capped at 12 characters: the
 *  room, the invoice number, the piece. Never the act's verb, never the owner. */
export function shortSubject(sentence: string): string {
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
};

/** The sheet's kind line — the need's own stamp word, `desk-derivation.ts`. */
const NEED_EYEBROW: Record<NeedKind, string> = {
  overdue_decision: 'DECISION DUE',
  overdue_invoice: 'PAST DUE',
  proposal_expired: 'EXPIRED',
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
  needs: readonly RedLetterRow[],
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
        subject: shortSubject(parts.sentence),
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
      const sense =
        SENSE_ORDER[a.item.sense] - SENSE_ORDER[b.item.sense];
      if (sense !== 0) return sense;
      const aDistance = a.item.distance;
      const bDistance = b.item.distance;
      if (aDistance != null && bDistance != null && aDistance !== bDistance) {
        return aDistance - bDistance;
      }
      // "Longest-standing first" is the SILENCES' order: they have no deadline
      // to sort on, so the day they started standing is all there is.
      if (a.item.sense === 'none') {
        const aSince = a.item.standingSince;
        const bSince = b.item.standingSince;
        if (aSince !== bSince) {
          if (aSince == null) return 1;
          if (bSince == null) return -1;
          return aSince < bSince ? -1 : 1;
        }
      }
      if (a.tieBreak !== b.tieBreak) return a.tieBreak - b.tieBreak;
      return a.order - b.order;
    })
    .map((entry) => entry.item);
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

export function deriveLensBand(input: LensBandInput): LensBandModel {
  const standing = rankStanding(input.ticket, input.needs, input.now);
  const inputs = input.inputs ?? [];
  const worst = standing[0] ?? null;
  const readingStop = input.readingStop ?? null;
  const { rightFlush, moneyOnly } = rightSlot(
    input,
    readingStop?.key === 'money',
    Boolean(worst?.namesMoney),
  );

  const line1: LensBandLine1 = {
    identity: input.household.trim().toUpperCase(),
    stage: stagePhrase(input),
    rightFlush,
    moneyOnly,
  };

  // W3-R2 — the door counts the open inputs too: at every offset they are one
  // press away, in the sheet's own section.
  const standingCount = standing.length + inputs.length;
  // N-02 — line 2 discounts a row only when it is naming one.
  const withheld = standingCount - (worst ? 1 : 0);

  const long: LensLine2Form = {
    sentence: worst ? worst.sentence : (input.guide?.text ?? ''),
    act: worst ? worst.act : (input.guide?.act ?? null),
  };
  const short: LensLine2Form | null = worst
    ? {
        sentence:
          worst.short.days == null
            ? `${worst.short.state} · ${worst.short.subject}`
            : `${worst.short.state} ${worst.short.days}D · ${worst.short.subject}`,
        act: worst.act
          ? {
              key: worst.act.key,
              label: shortenAct(worst.act.label),
              onAct: worst.act.onAct,
            }
          : null,
      }
    : null;

  // The door's own words print whole in both forms, so its width is spent
  // before the sentence gets its measure.
  const doorPx =
    withheld > 0 ? monoPx(`+${withheld} MORE`) + LENS_LINE2_GAP_PX : 0;
  const budgetPx = (act: LensAct | null) =>
    LENS_LINE2_MEASURE_PX[input.tier] -
    doorPx -
    (act ? monoPx(act.label) + LENS_LINE2_GAP_PX : 0);
  const fits = (form: LensLine2Form) =>
    sentencePx(form.sentence) <= budgetPx(form.act);

  // D-B24 — one trigger, two forms. There is no qualifier ladder and no
  // character cap: a cap calibrated for the 900px measure never fires before
  // CSS ellipsis at 327, which is how a sentence came to lie about itself.
  const form: 'long' | 'short' = !short || fits(long) ? 'long' : 'short';
  const printed: LensLine2Form = form === 'short' && short ? short : long;

  const line2: LensBandLine2 = {
    kind: worst ? 'standing' : input.guide ? 'guide' : 'none',
    sentence: printed.sentence,
    act: printed.act,
    form,
    long,
    short,
    standingCount,
    withheld,
  };

  return {
    line1,
    line2,
    standing,
    inputs,
    announcement: readingStop
      ? `Now at ${readingStop.label} · ${readingStop.countLine}`
      : null,
  };
}
