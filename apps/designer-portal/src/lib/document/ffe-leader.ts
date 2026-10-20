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
 *   6. a priced line not yet on an invoice
 *   7. an empty schedule                             (Add items)
 *
 * The claim and the PO are read off the operational needs scan the document
 * already carries; the line classes are counted by the section itself.
 *
 * A state with nothing to press elects no lead: the client's turn, a held or
 * closed job (where only a claim or an unanswered PO still leads), and a
 * schedule with nothing standing on it. The slot is never filled for its own
 * sake.
 *
 * Pure: no React, no DOM.
 */

import { placeholderCount } from './act-names';
import type { NeedLine } from './desk-derivation';

export type FfeExceptionKind = 'claim' | 'po' | 'spec' | 'price' | 'waiting' | 'bill';

/** The acts the head can lead with. The client's turn is never one. */
export type FfeLeaderKind = Exclude<FfeExceptionKind, 'waiting'> | 'release' | 'add-line';

/** The state the head names, lead or not. */
export type FfeStateKind = FfeLeaderKind | 'waiting' | 'held' | 'closed' | 'none';

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
  /** Priced lines not yet on a live invoice. */
  uninvoicedLineIds?: readonly string[];
  /** The schedule holds no line yet. */
  emptySchedule?: boolean;
  /** `held` is a job on hold, `closed` a completed one. */
  job?: 'open' | 'held' | 'closed';
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

export function electFfeLeader(input: FfeLeaderInput): FfeLeaderChoice {
  const exceptions = scanFfeExceptions(input);
  const choose = (
    state: FfeStateKind,
    kind: FfeLeaderKind | null,
    highlightLineId: string | null = null,
  ): FfeLeaderChoice => ({ state, kind, highlightLineId, exceptions });

  const job = input.job ?? 'open';
  if (job !== 'open') {
    const urgent = exceptions.find((e) => e.kind === 'claim' || e.kind === 'po');
    return urgent ? choose(urgent.kind, urgent.kind as FfeLeaderKind, urgent.lineId) : choose(job, null);
  }
  if (input.releaseLift) return choose('release', 'release');

  const sharpest = exceptions[0];
  if (sharpest?.kind === 'waiting') return choose('waiting', null);
  if (sharpest) return choose(sharpest.kind, sharpest.kind as FfeLeaderKind, sharpest.lineId);
  return input.emptySchedule ? choose('add-line', 'add-line') : choose('none', null);
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** The head's one plain sentence for the elected state. */
export function ffeStateSentence(choice: FfeLeaderChoice, released: number): string {
  const n = choice.exceptions.find((e) => e.kind === choice.state)?.count ?? 0;
  switch (choice.state) {
    case 'release':
      return released > 0
        ? 'Priced selections are ready for purchasing authorization.'
        : 'The selections are priced. Nothing is released.';
    case 'claim':
      return `${count(n, 'A damage claim is', 'damage claims are')} open.`;
    case 'po':
      return `${count(n, 'A purchase order is', 'purchase orders are')} unanswered.`;
    case 'spec':
      return `${count(n, 'One selection has', 'selections have')} no piece specified yet.`;
    case 'price':
      return `${count(n, 'One selection still needs', 'selections still need')} a confirmed price.`;
    case 'waiting':
      return `${count(n, 'One selection is', 'selections are')} with the client for purchasing approval.`;
    case 'bill':
      return `${count(n, 'One priced selection is', 'priced selections are')} not yet invoiced.`;
    case 'add-line':
      return 'No selections yet.';
    case 'held':
      return 'The job is on hold.';
    case 'closed':
      return 'The job is closed.';
    case 'none':
      return released > 0
        ? `${count(released, 'One selection is', 'selections are')} released.`
        : 'Nothing is released.';
  }
}
