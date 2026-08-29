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
  label: string;
  onAct: () => void;
}

/**
 * The four standing tiers, worst first: something overdue by days, then a
 * decision due, then a damage window closing, then a maker's silence on a
 * purchase order. Ranked inside a tier by the day count the source states,
 * then by the day it started standing, then by the order it arrived.
 */
export type LensStandingTier =
  | 'overdue'
  | 'decision-due'
  | 'damage'
  | 'po-silence';

const TIER_ORDER: Record<LensStandingTier, number> = {
  overdue: 0,
  'decision-due': 1,
  damage: 2,
  'po-silence': 3,
};

export interface LensStandingItem {
  key: string;
  /** The sheet's kind line — the need's own stamp word (OD-6). */
  eyebrow: string;
  /** What stands, in the product's own words. Line 2 prints this one. */
  sentence: string;
  act: LensAct | null;
  tier: LensStandingTier;
  /** The day count the source states, where it states one. */
  days: number | null;
  standingSince: string | null;
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

export interface LensBandLine2 {
  kind: 'standing' | 'guide' | 'none';
  sentence: string;
  act: LensAct | null;
  /** Every standing exception, including the one line 2 is naming. */
  standingCount: number;
}

export interface LensBandModel {
  line1: LensBandLine1;
  line2: LensBandLine2;
  /** Every standing exception, ranked — the standing sheet's list (OD-6). */
  standing: readonly LensStandingItem[];
  /** `Now at Pieces · 36 lines · 4 rooms · 1 damaged` (OD-7 / DL-03). */
  announcement: string | null;
}

export interface LensBandInput {
  spreadKind: LensSpreadKind;
  /** `deriveTicket(input)` — read for `row.exception` only (OD-8). */
  ticket: readonly TicketRow[];
  /** The red letter's rows, as `page.tsx` composes them. */
  needs: readonly RedLetterRow[];
  guide: LensGuideLine | null;
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

/**
 * Line 2 at 15px in the 944px measure holds about this many characters
 * (proposal §4). Narrower measures are the CSS ellipsis's job — the ellipsis
 * is the last resort, after the order below has been walked.
 */
export const LENS_LINE2_MAX_CHARS = 110;

export interface LensTruncationStep {
  /** The phrase in the line this step replaces. */
  from: string;
  /** Its shorter form; the empty string drops it whole. */
  to: string;
}

/**
 * The truncation ORDER, applied until the line fits.
 *
 * A step whose `from` carries a digit is refused, whatever the caller passed:
 * the number, the day count, the room and the `+N MORE` door never truncate
 * (reconciliation, "What prints"). When no step brings the line inside its
 * measure, the full text is returned — CSS `nowrap`/ellipsis is the last
 * resort, and it cuts at the end rather than at a figure.
 */
export function truncateLine(
  text: string,
  maxChars: number,
  order: readonly LensTruncationStep[],
): string {
  if (text.length <= maxChars) return text;
  let printed = text;
  for (const step of order) {
    if (!step.from || /\d/.test(step.from)) continue;
    if (!printed.includes(step.from)) continue;
    printed = printed.replace(step.from, step.to).replace(/\s{2,}/g, ' ').trim();
    if (printed.length <= maxChars) return printed;
  }
  return printed;
}

const STOP_WORDS = new Set(['A', 'AN', 'THE', 'OF', 'FOR', 'TO', 'WITH', 'ON']);

/**
 * The act's words shorten first: `SEND A REMINDER` loses its article, then all
 * but its final word — the object the act lands on, which is the half a reader
 * cannot reconstruct from the sentence beside it.
 */
export function shortenAct(label: string): string {
  const words = label.trim().split(/\s+/);
  const kept = words.filter((word) => !STOP_WORDS.has(word.toUpperCase()));
  if (kept.length > 1) return kept.slice(-1).join(' ');
  return kept.join(' ') || label;
}

/**
 * The sentence's trailing qualifier — the clause after its last dash or comma,
 * dropped only when it carries no figure. A qualifier holding a number, a day
 * count or a room's date is not a qualifier this rule may take.
 */
function trailingQualifier(sentence: string): string | null {
  const match = /( — [^—]+| , [^,]+|, [^,]+)$/.exec(sentence);
  const tail = match?.[1];
  if (!tail || /\d/.test(tail)) return null;
  return tail;
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
): LensStandingItem[] {
  const items: LensStandingItem[] = [];
  const seen = new Set<string>();

  // Input order is the desk's own ranking; the sort below is stable on it.
  needs.forEach((need) => {
    const fingerprint = normalise(need.text);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    items.push({
      key: `need:${need.key}`,
      eyebrow: NEED_EYEBROW[need.kind],
      sentence: need.text,
      act: need.actionLabel
        ? { label: need.actionLabel, onAct: need.onAct }
        : null,
      tier: NEED_TIER[need.kind],
      days: statedDays(need.text),
      standingSince: null,
    });
  });

  rows.forEach((row) => {
    const exception = row.exception;
    if (!exception) return;
    const fingerprint = normalise(exception.phrase);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    items.push({
      key: `ticket:${row.key}`,
      eyebrow: TICKET_EYEBROW[exception.rank],
      sentence: exception.phrase,
      // A-11: this lane may not mint an act. A ticket exception the desk did
      // not also raise prints its sentence and opens nothing.
      act: null,
      tier: TICKET_TIER[exception.rank],
      days: statedDays(exception.phrase),
      standingSince: exception.standingSince,
    });
  });

  return items
    .map((item, order) => ({ item, order }))
    .sort((a, b) => {
      const tier = TIER_ORDER[a.item.tier] - TIER_ORDER[b.item.tier];
      if (tier !== 0) return tier;
      const aDays = a.item.days;
      const bDays = b.item.days;
      if (aDays !== bDays) {
        if (aDays == null) return 1;
        if (bDays == null) return -1;
        return bDays - aDays;
      }
      const aSince = a.item.standingSince;
      const bSince = b.item.standingSince;
      if (aSince !== bSince) {
        if (aSince == null) return 1;
        if (bSince == null) return -1;
        return aSince < bSince ? -1 : 1;
      }
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
): { rightFlush: string | null; moneyOnly: string | null } {
  const money = moneyIsTheStop ? null : input.moneyFigure;
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

export function deriveLensBand(input: LensBandInput): LensBandModel {
  const standing = rankStanding(input.ticket, input.needs);
  const worst = standing[0] ?? null;
  const readingStop = input.readingStop ?? null;
  const { rightFlush, moneyOnly } = rightSlot(
    input,
    readingStop?.key === 'money',
  );

  const line1: LensBandLine1 = {
    identity: input.household.trim().toUpperCase(),
    stage: stagePhrase(input),
    rightFlush,
    moneyOnly,
  };

  const standingCount = standing.length;
  const rawSentence = worst ? worst.sentence : (input.guide?.text ?? '');
  const rawAct = worst ? worst.act : (input.guide?.act ?? null);

  // The door's own words never shorten, so its length is spent before the
  // sentence gets its measure.
  const doorChars = standingCount > 1 ? ` +${standingCount - 1} MORE`.length : 0;
  const shortAct = rawAct ? shortenAct(rawAct.label) : null;
  const qualifier = trailingQualifier(rawSentence);

  const order: LensTruncationStep[] = [];
  if (rawAct && shortAct && shortAct !== rawAct.label) {
    order.push({ from: rawAct.label, to: shortAct });
  }
  if (qualifier) order.push({ from: qualifier, to: '' });

  const composed = rawAct ? `${rawSentence} ${rawAct.label}` : rawSentence;
  const printed = truncateLine(
    composed,
    LENS_LINE2_MAX_CHARS - doorChars,
    order,
  );

  // The order above shortened one line; the band prints it in two elements, so
  // each is read back out of the form that fit.
  const printedAct =
    rawAct && printed.endsWith(shortAct ?? rawAct.label)
      ? printed.endsWith(rawAct.label)
        ? rawAct.label
        : (shortAct ?? rawAct.label)
      : (rawAct?.label ?? null);
  const printedSentence = printedAct
    ? printed.slice(0, printed.length - printedAct.length).trim()
    : printed;

  const line2: LensBandLine2 = {
    kind: worst ? 'standing' : input.guide ? 'guide' : 'none',
    sentence: printedSentence,
    act:
      rawAct && printedAct ? { label: printedAct, onAct: rawAct.onAct } : null,
    standingCount,
  };

  return {
    line1,
    line2,
    standing,
    announcement: readingStop
      ? `Now at ${readingStop.label} · ${readingStop.countLine}`
      : null,
  };
}
