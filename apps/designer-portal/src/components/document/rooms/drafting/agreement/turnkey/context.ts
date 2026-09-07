"use client";

/**
 * What a turnkey editor knows beyond its own payload.
 *
 * Every other editor in this room is a pure function of ONE part's payload,
 * and that is the right shape for a clause or a rate card. The turnkey class
 * is not made that way: its figures are one set of numbers said in several
 * places, and an editor that could only see its own payload would have to let
 * them drift.
 *
 *   · the draws are drawn against the pricing basis' contract sum;
 *   · an allowance IS a cost line with `category: 'allowance'` — the same
 *     number said twice, so the allowances editor writes both in one act;
 *   · the schedule of values renders in the mode the sub-disclosure clause
 *     elected, and that mode is stored once, on the pricing basis, because
 *     `_validate_pricing_basis_payload` requires it exactly once per contract;
 *   · the no-double-count rule is a refusal about a PAIR — a supervision fee
 *     on one part and a markup on another — so neither part can see it alone.
 *
 * So the composer hands the turnkey editors a narrow window onto the rest of
 * the composition: read every part, and write one other part's payload in the
 * same act as your own. Nothing here writes to the server; `writePart` moves
 * the composer's local list exactly as `onChange` does, and one Save sends
 * the whole ordered array.
 *
 * With `design-build` off the composer supplies no context at all and no
 * turnkey editor ever mounts — which is what keeps the flag-off room byte
 * identical to the paper Wave 2 shipped.
 */

import type { AgreementPart } from "@patina/types";

/** The standard keys the turnkey template lays down (build sheet PART 13).
 *  A composed agreement reads its siblings by key, never by position — a
 *  designer may reorder the rail freely, and R19's stable keys are what
 *  survive that. */
export const TURNKEY_PART_KEYS = {
  pricingBasis: "patina.pricing_basis",
  draws: "patina.draws",
  allowances: "patina.allowances",
  subDisclosure: "patina.sub_disclosure",
  supervision: "patina.supervision_fee",
  changeOrders: "patina.change_orders",
  termination: "patina.termination",
  terms: "patina.terms",
  noticeOfCancellation: "patina.notice_of_cancellation",
  lienWaiverForm: "patina.lien_waiver_form",
} as const;

export interface TurnkeyContext {
  /** The whole composition, in rail order. */
  parts: AgreementPart[];
  /** Writes another part's payload into the composer's local list. A part key
   *  the composition does not carry is a no-op — a designer is allowed to
   *  remove a part, and a sibling editor must not resurrect it. */
  writePart: (partKey: string, payload: Record<string, unknown>) => void;
  /** The project this agreement sits on, when it has one. An origin
   *  agreement has none until countersign, so the identities table says so
   *  rather than showing an empty list as if there were no trades. */
  projectId: string | null;
}

export function findPart(
  context: TurnkeyContext | undefined,
  partKey: string,
): AgreementPart | null {
  return context?.parts.find((part) => part.partKey === partKey) ?? null;
}

export function payloadOf(
  context: TurnkeyContext | undefined,
  partKey: string,
): Record<string, unknown> {
  return findPart(context, partKey)?.payload ?? {};
}
