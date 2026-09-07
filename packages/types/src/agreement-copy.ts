/**
 * The agreement's client-facing sentences — one source, two surfaces.
 *
 * The designer's live preview and the homeowner's page render the same parts
 * (build/waves/w1/build-sheet.md §4.5 / §5.2) from two different codebases. A
 * sentence typed twice drifts; a sentence imported twice cannot. Every string
 * below is the client shell's own wording, and both renderers must read it
 * from here rather than repeat it.
 *
 * R5 — prose never carries money: nothing here interpolates a figure except
 * the deposit line, whose percent IS the typed value of its schedule part.
 * R7 — Agreement · Part · Library · Template · Addendum.
 */

export const AGREEMENT_PART_COPY = {
  /** A ceiling part kept with no figure. NULL means uncapped (F-2), never $0. */
  ceilingUncapped: "No ceiling — professional time is billed as it is worked.",
  /** Retainer, `activationPolicy: "retainer_paid"`. */
  retainerOnPayment:
    "Design work begins after the fully executed agreement and retainer payment.",
  /** Retainer, every other activation policy. */
  retainerOnExecution: "Due under the terms of the fully executed agreement.",
  /** Always printed under a cadence part, with or without a chosen cadence. */
  cadenceNote:
    "Additional work requires written authorization before it can be invoiced.",
  /** The one line every leaf neither surface draws falls back to. */
  recorded: "Recorded with your agreement.",
  /**
   * R21 — the words today's paper prints for a figure nobody wrote. A money
   * part whose amount is zero is UNWRITTEN, not `$0`:
   * `proposal_service_terms.retainer_amount_cents` is NOT NULL DEFAULT 0
   * (00412) and the standard parts are seeded from it, so the very first
   * composed agreement carries a retainer part reading `{ cents: 0 }`. Both
   * surfaces print this sentence for it, and neither prints the activation
   * clause that would otherwise promise something about a retainer that does
   * not exist.
   */
  notYetSet: "Not yet set",
  /** Attachment acknowledgment — display only in Wave 1. */
  attachmentAcknowledgment: "I received this",
} as const;

/** The retainer's activation sentence, by policy. */
export function agreementRetainerActivation(activationPolicy: unknown): string {
  return activationPolicy === "retainer_paid"
    ? AGREEMENT_PART_COPY.retainerOnPayment
    : AGREEMENT_PART_COPY.retainerOnExecution;
}

/**
 * The cadence as the client reads it: the stored value, underscore opened up,
 * capitalized by the renderer's own type treatment rather than by a lookup
 * table that would have to be maintained in two places as variants are added.
 */
export function agreementCadenceText(cadence: string): string {
  return cadence.replace("_", " ");
}

/** The furnishings deposit line. The percent is the part's typed value. */
export function agreementDepositLine(depositPercent: number): string {
  return `${depositPercent}% deposit`;
}
