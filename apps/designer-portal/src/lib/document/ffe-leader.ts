/**
 * The FF&E head's state election (F34/F08, direction-a §3; US-43 R4).
 *
 * The head names one state in one sentence and leads with the one act that
 * state asks for, chosen from the work rather than fixed. Sharpest first:
 *
 *   1. a release that can be pressed in this head   (I141)
 *   2. a damage claim inside its carrier window      (`damage_claim`, rank 1)
 *   3. an unanswered purchase order                  (`po_unacknowledged`, rank 2)
 *   4. a line with nothing specified, then a specified line with no price
 *   5. lines with the client for authorization       (the client's turn)
 *   6. a release held by its prerequisite            (the hold names its fix)
 *   7. a priced line not yet on an invoice
 *   8. otherwise                                     (Add items)
 *
 * The claim and the PO are read off the operational needs scan the document
 * already carries; the line classes are counted by the section itself.
 *
 * A state with nothing to press elects no lead: the client's turn, a held
 * release, and a job on hold or closed (where only a claim or an unanswered
 * PO still leads).
 *
 * Pure: no React, no DOM.
 */

import { placeholderCount } from './act-names';
import type { NeedLine } from './desk-derivation';

export type FfeExceptionKind = 'claim' | 'po' | 'spec' | 'price' | 'waiting' | 'bill';

/** The acts the head can lead with. The client's turn is never one. */
export type FfeLeaderKind = Exclude<FfeExceptionKind, 'waiting'> | 'release' | 'add-line';

/** The state the head names, lead or not. `settled` has nothing standing. */
export type FfeStateKind =
  | FfeLeaderKind
  | 'waiting'
  | 'held'
  | 'on-hold'
  | 'closed'
  | 'settled';

export interface FfeException {
  kind: FfeExceptionKind;
  /** Stored sentence-case; the head prints it as written. */
  text: string;
  /** The line the exception stands on, when one is carried. */
  lineId: string | null;
  count: number;
}

export interface FfeLeaderInput {
  /** I141 — a release that can be pressed stands in this head. */
  releaseLift: boolean;
  /** The document's operational needs, ranked (`rankOperationalNeeds`). */
  needs?: readonly NeedLine[];
  /**
   * The FF&E line a claim or an unanswered PO stands on, where the scan
   * carries one. `NeedLine` states no line today, so these are null on every
   * live read and the elected act points at the region rather than a row.
   */
  claimLineId?: string | null;
  poLineId?: string | null;
  /** Lines with no piece specified behind them. */
  unspecifiedLineIds?: readonly string[];
  /** Specified lines with no price to release at. */
  unpricedLineIds?: readonly string[];
  /** Lines with the client for authorization (the section's `ffeAwaiting`). */
  awaitingCount?: number;
  /** The release stands in this head with lines ready, held by its prerequisite. */
  releaseHeld?: boolean;
  /** Priced lines not yet on a live invoice. */
  uninvoicedLineIds?: readonly string[];
  /** The schedule holds no line yet. */
  emptySchedule?: boolean;
  /** `on-hold` is a job on hold, `closed` a completed one. */
  job?: 'open' | 'on-hold' | 'closed';
}

