import { render, screen } from "@testing-library/react";
import { ServiceAgreementPreview } from "./service-agreement-preview";
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
  furnishingsDepositPercent: 25,
};

describe("ServiceAgreementPreview", () => {
  it("renders the furnishings deposit term as R8 copy", () => {
    render(
      <ServiceAgreementPreview
        document={document}
        terms={terms}
        rates={[]}
        signatures={[]}
      />,
    );

    expect(
      screen.getByText("Furnishings deposit · 25% on each authorization"),
    ).toBeVisible();
  });

  it("renders zero percent plainly, not as a missing value", () => {
    render(
      <ServiceAgreementPreview
        document={document}
        terms={{ ...terms, furnishingsDepositPercent: 0 }}
        rates={[]}
        signatures={[]}
      />,
    );

    expect(
      screen.getByText("Furnishings deposit · 0% on each authorization"),
    ).toBeVisible();
  });

  it("says the deposit is unset rather than printing a null percent", () => {
    render(
      <ServiceAgreementPreview
        document={document}
        terms={{ ...terms, furnishingsDepositPercent: null }}
        rates={[]}
        signatures={[]}
      />,
    );

    expect(
      screen.getByText(
        "No furnishings deposit set — authorizations will default to 50%.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/null%/)).not.toBeInTheDocument();
  });
});
