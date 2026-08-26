/**
 * The FF&E head's leader election (F34/F08, direction-a §3).
 *
 * The head used to decide its leader with a two-way boolean, so `Add a line`
 * stood inked over a damaged delivery and an unpaid ledger. It now elects the
 * SHARPEST EXCEPTION standing on the spread, in the tie-break order
 * `need-tie-break.ts` already fixes for the whole document:
 *
 *   1. a damage claim inside its carrier window   (`damage_claim`, rank 1)
 *   2. an unanswered purchase order               (`po_unacknowledged`, rank 2)
 *   3. a line with nothing specified behind it    (the studio's own pen)
 *   4. a priced line not yet on an invoice        (the studio's own pen)
 *
 * The claim and the PO are read off the operational needs scan the document
 * already carries; the two line classes are counted by the section itself.
 *
 * I141: where the release lift shows, the election yields to it — the head
 * prints one leader, and releasing outranks an exception whenever the head is
 * the surface still carrying the release.
 *
 * Pure: no React, no DOM. Exactly one leader comes back, always (C7).
 */

import type { NeedLine } from './desk-derivation';

export type FfeExceptionKind = 'claim' | 'po' | 'spec' | 'bill';

export type FfeLeaderKind = FfeExceptionKind | 'release' | 'add-line';

export interface FfeException {
  kind: FfeExceptionKind;
  /** Stored sentence-case; the head prints it as written. */
  text: string;
  /** The line the exception stands on, when one is carried. */
  lineId: string | null;
}

export interface FfeLeaderInput {
  /** I141 — the release act stands in this head, so it is the leader. */
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
  /** Priced lines not yet on a live invoice. */
  uninvoicedLineIds?: readonly string[];
}

export interface FfeLeaderChoice {
  kind: FfeLeaderKind;
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
  const unspecified = input.unspecifiedLineIds ?? [];
  const uninvoiced = input.uninvoicedLineIds ?? [];
  const exceptions: FfeException[] = [];

  const claims = needs.filter((need) => need.kind === 'damage_claim').length;
  if (claims > 0) {
    exceptions.push({
      kind: 'claim',
      text: `${claims} open damage ${plural(claims, 'claim', 'claims')}`,
      lineId: input.claimLineId ?? null,
    });
  }

  const unanswered = needs.filter(
    (need) => need.kind === 'po_unacknowledged',
  ).length;
  if (unanswered > 0) {
    exceptions.push({
      kind: 'po',
      text: `${unanswered} ${plural(unanswered, 'PO', 'POs')} unanswered`,
      lineId: input.poLineId ?? null,
    });
  }

  if (unspecified.length > 0) {
    exceptions.push({
      kind: 'spec',
      text: `${unspecified.length} unspecified`,
      lineId: unspecified[0] ?? null,
    });
  }

  if (uninvoiced.length > 0) {
    exceptions.push({
      kind: 'bill',
      text: `${uninvoiced.length} uninvoiced`,
      lineId: uninvoiced[0] ?? null,
    });
  }

  return exceptions;
}

export function electFfeLeader(input: FfeLeaderInput): FfeLeaderChoice {
  const exceptions = scanFfeExceptions(input);

  if (input.releaseLift) {
    return { kind: 'release', highlightLineId: null, exceptions };
  }

  const sharpest = exceptions[0];
  if (!sharpest) {
    return { kind: 'add-line', highlightLineId: null, exceptions };
  }

  return {
    kind: sharpest.kind,
    highlightLineId: sharpest.lineId,
    exceptions,
  };
}
