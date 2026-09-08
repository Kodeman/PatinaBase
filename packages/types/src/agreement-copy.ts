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
  /**
   * R24 — the act that takes a composed draft back to the seven facets. It is
   * the studio's own word for un-composing, and it is offered only inside the
   * Contract Room, only on a draft.
   */
  returnToFacets: "Return to the seven facets",
  /**
   * R17(b) / R24 — what the seven-facet room says to a co-member the
   * `agreement-parts` flag has not reached, standing over an agreement someone
   * else composed. Her Save cannot land (00575 refuses it, and the write grant
   * on the money row is gone), so the room says so BEFORE she retypes seven
   * facets, and names the way back.
   */
  composedElsewhere:
    "This agreement is composed from parts. It is edited in the Contract Room with parts on, where it can also be returned to the seven facets.",
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

/**
 * THE TURNKEY PAPER'S OWN SENTENCES (Wave 3, R27, walk finding W3R1-04).
 *
 * A design-build agreement is not a services agreement with extra sections: it
 * names a price for a whole job, divides it into a schedule of values, and is
 * paid in draws with a slice of each held back. The homeowner's body
 * (`apps/client-portal/src/components/commercial/design-build-body.tsx`) and
 * the studio's live preview
 * (`apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx`)
 * render that paper from two codebases, so — exactly as with
 * `AGREEMENT_PART_COPY` above — every sentence they share is declared here and
 * imported twice rather than typed twice. The studio's preview said
 * "Recorded with your agreement." over the pricing basis, the draws and the
 * allowances while the homeowner read a guaranteed maximum price, a schedule
 * of values and four draws; that is the drift this block exists to close.
 */
export const DESIGN_BUILD_PAPER_COPY = {
  /** The label the paper carries instead of "Design services agreement". */
  documentLabel: "Design-build agreement",
  /** The head of the derived schedule, and the row that sums it. */
  scheduleOfValuesTitle: "Schedule of values",
  scheduleOfValuesTotalLabel: "The whole of it",
  /** The trades, named. R13: identities always, prices only under open book. */
  subsTitle: "Who is doing the work",
  /** The pricing basis' two derived rows. */
  costBasisLabel: "Cost basis",
  /** What the sum is called when the basis names no ceiling of its own. */
  contractSumFallbackLabel: "Contract price",
  /** A draw with no invoice against it yet. */
  drawNotYetBilled: "Not yet billed",
  /** A draw whose trade has filed its waiver. */
  drawLienWaiverReceived: "Lien waiver received",
  /**
   * The turnkey boundary — the sentence a design-build agreement closes with.
   * A services agreement's closing sentence ("design services only…") is
   * FALSE on this paper, which is why the class has its own.
   */
  boundary:
    "This agreement covers the work described above, at the price shown. Anything added to it is a separate written change order before the work is done.",
} as const;

/**
 * Money on the turnkey paper, to the cent, formatted from the INTEGER.
 *
 * The services paper rounds to whole dollars, which is right for a furnishings
 * line and wrong for a draw: the Halvorsen deposit is $8,413.40 and the
 * rough-in draw nets $23,978.19, and a homeowner reconciling an invoice
 * against her agreement needs both cents. The dollars go through `Intl`; the
 * cents are appended as the digits they already are, so nothing is divided and
 * nothing can round. A whole-dollar figure keeps the whole-dollar treatment
 * ($71,300, not $71,300.00).
 *
 * Here rather than in either renderer because the studio's preview and the
 * homeowner's page must print one figure the same way (R27).
 */
export function designBuildMoney(cents: number, currency = "USD"): string {
  const whole = Math.trunc(cents);
  const negative = whole < 0;
  const abs = Math.abs(whole);
  const dollars = Math.trunc(abs / 100);
  const rest = abs % 100;
  const head = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(dollars);
  const said = rest === 0 ? head : `${head}.${String(rest).padStart(2, "0")}`;
  return negative ? `−${said}` : said;
}

/** What each pricing basis means, in the homeowner's words. */
export const DESIGN_BUILD_BASIS_SENTENCE: Record<string, string> = {
  fixed: "A fixed price for the whole of the work.",
  cost_plus: "The cost of the work, plus the studio’s fee on it.",
  cost_plus_gmp:
    "The cost of the work, plus the studio’s fee on it, and the total will not exceed the guaranteed maximum price below.",
  tm_nte:
    "Time and materials as the work is done, and the total will not exceed the amount below.",
};

/** What the one figure the whole agreement sums to is CALLED, by basis. */
export const DESIGN_BUILD_CONTRACT_SUM_LABEL: Record<string, string> = {
  cost_plus_gmp: "Guaranteed maximum price",
  tm_nte: "Not to exceed",
  fixed: "Contract price",
};

/** A draw's standing, as the homeowner reads it. No badge, no colour. */
export const DESIGN_BUILD_DRAW_STATE_LABEL: Record<string, string> = {
  draft: DESIGN_BUILD_PAPER_COPY.drawNotYetBilled,
  sent: "Sent",
  partially_paid: "Part paid",
  paid: "Paid",
  void: "Withdrawn",
};

export function designBuildBasisSentence(basis: string): string | null {
  return DESIGN_BUILD_BASIS_SENTENCE[basis] ?? null;
}

export function designBuildContractSumLabel(basis: string): string {
  return (
    DESIGN_BUILD_CONTRACT_SUM_LABEL[basis] ??
    DESIGN_BUILD_PAPER_COPY.contractSumFallbackLabel
  );
}

/** The fee row's label — the percent is the pricing basis' typed value. */
export function designBuildFeeRowLabel(feeBps: number): string {
  return `Fee ${feeBps % 100 === 0 ? `${feeBps / 100}%` : `${(feeBps / 100).toFixed(2)}%`}`;
}

/** The share of the price a draw bills. The figure is the caller's, formatted
 *  in its own surface's money treatment; only the words live here. */
export function designBuildDrawShareLine(money: string): string {
  return `${money} of the price`;
}

/** What a draw holds back. */
export function designBuildDrawHeldBackLine(money: string): string {
  return `${money} held back`;
}

/** What the whole schedule holds back, and when it comes loose. */
export function designBuildRetainageHeldLine(money: string): string {
  return `${money} is held back across the draws and released when the work is finished.`;
}

/** An allowance's two rules, in one sentence, in canonical order. */
export function designBuildAllowanceRule(
  overageRule: string,
  underageRule: string,
): string {
  const over =
    overageRule === "client_credit"
      ? "Anything over this amount is added to your account."
      : "Anything over this amount needs a change order first.";
  const under =
    underageRule === "retain"
      ? " Anything under it stays with the studio."
      : " Anything under it comes back to you.";
  return `${over}${under}`;
}
