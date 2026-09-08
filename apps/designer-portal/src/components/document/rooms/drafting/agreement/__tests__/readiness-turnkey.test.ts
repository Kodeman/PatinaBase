/**
 * Readiness for the turnkey class — the room asking the questions the send is
 * going to ask.
 *
 * `send_commercial_document`'s design-build arm refuses on the same six
 * things: no pricing basis, an invalid one, no draws, an invalid draw set,
 * allowances out of step with their cost lines, and a supervision fee beside
 * a trade markup — plus the R10 attestation and R11's held notices. Anything
 * this panel lets through that the send refuses is a designer watching a
 * button fail with a database sentence, which is the whole reason these exist.
 */

import { type AgreementPart } from "@patina/types";
import {
  TURNKEY_ATTESTATION_BLOCKER,
  TURNKEY_DRAWS_BLOCKER,
  TURNKEY_PRICING_BASIS_BLOCKER,
  assessAgreementReadiness,
  heldNoticeBlocker,
} from "../readiness";
import type { CommercialDocument } from "@/lib/document/commercial-documents";

let seq = 0;
function part(
  input: Partial<AgreementPart> & { partKey: string },
): AgreementPart {
  seq += 1;
  return {
    id: input.id ?? `part-${seq}`,
    proposalId: "agreement-1",
    position: input.position ?? seq,
    kind: input.kind ?? "clause",
    variant: input.variant ?? null,
    partKey: input.partKey,
    title: input.title ?? "Part",
    payload: input.payload ?? {},
    required: input.required ?? false,
    clientVisible: input.clientVisible ?? true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
  };
}

const document: CommercialDocument = {
  id: "agreement-1",
  projectId: "project-1",
  kind: "design_build",
  state: "draft",
  title: "Halvorsen kitchen and mudroom",
  version: 1,
  waveName: null,
  sentAt: null,
  executedAt: null,
  supersededAt: null,
  replacementProposalId: null,
};

const pricingBasis = part({
  partKey: "patina.pricing_basis",
  kind: "schedule",
  variant: "pricing_basis",
  title: "Pricing basis",
  payload: {
    basis: "cost_plus_gmp",
    feeBps: 1800,
    gmpCents: 8_413_400,
    subDisclosure: "closed_book",
    costLines: [
      {
        id: "cabinetry",
        label: "Cabinetry",
        category: "sub",
        basisCents: 7_130_000,
      },
    ],
  },
});

const draws = part({
  partKey: "patina.draws",
  kind: "schedule",
  variant: "draws",
  title: "Draws",
  payload: {
    retainageBps: 500,
    draws: [
      {
        key: "deposit",
        label: "Deposit",
        sortOrder: 0,
        pct: 10,
        retainageApplies: false,
      },
      {
        key: "final",
        label: "Final",
        sortOrder: 1,
        pct: 90,
        retainageApplies: true,
      },
    ],
  },
});

function assess(
  parts: AgreementPart[],
  turnkey: { attestationLive: boolean; enabledJurisdictions: string[] } = {
    attestationLive: true,
    enabledJurisdictions: [],
  },
) {
  return assessAgreementReadiness({
    document,
    parts,
    recipientEmail: "halvorsen@example.com",
    turnkey,
  });
}

const messages = (
  parts: AgreementPart[],
  turnkey?: Parameters<typeof assess>[1],
) => assess(parts, turnkey).blockers.map((blocker) => blocker.message);

beforeEach(() => {
  seq = 0;
});

