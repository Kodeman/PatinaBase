import { render, screen } from "@testing-library/react";

jest.mock("@/hooks/use-commercial-documents", () => ({
  useSendServiceAgreement: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import { ServiceAgreementSendSheet } from "./service-agreement-send-sheet";
import type {
  CommercialDocument,
  ServiceAgreementTerms,
} from "@/lib/document/commercial-documents";

const document: CommercialDocument = {
  id: "proposal-1",
  projectId: null,
  kind: "design_services",
  state: "draft",
  title: "Whitfield design agreement",
  version: 1,
  waveName: null,
  sentAt: null,
  executedAt: null,
  supersededAt: null,
  replacementProposalId: null,
};

const terms: ServiceAgreementTerms = {
  proposalId: "proposal-1",
  scope: "Interior design services.",
  deliverables: ["Concept direction"],
  exclusions: ["Furnishings"],
  billingCeilingCents: 1_800_000,
  retainerAmountCents: 500_000,
  retainerActivationPolicy: "retainer_paid",
  billingCadence: "monthly",
  currency: "USD",
  terms: "Actual time is billed up to the authorization ceiling.",
  currentRateVersion: 1,
  updatedAt: null,
  furnishingsDepositPercent: 50,
};

describe("ServiceAgreementSendSheet", () => {
  it("renders the R8 furnishings deposit line for the reviewing designer", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={[{ id: "rate-1", proposalId: "proposal-1", version: 1, roleName: "Principal", hourlyRateCents: 20000, effectiveAt: null }]}
        recipientEmail="sarah@example.com"
      />,
    );

    expect(
      screen.getByText("Furnishings deposit · 50% on each authorization"),
    ).toBeVisible();
  });

  it("omits the deposit line entirely when terms have not loaded", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={null}
        rates={[]}
        recipientEmail="sarah@example.com"
      />,
    );

    expect(screen.queryByText(/on each authorization/i)).not.toBeInTheDocument();
  });

  it("notes an unset furnishings deposit as advisory, never as a blocker", () => {
    const unsetTerms: ServiceAgreementTerms = {
      ...terms,
      furnishingsDepositPercent: null,
    };
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={unsetTerms}
        rates={[{ id: "rate-1", proposalId: "proposal-1", version: 1, roleName: "Principal", hourlyRateCents: 20000, effectiveAt: null }]}
        recipientEmail="sarah@example.com"
      />,
    );

    expect(
      screen.getAllByText(
        "No furnishings deposit set — authorizations will default to 50%.",
      ).length,
    ).toBeGreaterThan(0);
    // Never a hard blocker: the send act is enabled — everything else on this
    // fixture is complete.
    expect(
      screen.getByRole("button", { name: /send agreement/i }),
    ).toBeEnabled();
    // W3R2-17 — but the sheet does not say "every contractual facet is
    // present" in the same breath as a caution about a facet that is not. A
    // sheet carrying a note carries the note alone.
    expect(screen.queryByText(/Ready to send/)).not.toBeInTheDocument();
  });

  // W3R2-05 — the sheet describes the paper it is sending.
  it("speaks the turnkey class's own terms, and names no furnishings deposit", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={{ ...document, kind: "design_build" }}
        terms={terms}
        rates={[]}
        recipientEmail="sarah@example.com"
        recipientName="Sarah"
      />,
    );

    expect(
      screen.getByText(/the price, the schedule of values, the draw schedule/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/services, rates, retainer policy/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Furnishings deposit/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/Design-build agreement/i).length,
    ).toBeGreaterThan(0);
  });
});