export interface FfeLeaderChoice {
  state: FfeStateKind;
  /** The act the head leads with; null when the state has nothing to press. */
  kind: FfeLeaderKind | null;
  /** C-AF-03 — the line the leader acts on; null when the act is not line-scoped. */
  highlightLineId: string | null;
  /** Every exception on the spread, sharpest first. */
  exceptions: readonly FfeException[];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The exceptions standing on the spread, sharpest first. */
export function scanFfeExceptions(
  input: FfeLeaderInput,
): readonly FfeException[] {
  const needs = input.needs ?? [];
  const exceptions: FfeException[] = [];
  const push = (kind: FfeExceptionKind, count: number, text: string, lineId: string | null) => {
    if (count > 0) exceptions.push({ kind, text, lineId, count });
  };

  const claims = needs.filter((need) => need.kind === 'damage_claim').length;
  push('claim', claims, `${claims} open damage ${plural(claims, 'claim', 'claims')}`, input.claimLineId ?? null);

  const unanswered = needs.filter((need) => need.kind === 'po_unacknowledged').length;
  push('po', unanswered, `${unanswered} ${plural(unanswered, 'PO', 'POs')} unanswered`, input.poLineId ?? null);

  const unspecified = input.unspecifiedLineIds ?? [];
  push('spec', unspecified.length, placeholderCount(unspecified.length), unspecified[0] ?? null);

  const unpriced = input.unpricedLineIds ?? [];
  push('price', unpriced.length, `${unpriced.length} unpriced`, unpriced[0] ?? null);

  const awaiting = input.awaitingCount ?? 0;
  push('waiting', awaiting, `${awaiting} awaiting authorization`, null);

  const uninvoiced = input.uninvoicedLineIds ?? [];
  push('bill', uninvoiced.length, `${uninvoiced.length} uninvoiced`, uninvoiced[0] ?? null);

  return exceptions;
}

type FfeLeaderPick = Omit<FfeLeaderChoice, 'exceptions'>;

const pick = (
  state: FfeStateKind,
  kind: FfeLeaderKind | null,
  highlightLineId: string | null = null,
): FfeLeaderPick => ({ state, kind, highlightLineId });

/** An exception's own act. Only the client's turn names none, and it never reaches here. */
const pickException = (exception: FfeException): FfeLeaderPick =>
  pick(exception.kind, exception.kind as FfeLeaderKind, exception.lineId);

type FfeRung = (input: FfeLeaderInput, exceptions: readonly FfeException[]) => FfeLeaderPick | null;

/** An open job's rungs, sharpest first (1–7 above); the first that stands elects. */
const OPEN_JOB_RUNGS: readonly FfeRung[] = [
  (input) => (input.releaseLift ? pick('release', 'release') : null),
  // Billing is the last exception, so this is the sharpest one above it.
  (_input, exceptions) => {
    const sharpest = exceptions.find((e) => e.kind !== 'bill');
    if (!sharpest) return null;
    return sharpest.kind === 'waiting' ? pick('waiting', null) : pickException(sharpest);
  },
  (input) => (input.releaseHeld ? pick('held', null) : null),
  (_input, exceptions) => {
    const bill = exceptions.find((e) => e.kind === 'bill');
    return bill ? pickException(bill) : null;
  },
];

function electOpenJob(input: FfeLeaderInput, exceptions: readonly FfeException[]): FfeLeaderPick {
  for (const rung of OPEN_JOB_RUNGS) {
    const picked = rung(input, exceptions);
    if (picked) return picked;
  }
  return pick(input.emptySchedule ? 'add-line' : 'settled', 'add-line');
}

/** A job on hold or closed: only a claim or an unanswered PO still leads. */
function electStoppedJob(
  job: 'on-hold' | 'closed',
  exceptions: readonly FfeException[],
): FfeLeaderPick {
  const urgent = exceptions.find((e) => e.kind === 'claim' || e.kind === 'po');
  return urgent ? pickException(urgent) : pick(job, null);
}

export function electFfeLeader(input: FfeLeaderInput): FfeLeaderChoice {
  const exceptions = scanFfeExceptions(input);
  const job = input.job ?? 'open';
  const picked = job === 'open' ? electOpenJob(input, exceptions) : electStoppedJob(job, exceptions);
  return { ...picked, exceptions };
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** Each state's sentence, given its exception count and the lines released. */
const STATE_SENTENCES: Record<FfeStateKind, (n: number, released: number) => string> = {
  release: (_n, released) =>
    released > 0
      ? 'Priced selections are ready for purchasing authorization.'
      : 'The selections are priced. Nothing is released.',
  claim: (n) => `${count(n, 'A damage claim is', 'damage claims are')} open.`,
  po: (n) => `${count(n, 'A purchase order is', 'purchase orders are')} unanswered.`,
  spec: (n) => `${count(n, 'One selection has', 'selections have')} no piece specified yet.`,
  price: (n) => `${count(n, 'One selection still needs', 'selections still need')} a confirmed price.`,
  waiting: (n) =>
    `${count(n, 'One selection is', 'selections are')} with the client for purchasing approval.`,
  bill: (n) => `${count(n, 'One priced selection is', 'priced selections are')} not yet invoiced.`,
  'add-line': () => 'No selections yet.',
  held: () => 'Selections are ready, but purchasing authorization is held.',
  'on-hold': () => 'The job is on hold.',
  closed: () => 'The job is closed.',
  settled: (_n, released) =>
    released > 0
      ? `${count(released, 'One selection is', 'selections are')} released.`
      : 'Nothing is released.',
};

/** The head's one plain sentence for the elected state. */
export function ffeStateSentence(choice: FfeLeaderChoice, released: number): string {
  const n = choice.exceptions.find((e) => e.kind === choice.state)?.count ?? 0;
  return STATE_SENTENCES[choice.state](n, released);
}
