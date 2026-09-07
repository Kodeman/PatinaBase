import { render, screen } from "@testing-library/react";

/**
 * The read-only agreement body — what `proposal-preview.tsx` and
 * `proposal-blocks-readonly.tsx` put on the page.
 *
 * It holds the whole bundle, so it holds the parts. Before D1 it passed
 * everything BUT the parts, and a composed agreement fell back here to the
 * seven fixed sections: a flat-fee agreement with no ceiling printed "Not yet
 * set" on a document that was already sent, and every part the designer added
 * or removed was invisible.
 */

let mockBundle: unknown = null;

jest.mock("@/hooks/use-commercial-documents", () => ({
  useCommercialDocument: () => mockBundle,
}));

import { ServiceAgreementDocumentBody } from "./commercial-document-body";

const document = {
  id: "agreement-1",
  projectId: null,
  kind: "design_services",
  state: "sent",
  title: "Okafor design agreement",
  version: 1,
  waveName: null,
  sentAt: "2026-09-01T10:00:00Z",
  executedAt: null,
  supersededAt: null,
  replacementProposalId: null,
};

/** The projection of a flat-fee composition: NULL ceiling, no rates. */
const terms = {
  proposalId: "agreement-1",
  scope: "Whole-home interior design services.",
  deliverables: [],
  exclusions: [],
  billingCeilingCents: null,
  retainerAmountCents: 0,
  retainerActivationPolicy: "immediate",
  billingCadence: "monthly",
  currency: "USD",
  terms: "Ownership and cancellation.",
  currentRateVersion: 1,
  updatedAt: null,
  furnishingsDepositPercent: null,
};

const part = (
  input: Record<string, unknown> & { id: string; partKey: string },
) => ({
  proposalId: "agreement-1",
  kind: "clause",
  variant: null,
  title: "Part",
  payload: {},
  required: false,
  clientVisible: true,
  sourceTemplateKey: null,
  sourcePartId: null,
  updatedAt: null,
  position: 1,
  ...input,
});

const bundle = (parts: unknown[]) => ({
  isLoading: false,
  error: null,
  data: { document, terms, rates: [], signatures: [], parts },
});

describe("ServiceAgreementDocumentBody", () => {
  it("reads a sent composed agreement as its parts, never as Not yet set", () => {
    mockBundle = bundle([
      part({
        id: "part-1",
        partKey: "patina.services",
        position: 1,
        title: "Services",
        payload: { body: "Whole-home interior design services." },
      }),
      part({
        id: "part-2",
        partKey: "custom.flat",
        position: 2,
        kind: "schedule",
        variant: "flat",
        title: "Design fee",
        payload: { cents: 1_100_000 },
      }),
    ]);

    render(
      <ServiceAgreementDocumentBody
        proposalId="agreement-1"
        clientName="Avery Client"
      />,
    );

    expect(screen.getByRole("heading", { name: "Design fee" })).toBeVisible();
    expect(screen.getByText("$11,000")).toBeVisible();
    expect(screen.queryByText("Not yet set")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "How design time is billed" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the seven-facet body for a document with no parts", () => {
    mockBundle = bundle([]);

    render(
      <ServiceAgreementDocumentBody
        proposalId="agreement-1"
        clientName="Avery Client"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "How design time is billed" }),
    ).toBeVisible();
  });
});
