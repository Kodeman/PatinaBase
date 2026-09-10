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

import type { AgreementPart } from "./agreement";

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
   * R24 — the act that takes a composed draft back to the seven facets.
   *
   * RETIRED with the seven-facet room: there is nothing to return to, and no
   * surface in this repository should print this string again. It is kept
   * declared only because `agreement-composer.tsx` still renders it on the
   * branch this lane is forbidden to edit; the galley lane deletes that call
   * site, and the constant goes with it at integration.
   *
   * @deprecated
   */
  returnToFacets: "Return to the seven facets",
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

/* ── THE CONSEQUENCE SENTENCE (synthesis §5) ──────────────────────────────
   What the client receives, said in one sentence, composed from the parts
   that are actually written. It sits above the terminal act in every state —
   on the agreement's own page and again in the send sheet — and a later wave
   prints it on the homeowner's door, which is why it lives here and not in
   either renderer (FS-22). ─────────────────────────────────────────────── */

const COUNT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
] as const;

/** A count as a sentence says it. Past twenty a paper writes the figure. */
export function agreementCountWord(n: number): string {
  const whole = Math.trunc(n);
  return whole >= 1 && whole <= 20 ? COUNT_WORDS[whole]! : String(whole);
}

/** Money in a sentence carries its cents — `$5,000.00`, not `$5,000` — because
 *  the same figure is read against an invoice. */
function sentenceMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}

function writtenCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed);
  // R21 — a figure nobody typed is not a figure.
  return cents > 0 ? cents : null;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => !!row && typeof row === "object",
  );
}

/**
 * What one part is CALLED inside the sentence — `the services`, `the $5,000.00
 * retainer`, `the monthly billing cadence`, `the Concept fee of $2,400.00`.
 *
 * `null` when the part is unwritten, and an unwritten part is never named: the
 * sentence says what the client receives, and a part with nothing in it is not
 * something received.
 */
export function agreementPartNounPhrase(
  part: AgreementPart,
  currency: string,
): string | null {
  const payload = part.payload ?? {};
  const title = part.title.trim();
  if (!title) return null;
  const named = title.toLowerCase();

  if (part.kind === "clause" || part.kind === "attachment") {
    return hasText(payload.body) ? `the ${named}` : null;
  }
  if (part.kind === "list") {
    return rows(payload.items).some((item) => hasText(item.text)) ||
      (Array.isArray(payload.items) && payload.items.some(hasText))
      ? `the ${named}`
      : null;
  }
  if (part.kind !== "schedule") return null;

  switch (part.variant) {
    case "rate_card":
      return rows(payload.roles).some(
        (role) => hasText(role.roleName) && writtenCents(role.hourlyRateCents),
      )
        ? `the ${named}`
        : null;
    case "ceiling":
    case "retainer": {
      const cents = writtenCents(payload.cents);
      return cents === null
        ? null
        : `the ${sentenceMoney(cents, currency)} ${named}`;
    }
    case "flat": {
      const cents = writtenCents(payload.cents);
      // A fee keeps its authored title — "the Concept fee of $2,400.00" —
      // because the fee's name is what the phase is called, not a category.
      return cents === null
        ? null
        : `the ${title} of ${sentenceMoney(cents, currency)}`;
    }
    case "cadence":
      return hasText(payload.cadence)
        ? `the ${agreementCadenceText(String(payload.cadence))} ${named}`
        : null;
    case "per_phase":
      return rows(payload.phases).some((phase) => hasText(phase.label))
        ? `the ${named}`
        : null;
    case "procurement":
      return writtenCents(payload.depositPercent) === null
        ? null
        : `the ${named}`;
    default:
      return null;
  }
}

/** `a`, `a and b`, `a, b and c` — no serial comma, as the sentence is written. */
function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

/**
 * Synthesis §5's consequence sentence, composed from the composition itself.
 *
 * The pronoun is `their` in every case: a name carries no gender, and the
 * unnamed case was ruled `their` already, so one sentence covers both.
 */
export function agreementConsequenceSentence(input: {
  recipientName?: string;
  parts: AgreementPart[];
  currency: string;
}): string {
  const who = input.recipientName?.trim()
    ? input.recipientName.trim()
    : "The client";
  const closing =
    "nothing is billed and no work is authorized until the studio countersigns.";
  const phrases = input.parts
    // R10 — an attestation is the studio's credential, never the client's
    // reading, and a hidden part is not received.
    .filter(
      (part) => part.clientVisible !== false && part.kind !== "attestation",
    )
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((part) => agreementPartNounPhrase(part, input.currency))
    .filter((phrase): phrase is string => phrase !== null);

  if (phrases.length === 0) {
    return `${who} receives nothing this agreement has written yet; ${closing}`;
  }
  const parts = phrases.length === 1 ? "part" : "parts";
  return `${who} receives the ${agreementCountWord(phrases.length)} ${parts} this agreement has written — ${joinPhrases(phrases)} — and their signature preserves consent; ${closing}`;
}