describe("the turnkey floor", () => {
  it("admits a design-build agreement into this send review at all", () => {
    expect(messages([pricingBasis, draws])).not.toContain(
      "Only a design services agreement or addendum can use this send review.",
    );
  });

  it("is ready when the pricing basis and the draws are both written", () => {
    expect(assess([pricingBasis, draws]).ready).toBe(true);
  });

  it("holds on a missing pricing basis", () => {
    expect(messages([draws])).toContain(TURNKEY_PRICING_BASIS_BLOCKER);
  });

  it("holds on a missing draw schedule", () => {
    expect(messages([pricingBasis])).toContain(TURNKEY_DRAWS_BLOCKER);
  });

  /**
   * The seeded template lays `basis` and the clause's `mode` down as NULL. A
   * panel that read a default for either would go green over the wave's
   * central question and hand the designer a database sentence at the send
   * door — `send_commercial_document` asks for both by name.
   */
  it("holds until a pricing basis has actually been chosen", () => {
    const unchosen = {
      ...pricingBasis,
      payload: { ...pricingBasis.payload, basis: null },
    };
    expect(assess([unchosen, draws]).ready).toBe(false);
    expect(messages([unchosen, draws])).toContain(
      "Choose how this agreement is priced.",
    );
  });

  it("holds until the trades are said to be open-book or closed-book", () => {
    const unchosen = {
      ...pricingBasis,
      payload: { ...pricingBasis.payload, subDisclosure: null },
    };
    expect(assess([unchosen, draws]).ready).toBe(false);
    expect(messages([unchosen, draws])).toContain(
      "Choose whether the trades are shown open-book or closed-book.",
    );
  });

  it("never asks a turnkey agreement to name a rate card or a flat fee", () => {
    // R4's design-services floor does not apply: the typed money part here is
    // the pricing basis, and asking for a fee it has no field for would be a
    // sentence the studio can never satisfy.
    expect(messages([pricingBasis, draws])).not.toContain(
      "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
    );
  });

  it("passes the pricing basis' own refusal through", () => {
    const off = {
      ...pricingBasis,
      payload: { ...pricingBasis.payload, gmpCents: 8_413_401 },
    };
    expect(messages([off, draws])).toContain(
      "The cost basis plus the fee must equal the guaranteed maximum price, to the cent.",
    );
  });

  it("passes the draw schedule's own refusal through", () => {
    const short = {
      ...draws,
      payload: {
        retainageBps: 500,
        draws: [
          {
            key: "deposit",
            label: "Deposit",
            sortOrder: 0,
            pct: 10,
            retainageApplies: false,
          },
          {
            key: "final",
            label: "Final",
            sortOrder: 1,
            pct: 80,
            retainageApplies: true,
          },
        ],
      },
    };
    expect(messages([pricingBasis, short])).toContain(
      "The draws come to 90% — they must come to 100%.",
    );
  });

  it("holds an allowance that disagrees with its cost line", () => {
    const allowances = part({
      partKey: "patina.allowances",
      kind: "schedule",
      variant: "allowances",
      title: "Allowances",
      payload: {
        allowances: [
          {
            id: "tile",
            label: "Tile",
            amountCents: 400_000,
            overageRule: "change_order",
            underageRule: "credit",
          },
        ],
      },
    });
    expect(messages([pricingBasis, draws, allowances])).toContain(
      "Tile has no allowance line on the pricing basis.",
    );
  });
});

describe("R10 — the attestation holds at send too", () => {
  it("refuses a send when the attestation has lapsed", () => {
    expect(
      messages([pricingBasis, draws], {
        attestationLive: false,
        enabledJurisdictions: [],
      }),
    ).toContain(TURNKEY_ATTESTATION_BLOCKER);
  });
});

describe("R11 — a held notice cannot travel", () => {
  const notice = part({
    partKey: "patina.notice_of_cancellation.wi",
    kind: "attachment",
    title: "Notice of cancellation (Wisconsin)",
    payload: { body: "…", jurisdiction: "WI", acknowledgeRequired: true },
  });

  it("refuses an agreement carrying a notice counsel has not cleared", () => {
    expect(messages([pricingBasis, draws, notice])).toContain(
      heldNoticeBlocker("WI"),
    );
  });

  it("allows one counsel has cleared", () => {
    expect(
      messages([pricingBasis, draws, notice], {
        attestationLive: true,
        enabledJurisdictions: ["WI"],
      }),
    ).not.toContain(heldNoticeBlocker("WI"));
  });

  it("says nothing about an attachment that names no jurisdiction", () => {
    const form = part({
      partKey: "patina.lien_waiver_form",
      kind: "attachment",
      title: "Lien waiver form",
      payload: { body: "…", acknowledgeRequired: false },
    });
    expect(assess([pricingBasis, draws, form]).ready).toBe(true);
  });
});

