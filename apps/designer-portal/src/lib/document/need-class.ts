/**
 * Need classes and the Next order — ruling D2 (US-19, `delivery/rulings.md`).
 *
 * The class is read from a hand-written table keyed on `NeedKind`, never
 * inferred from a row's state, amount or tier (ADV-14). Inside a class the
 * order is W3-R1's deadline order, the same comparator `rankStanding` uses.
 */

import type { NeedKind } from './desk-derivation';
import type { OwnAct } from './act-names';
import {
  compareDeadline,
  type LensStandingItem,
  type LensStandingTier,
} from './lens-band-derivation';

/** 1 · blocks money or a signature · 2 · needs you · 3 · setup. */
export type NeedClass = 1 | 2 | 3;

/** D2's class table. Every kind is written out — the ones D2 does not list are
 *  class 2 — so a new `NeedKind` is a type error here, not a silent default. */
export const NEED_CLASS: Record<NeedKind, NeedClass> = {
  // 1 · blocks money or a signature
  payment_due: 1,
  payment_failed: 1,
  overdue_invoice: 1,
  hesitating_proposal: 1,
  proposal_expired: 1,
  proposal_declined: 1,
  quote_expiring: 1,
  return_by: 1,
  // 2 · needs you
  overdue_decision: 2,
  claim_window: 2,
  damage_claim: 2,
  lines_flagged: 2,
  awaiting_inspection: 2,
  schedule_conflict: 2,
  schedule_proposal: 2,
  task_due: 2,
  po_unsent: 2,
  po_unacknowledged: 2,
  ack_discrepancy: 2,
  cfa_pending: 2,
  memo_return: 2,
  exception_open: 2,
  proposal_signed: 2,
  new_lead: 2,
  ceremony_pending: 2,
  reconnect_due: 2,
  pulse_due: 2,
  // 3 · setup
  schedule_unconfigured: 3,
};

export function classOfNeed(kind: NeedKind): NeedClass {
  return NEED_CLASS[kind];
}

/** The setup rows that are not `NeedKind`s (D2 class 3, D10). */
export type SetupRowKind = 'no_client_linked' | 'budget_band_unset' | 'target_date_unset';

type Deadline = Pick<LensStandingItem, 'sense' | 'distance' | 'standingSince'>;

/** A standing need or ticket exception — `LensStandingItem` fits as is. A row
 *  with no `needKind` is a bare tier. */
export interface StandingNeedRow extends Deadline {
  needKind: NeedKind | null;
  tier: LensStandingTier;
}

/** A setup row that no `NeedKind` carries. */
export interface SetupRow extends Deadline {
  setup: SetupRowKind;
}

export type StandingRow = StandingNeedRow | SetupRow;

/** Setup rows are class 3; a kind takes its table class; a bare
 *  `LensStandingTier` with no kind is class 2. */
export function classOfStandingRow(row: StandingRow): NeedClass {
  if ('setup' in row) return 3;
  return row.needKind ? NEED_CLASS[row.needKind] : 2;
}

/** Class first, then W3-R1's deadline order. 0 on a full tie, so a stable
 *  sort keeps the caller's (the desk's) order. */
export function compareForNext(a: StandingRow, b: StandingRow): number {
  const byClass = classOfStandingRow(a) - classOfStandingRow(b);
  return byClass !== 0 ? byClass : compareDeadline(a, b);
}

export type NextChoice<T extends StandingRow> =
  | { kind: 'need'; row: T }
  | { kind: 'own'; act: OwnAct };

export interface SelectNextInput<T extends StandingRow> {
  /** Everything standing on the paper, setup rows included. */
  needs: readonly T[];
  /** The stage's own act (`ownAct`), or null where the stage has none. */
  ownAct: OwnAct | null;
  /** Whether the signed-in person can take this now. A gated act is never
   *  Next; it stands in the sheet with its reason. */
  canTake: (choice: NextChoice<T>) => boolean;
  /** A closed job prints no Next. */
  closed: boolean;
}

/**
 * D2's Next: class 1, then class 2, then the stage's own act, then class 3 —
 * the first of those the person can take. Setup is never Next while anything
 * in classes 1–2 or an own act stands, taken or gated.
 */
export function selectNext<T extends StandingRow>({
  needs,
  ownAct,
  canTake,
  closed,
}: SelectNextInput<T>): NextChoice<T> | null {
  if (closed) return null;
  const ranked = [...needs].sort(compareForNext);
  const order: NextChoice<T>[] = ranked
    .filter((row) => classOfStandingRow(row) !== 3)
    .map((row): NextChoice<T> => ({ kind: 'need', row }));
  if (ownAct) order.push({ kind: 'own', act: ownAct });
  if (order.length === 0) {
    for (const row of ranked) order.push({ kind: 'need', row });
  }
  return order.find(canTake) ?? null;
}
