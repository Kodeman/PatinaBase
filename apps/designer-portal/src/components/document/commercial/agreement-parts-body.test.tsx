import { render, screen } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
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
      screen.getByText("Recorded with this agreement."),
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
      screen.getByText("Recorded with this agreement · Draws"),
    ).toBeInTheDocument();
  });

  it("prints no heading for a part with nothing written in it", () => {
    renderParts([
      part({
        partKey: "patina.exclusions",
        kind: "list",
        title: "Exclusions",
        payload: { items: [] },
      }),
    ]);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
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
