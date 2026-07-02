/**
 * Decision-edge contract (R87) — the two rules that govern a decision's
 * lifecycle edits from the margin, as pure predicates so the surfaces
 * (the DecisionBody "Extend" act, the ItemComposer delete) and the contract
 * test share ONE source of truth.
 *
 *   · Extend on a STORED-expired decision revives it (expired→pending recovery,
 *     the 00171 spine transition) so the client can respond again — the natural
 *     meaning of extending the date. On a still-live decision it only moves the
 *     deadline.
 *   · Delete stays draft-only. A published decision (pending / expired /
 *     responded) is reopened or resolved, never deleted, so the R56 audit trail
 *     survives.
 */

/** True when Extend should ALSO run the expired→pending recovery (revive), not
 *  just bump the due_date. Keyed on the decision's STORED status. */
export function extendRevivesDecision(status: string | null | undefined): boolean {
  return status === 'expired';
}

/** True when a decision may be deleted — only an unsent draft (R87). */
export function canDeleteDecision(status: string | null | undefined): boolean {
  return status === 'draft';
}
