import { render, screen } from "@testing-library/react";
import {
  AGREEMENT_PART_COPY,
  DESIGN_BUILD_PAPER_COPY,
  agreementCadenceText,
  agreementDepositLine,
  type AgreementPart,
} from "@patina/types";
import { AgreementPartsBody } from "./agreement-parts-body";
import { ServiceAgreementPreview } from "./service-agreement-preview";
import type {
  CommercialDocument,
  ServiceAgreementTerms,
} from "@/lib/document/commercial-documents";

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
    title: input.title ?? "Part",
    payload: input.payload ?? {},
    required: input.required ?? false,
    clientVisible: input.clientVisible ?? true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
    partKey: input.partKey,
  };
}

beforeEach(() => {
  seq = 0;
});

const renderParts = (parts: AgreementPart[]) =>
  render(<AgreementPartsBody parts={parts} currency="USD" />);

describe("AgreementPartsBody", () => {
  it("renders parts in position order, not array order", () => {
    renderParts([
      part({
        partKey: "patina.terms",
        position: 9,
        title: "Terms",
        payload: { body: "Ownership and cancellation." },
      }),
      part({
        partKey: "patina.services",
        position: 1,
        title: "Services",
        payload: { body: "Interior design services." },
      }),
    ]);
    const headings = screen
      .getAllByRole("heading")
      .map((node) => node.textContent);
    expect(headings).toEqual(["Services", "Terms"]);
  });

  it("renders a list with notes and the optional suffix", () => {
    renderParts([
      part({
        partKey: "patina.deliverables",
        kind: "list",
        title: "Deliverables",
        payload: {
          items: [
            { id: "a", text: "Concept presentation" },
            {
              id: "b",
              text: "Site visit",
              note: "Twice a month",
              optional: true,
            },
          ],
        },
      }),
    ]);
    expect(screen.getByText("— Concept presentation")).toBeInTheDocument();
    expect(screen.getByText("— Site visit (optional)")).toBeInTheDocument();
    expect(screen.getByText("Twice a month")).toBeInTheDocument();
  });

  it("says what an open ceiling means rather than printing a figure", () => {
    renderParts([
      part({
        partKey: "patina.ceiling",
        kind: "schedule",
        variant: "ceiling",
        title: "Ceiling",
        payload: { cents: null },
      }),
    ]);
    expect(
      screen.getByText(
        "No ceiling — professional time is billed as it is worked.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not yet set")).not.toBeInTheDocument();
  });

  it("prints a set ceiling as money", () => {
    renderParts([
      part({
        partKey: "patina.ceiling",
        kind: "schedule",
        variant: "ceiling",
        title: "Ceiling",
        payload: { cents: 2_400_000 },
      }),
    ]);
    expect(screen.getByText("$24,000")).toBeInTheDocument();
  });

  it("omits a part the designer marked studio-only", () => {
    renderParts([
      part({
        partKey: "custom.internal",
        title: "Internal note",
        clientVisible: false,
        payload: { body: "Do not send." },
      }),
      part({
        partKey: "patina.services",
        title: "Services",
        payload: { body: "Interior design services." },
      }),
    ]);
    expect(screen.queryByText("Internal note")).not.toBeInTheDocument();
    expect(screen.queryByText("Do not send.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Services" }),
    ).toBeInTheDocument();
  });

  it("renders an attachment as its own lettered leaf, after every section", () => {
    const { container } = renderParts([
      part({
        partKey: "patina.attachment.wi",
        kind: "attachment",
        position: 1,
        title: "Wisconsin notice",
        payload: { body: "Statutory text.", acknowledgeRequired: true },
      }),
      part({
        partKey: "patina.services",
        position: 2,
        title: "Services",
        payload: { body: "Interior design services." },
      }),
    ]);
    expect(
      screen.getByText("Attachment A · Wisconsin notice"),
    ).toBeInTheDocument();
    expect(screen.getByText("I received this")).toBeInTheDocument();
    expect(container.querySelectorAll("hr")).toHaveLength(1);
    // The attachment is last on the page even though its position is first.
    const text = container.textContent ?? "";
    expect(text.indexOf("Services")).toBeLessThan(
      text.indexOf("Attachment A · Wisconsin notice"),
    );
  });

  it("never renders an attestation", () => {
    renderParts([
      part({
        partKey: "studio.attestation",
        kind: "attestation",
        title: "License",
        payload: { credentialType: "NCIDQ", number: "12345" },
      }),
    ]);
    expect(screen.queryByText("License")).not.toBeInTheDocument();
    expect(screen.queryByText(/12345/)).not.toBeInTheDocument();
  });

  it("survives an unknown kind and variant without raw JSON", () => {
    const wormhole = {
      ...part({ partKey: "custom.wormhole", title: "Wormhole" }),
      kind: "wormhole",
      variant: "quantum",
      payload: { secret: "should never print" },
    } as unknown as AgreementPart;
    renderParts([wormhole]);
    expect(
      screen.getByRole("heading", { name: "Wormhole" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Recorded with your agreement."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/should never print/)).not.toBeInTheDocument();
  });

  it("survives an unknown SCHEDULE variant without raw JSON", () => {
    renderParts([
      part({
        partKey: "custom.draws",
        kind: "schedule",
        variant: "draws",
        title: "Draw schedule",
        payload: { draws: [{ label: "First", cents: 100 }] },
      }),
    ]);
    expect(
      screen.getByRole("heading", { name: "Draw schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Recorded with your agreement."),
    ).toBeInTheDocument();
  });

  // ── §4.5's ten rows, asserted as the literal sentences the client shell
  // prints. These four are what D5 found drifted; the fixture below pins the
  // shared constants to the same literals so neither surface can move alone.

  it("prints the retainer's activation sentence, not a designer shorthand", () => {
    renderParts([
      part({
        partKey: "patina.retainer",
        kind: "schedule",
        variant: "retainer",
        title: "Retainer",
        payload: { cents: 250_000, activationPolicy: "retainer_paid" },
      }),
    ]);
    expect(screen.getByText("$2,500")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Design work begins after the fully executed agreement and retainer payment.",
      ),
    ).toBeInTheDocument();
  });

  it("prints the other activation policy's sentence", () => {
    renderParts([
      part({
        partKey: "patina.retainer",
        kind: "schedule",
        variant: "retainer",
        title: "Retainer",
        payload: { cents: 250_000, activationPolicy: "immediate" },
      }),
    ]);
    expect(
      screen.getByText("Due under the terms of the fully executed agreement."),
    ).toBeInTheDocument();
  });

  it("prints the cadence as the client reads it, with the authorization note", () => {
    renderParts([
      part({
        partKey: "patina.cadence",
        kind: "schedule",
        variant: "cadence",
        title: "Billing cadence",
        payload: { cadence: "biweekly" },
      }),
    ]);
    expect(screen.getByText("biweekly")).toBeInTheDocument();
    expect(screen.queryByText("Every two weeks")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Additional work requires written authorization before it can be invoiced.",
      ),
    ).toBeInTheDocument();
  });

  it("prints the deposit line the client portal prints", () => {
    renderParts([
      part({
        partKey: "patina.deposit",
        kind: "schedule",
        variant: "procurement",
        title: "Furnishings deposit",
        payload: { depositPercent: 50 },
      }),
    ]);
    expect(screen.getByText("50% deposit")).toBeInTheDocument();
    expect(
      screen.queryByText(/on each furnishings authorization/),
    ).not.toBeInTheDocument();
  });

  // R27 — the same body contract on both surfaces. An empty clause and an
  // empty list are NOTHING on the homeowner's page: the leaf draws null and
  // the client shell drops the whole section (`PartSection` returns null).
  // This preview kept the heading, so the designer previewed an "Exclusions"
  // section that the page the homeowner signs does not have. Every leaf that
  // still has something to say keeps its heading and says it.
  it("draws no section at all for an empty clause or an empty list", () => {
    renderParts([
      part({
        partKey: "patina.exclusions",
        kind: "list",
        title: "Exclusions",
        payload: { items: [] },
      }),
      part({
        partKey: "patina.services",
        kind: "clause",
        title: "Services",
        payload: { body: "   " },
      }),
    ]);
    expect(
      screen.queryByRole("heading", { name: "Exclusions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Services" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the heading of a part that still has something to say", () => {
    renderParts([
      part({
        partKey: "patina.retainer",
        kind: "schedule",
        variant: "retainer",
        title: "Retainer",
        payload: {},
      }),
      part({
        partKey: "patina.role_rates",
        kind: "schedule",
        variant: "rate_card",
        title: "Role rates",
        payload: { roles: [] },
      }),
    ]);
    expect(
      screen.getByRole("heading", { name: "Retainer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Role rates" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Recorded with your agreement.")).toHaveLength(
      2,
    );
  });

  // ── R21 · an amount nobody wrote is unwritten, on BOTH surfaces ──────────
  //
  // `materialize_standard_parts` seeds `patina.ceiling` from
  // `billing_ceiling_cents` and `patina.retainer` from
  // `retainer_amount_cents` (NOT NULL DEFAULT 0), so the very first composed
  // agreement carries `{ cents: 0 }` in both. The homeowner's page
  // (`apps/client-portal/src/components/agreement-parts-body.tsx`) prints
  // "Not yet set" for exactly that; this preview printed `$0`, and a preview
  // that lies about the page is worse than no preview.

  it("prints Not yet set for a ceiling nobody has written, never $0", () => {
    renderParts([
      part({
        partKey: "patina.ceiling",
        kind: "schedule",
        variant: "ceiling",
        title: "Ceiling",
        payload: { cents: 0 },
      }),
    ]);
    expect(screen.getByText("Not yet set")).toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
    // And an ABSENT ceiling still says what an absent ceiling means (F-2).
    expect(
      screen.queryByText(AGREEMENT_PART_COPY.ceilingUncapped),
    ).not.toBeInTheDocument();
  });

  it("withholds the retainer's activation sentence with its figure", () => {
    renderParts([
      part({
        partKey: "patina.retainer",
        kind: "schedule",
        variant: "retainer",
        title: "Retainer",
        payload: { cents: 0, activationPolicy: "retainer_paid" },
      }),
    ]);
    expect(screen.getByText("Not yet set")).toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
    expect(
      screen.queryByText(AGREEMENT_PART_COPY.retainerOnPayment),
    ).not.toBeInTheDocument();
  });

  it("prints Not yet set for a flat fee nobody has written", () => {
    renderParts([
      part({
        partKey: "custom.flat",
        kind: "schedule",
        variant: "flat",
        title: "Flat fee",
        payload: { cents: 0 },
      }),
    ]);
    expect(screen.getByText("Not yet set")).toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });

  it("draws nothing at all for a deposit of zero percent", () => {
    renderParts([
      part({
        partKey: "patina.deposit",
        kind: "schedule",
        variant: "procurement",
        title: "Furnishings deposit",
        payload: { depositPercent: 0 },
      }),
    ]);
    // A percent has no "Not yet set" twin on today's paper, and R28 (re-gate 2,
    // F2) will not let the recorded line assert a term nobody wrote: the part
    // takes its whole section with it, here and on the homeowner's page.
    expect(screen.queryByText("0% deposit")).not.toBeInTheDocument();
    expect(screen.queryByText("Not yet set")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Furnishings deposit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(AGREEMENT_PART_COPY.recorded),
    ).not.toBeInTheDocument();
  });

  it("keeps a deposit part that names only a term of sale", () => {
    renderParts([
      part({
        partKey: "patina.deposit",
        kind: "schedule",
        variant: "procurement",
        title: "Furnishings deposit",
        payload: {
          depositPercent: 0,
          termsOfSale: "Net 30 from invoice date.",
        },
      }),
    ]);
    expect(
      screen.getByRole("heading", { name: "Furnishings deposit" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Net 30 from invoice date\./)).toBeInTheDocument();
    expect(screen.queryByText("0% deposit")).not.toBeInTheDocument();
  });

  it("still prints a figure somebody did write", () => {
    renderParts([
      part({
        partKey: "patina.retainer",
        kind: "schedule",
        variant: "retainer",
        title: "Retainer",
        payload: { cents: 500_000, activationPolicy: "retainer_paid" },
      }),
      part({
        partKey: "patina.deposit",
        kind: "schedule",
        variant: "procurement",
        title: "Furnishings deposit",
        payload: { depositPercent: 25 },
      }),
    ]);
    expect(screen.getByText("$5,000")).toBeInTheDocument();
    expect(
      screen.getByText(AGREEMENT_PART_COPY.retainerOnPayment),
    ).toBeInTheDocument();
    expect(screen.getByText("25% deposit")).toBeInTheDocument();
    expect(screen.queryByText("Not yet set")).not.toBeInTheDocument();
  });
});

// The fixture both surfaces assert against. If a sentence changes it changes
// here, in @patina/types, and both renderers move together or neither does.
describe("AGREEMENT_PART_COPY — the shared sentences", () => {
  it("is the client shell's wording, verbatim", () => {
    expect(AGREEMENT_PART_COPY).toEqual({
      ceilingUncapped:
        "No ceiling — professional time is billed as it is worked.",
      retainerOnPayment:
        "Design work begins after the fully executed agreement and retainer payment.",
      retainerOnExecution:
        "Due under the terms of the fully executed agreement.",
      cadenceNote:
        "Additional work requires written authorization before it can be invoiced.",
      recorded: "Recorded with your agreement.",
      // R21 — the words today's paper prints for a figure nobody wrote. Both
      // surfaces print exactly this for a money part whose amount is zero.
      notYetSet: "Not yet set",
      attachmentAcknowledgment: "I received this",
      // R24 — the studio's own words for un-composing, and what the
      // seven-facet room says to a co-member standing over a composed
      // agreement. Neither reaches the homeowner's page.
      returnToFacets: "Return to the seven facets",
      composedElsewhere:
        "This agreement is composed from parts. It is edited in the Contract Room with parts on, where it can also be returned to the seven facets.",
    });
  });

  it("opens the underscore in a cadence and leaves the case to the page", () => {
    expect(agreementCadenceText("per_draw")).toBe("per draw");
    expect(agreementCadenceText("monthly")).toBe("monthly");
  });

  it("names the deposit without naming the authorization", () => {
    expect(agreementDepositLine(0)).toBe("0% deposit");
    expect(agreementDepositLine(50)).toBe("50% deposit");
  });
});

// ── The preview's own branch: Core kept, seven sections replaced.

const document: CommercialDocument = {
  id: "agreement-1",
  projectId: null,
  kind: "design_services",
  state: "draft",
  title: "Okafor design agreement",
  version: 1,
  waveName: null,
  sentAt: null,
  executedAt: null,
  supersededAt: null,
  replacementProposalId: null,
};

const terms: ServiceAgreementTerms = {
  proposalId: "agreement-1",
  scope: "Interior design services.",
  deliverables: ["Concept presentation"],
  exclusions: ["Construction labor"],
  billingCeilingCents: 0,
  retainerAmountCents: 0,
  retainerActivationPolicy: "immediate",
  billingCadence: "monthly",
  currency: "USD",
  terms: "Ownership and cancellation.",
  currentRateVersion: 1,
  updatedAt: null,
  furnishingsDepositPercent: 50,
};

describe("ServiceAgreementPreview · parts branch", () => {
  it("keeps the flag-off body when there are no parts, Not yet set included", () => {
    render(
      <ServiceAgreementPreview
        document={document}
        terms={terms}
        rates={[]}
        signatures={[]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "What you will receive" }),
    ).toBeInTheDocument();
    // The zero ceiling on the legacy path still reads "Not yet set" — that
    // branch survives exactly for flag-off (P0).
    expect(screen.getAllByText("Not yet set").length).toBeGreaterThan(0);
  });

  it("replaces the seven sections with the parts, and never prints Not yet set", () => {
    render(
      <ServiceAgreementPreview
        document={document}
        terms={terms}
        rates={[]}
        signatures={[]}
        parts={[
          part({
            partKey: "patina.services",
            position: 1,
            title: "Services",
            payload: { body: "Interior design services." },
          }),
          part({
            partKey: "custom.flat",
            position: 2,
            kind: "schedule",
            variant: "flat",
            title: "Flat fee",
            payload: { cents: 1_100_000 },
          }),
        ]}
      />,
    );
    // Gone: the fixed sections, and every "Not yet set" they could carry.
    expect(
      screen.queryByRole("heading", { name: "What you will receive" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Not yet set")).not.toBeInTheDocument();
    // Kept: the Core, above and below.
    expect(
      screen.getByRole("heading", { name: "Okafor design agreement" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Agreement signatures")).toBeInTheDocument();
    expect(
      screen.getByText(/outside this design services agreement/),
    ).toBeInTheDocument();
    // And the parts themselves.
    expect(
      screen.getByRole("heading", { name: "Flat fee" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$11,000")).toBeInTheDocument();
  });
});

/* ── W3R1-04 · THE STUDIO'S PREVIEW IS THE PAPER IT IS SENDING ───────────────
   The walk stood the executed Halvorsen prime's two faces side by side: the
   studio's rail read "DESIGN SERVICES AGREEMENT · V1" with
   "Pricing basis — Recorded with your agreement.", "Draw schedule — Recorded
   with your agreement." and "Allowances — Recorded with your agreement.",
   closing "…outside this design services agreement."; the homeowner's page
   read "Design-build agreement", a guaranteed maximum price of $84,134, the
   schedule of values, the draws and the allowances, closing with the turnkey
   boundary. R27 says those two are one paper.

   The figures are the Halvorsen fixture, the same one
   `apps/client-portal/src/components/__tests__/commercial-document-shell-design-build.test.tsx`
   and `supabase/tests/commercial/design_build_test.sql` are written from. ── */

const TURNKEY_DOCUMENT: CommercialDocument = {
  ...document,
  kind: "design_build",
  title: "Halvorsen kitchen and mudroom",
};

const HALVORSEN_COST_LINES = [
  { id: "cabinetryAndMillwork", label: "Cabinetry & millwork", category: "sub", basisCents: 3_800_000 },
  { id: "electrical", label: "Electrical", category: "sub", basisCents: 950_000 },
  { id: "plumbing", label: "Plumbing", category: "sub", basisCents: 720_000 },
  { id: "generalConditions", label: "General conditions / site", category: "general_conditions", basisCents: 630_000 },
  { id: "tile", label: "Tile allowance", category: "allowance", basisCents: 400_000 },
  { id: "plumbingFixtures", label: "Plumbing fixtures allowance", category: "allowance", basisCents: 350_000 },
  { id: "lighting", label: "Lighting allowance", category: "allowance", basisCents: 280_000 },
];

const HALVORSEN_PARTS = (): AgreementPart[] => [
  part({
    partKey: "patina.pricing_basis",
    position: 1,
    kind: "schedule",
    variant: "pricing_basis",
    title: "Pricing basis",
    payload: {
      basis: "cost_plus_gmp",
      feeBps: 1800,
      gmpCents: 8_413_400,
      costLines: HALVORSEN_COST_LINES,
      subDisclosure: "closed_book",
      scheduleOfValues: [
        { id: "kitchen", label: "Kitchen", cents: 6_400_000 },
        { id: "mudroom", label: "Mudroom", cents: 2_013_400 },
      ],
    },
  }),
  part({
    partKey: "patina.draws",
    position: 2,
    kind: "schedule",
    variant: "draws",
    title: "Draw schedule",
    payload: {
      retainageBps: 500,
      draws: [
        { key: "deposit", label: "Deposit at signing", pct: 10, sortOrder: 1, retainageApplies: false },
        { key: "rough_in", label: "Rough-in", pct: 30, sortOrder: 2, retainageApplies: true },
      ],
    },
  }),
  part({
    partKey: "patina.allowances",
    position: 3,
    kind: "schedule",
    variant: "allowances",
    title: "Allowances",
    payload: {
      allowances: [
        {
          id: "tile",
          label: "Tile allowance",
          amountCents: 400_000,
          overageRule: "change_order",
          underageRule: "credit",
        },
      ],
    },
  }),
];

describe("W3R1-04 · the turnkey preview reads as the homeowner's paper", () => {
  it("names itself a design-build agreement and closes with the turnkey boundary", () => {
    render(
      <ServiceAgreementPreview
        document={TURNKEY_DOCUMENT}
        terms={terms}
        rates={[]}
        signatures={[]}
        parts={HALVORSEN_PARTS()}
      />,
    );
    expect(screen.getByText(/Design-build agreement/)).toBeInTheDocument();
    expect(
      screen.getByText(DESIGN_BUILD_PAPER_COPY.boundary),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/outside this design services agreement/),
    ).not.toBeInTheDocument();
  });

  it("prints the guaranteed maximum price, the schedule of values and its total", () => {
    render(
      <AgreementPartsBody parts={HALVORSEN_PARTS()} currency="USD" turnkey />,
    );
    expect(screen.getByText("Guaranteed maximum price")).toBeInTheDocument();
    // Twice: the contract sum the basis names, and the schedule of values'
    // own total. They are the same figure, and that is the invariant.
    expect(screen.getAllByText("$84,134")).toHaveLength(2);
    expect(screen.getByText("Cost basis")).toBeInTheDocument();
    expect(screen.getByText("$71,300")).toBeInTheDocument();
    expect(screen.getByText("Fee 18%")).toBeInTheDocument();
    expect(screen.getByText("$12,834")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Schedule of values" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("$64,000")).toBeInTheDocument();
    expect(screen.getByText("Mudroom")).toBeInTheDocument();
    expect(screen.getByText("$20,134")).toBeInTheDocument();
    expect(screen.getByText("The whole of it")).toBeInTheDocument();
  });

  it("prints the draws and the allowances, and never the recorded line for them", () => {
    render(
      <AgreementPartsBody parts={HALVORSEN_PARTS()} currency="USD" turnkey />,
    );
    expect(screen.getByText("Deposit at signing")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("Rough-in")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("Tile allowance")).toBeInTheDocument();
    expect(screen.getByText("$4,000")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Anything over this amount needs a change order first. Anything under it comes back to you.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(AGREEMENT_PART_COPY.recorded),
    ).not.toBeInTheDocument();
  });

  it("leaves a services agreement exactly as it was — the turnkey leaves are class-scoped", () => {
    render(<AgreementPartsBody parts={HALVORSEN_PARTS()} currency="USD" />);
    expect(screen.getAllByText(AGREEMENT_PART_COPY.recorded).length).toBe(3);
    expect(
      screen.queryByRole("heading", { name: "Schedule of values" }),
    ).not.toBeInTheDocument();
  });
});
