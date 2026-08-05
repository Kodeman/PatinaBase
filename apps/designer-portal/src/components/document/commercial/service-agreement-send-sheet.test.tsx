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
    // Never a hard blocker: "Ready to send" still shows, and the send act
    // is enabled — everything else on this fixture is complete.
    expect(screen.getByText(/Ready to send/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send agreement/i }),
    ).toBeEnabled();
  });
});