describe("a design-services agreement is untouched", () => {
  it("asks none of the turnkey questions", () => {
    const services = { ...document, kind: "design_services" as const };
    const flat = part({
      partKey: "custom.flat",
      kind: "schedule",
      variant: "flat",
      title: "Flat fee",
      payload: { cents: 800_000 },
    });
    const readiness = assessAgreementReadiness({
      document: services,
      parts: [flat],
      recipientEmail: "okafor@example.com",
      turnkey: { attestationLive: false, enabledJurisdictions: [] },
    });
    expect(readiness.blockers.map((blocker) => blocker.message)).not.toContain(
      TURNKEY_PRICING_BASIS_BLOCKER,
    );
    expect(readiness.blockers.map((blocker) => blocker.message)).not.toContain(
      TURNKEY_ATTESTATION_BLOCKER,
    );
    expect(readiness.ready).toBe(true);
  });
});

/**
 * The flag-off half of the same floor.
 *
 * `turnkey` is supplied by the composer only when `design-build` resolves on,
 * so its ABSENCE is the rollback path — and a rollback must be the stricter
 * side, never the looser one. Exempting the class fee floor on the document's
 * KIND alone let a `design_build` agreement carrying no money at all pass
 * readiness clean, when the same document raised "This agreement names no
 * fee." before Wave 3 touched this file.
 */
describe("a design-build agreement with the flag off", () => {
  const FEE_FLOOR =
    "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.";

  const bare = () => [
    part({
      partKey: "patina.terms",
      title: "Terms",
      required: true,
      payload: { body: "Ownership and cancellation." },
    }),
  ];

  it("falls back to the pre-Wave-3 fee floor rather than passing clean", () => {
    const readiness = assessAgreementReadiness({
      document,
      parts: bare(),
      recipientEmail: "halvorsen@example.com",
    });
    expect(readiness.blockers.map((blocker) => blocker.message)).toContain(
      FEE_FLOOR,
    );
    expect(readiness.ready).toBe(false);
  });

  it("asks none of the turnkey questions it has no context for", () => {
    const messages = assessAgreementReadiness({
      document,
      parts: bare(),
      recipientEmail: "halvorsen@example.com",
    }).blockers.map((blocker) => blocker.message);
    expect(messages).not.toContain(TURNKEY_PRICING_BASIS_BLOCKER);
    expect(messages).not.toContain(TURNKEY_DRAWS_BLOCKER);
    expect(messages).not.toContain(TURNKEY_ATTESTATION_BLOCKER);
  });

  it("still exempts the class fee floor when the turnkey floor IS asked", () => {
    const messages = assessAgreementReadiness({
      document,
      parts: bare(),
      recipientEmail: "halvorsen@example.com",
      turnkey: { attestationLive: true, enabledJurisdictions: [] },
    }).blockers.map((blocker) => blocker.message);
    expect(messages).not.toContain(FEE_FLOOR);
    expect(messages).toContain(TURNKEY_PRICING_BASIS_BLOCKER);
    expect(messages).toContain(TURNKEY_DRAWS_BLOCKER);
  });
});

/**
 * An allowance-category cost line with no allowance behind it is legal — the
 * database asks allowance → line only — so the room NAMES it and does not
 * refuse the send. It is a note precisely because the allowances editor no
 * longer sweeps such a line out of the contract sum.
 */
describe("an allowance line with no allowance behind it", () => {
  it("is a note, never a blocker", () => {
    const orphaned = part({
      partKey: "patina.pricing_basis",
      kind: "schedule",
      variant: "pricing_basis",
      title: "Pricing basis",
      payload: {
        basis: "fixed",
        fixedCents: 1_000_000,
        subDisclosure: "closed_book",
        costLines: [
          {
            id: "appliances",
            label: "Appliance allowance",
            category: "allowance",
            basisCents: 900_000,
          },
        ],
      },
    });
    const empty = part({
      partKey: "patina.allowances",
      kind: "schedule",
      variant: "allowances",
      title: "Allowances",
      payload: { allowances: [] },
    });
    const readiness = assessAgreementReadiness({
      document,
      parts: [orphaned, empty, draws],
      recipientEmail: "halvorsen@example.com",
      turnkey: { attestationLive: true, enabledJurisdictions: [] },
    });
    expect(readiness.notes.join(" ")).toContain(
      "Appliance allowance is an allowance line",
    );
    expect(
      readiness.blockers.filter((blocker) =>
        blocker.message.includes("allowance line"),
      ),
    ).toHaveLength(0);
  });
});
