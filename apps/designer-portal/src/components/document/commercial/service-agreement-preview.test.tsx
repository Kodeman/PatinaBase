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

  /**
   * The client copy the studio previews is the client copy the client reads, so
   * the same date discipline applies here: the signature block prints the day
   * on the paper, never the day the studio typed the record up.
   */
  it("dates a paper signature block to the day on the paper", () => {
    render(
      <ServiceAgreementPreview
        document={document}
        terms={terms}
        rates={[]}
        signatures={[
          {
            party: "client",
            signerName: "Jamie Client",
            signedAt: "2026-08-05T14:20:00Z",
            consentVersion: 1,
            documentFingerprint: "fp-1",
            executedOnPaper: true,
            paperSignedOn: "2026-01-15",
            paperScanDocumentId: null,
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Signed Jan 15, 2026 on paper · recorded by the studio."),
    ).toBeVisible();
    expect(screen.queryByText(/Aug 5, 2026/)).not.toBeInTheDocument();
  });

  it("says nothing about paper for a signature taken on screen", () => {
    render(
      <ServiceAgreementPreview
        document={document}
        terms={terms}
        rates={[]}
        signatures={[
          {
            party: "client",
            signerName: "Jamie Client",
            signedAt: "2026-08-05T14:20:00Z",
            consentVersion: 1,
            documentFingerprint: "fp-1",
            executedOnPaper: false,
            paperSignedOn: null,
            paperScanDocumentId: null,
          },
        ]}
      />,
    );

    expect(screen.queryByText(/on paper/)).not.toBeInTheDocument();
  });

  it("says the ceiling is not yet set rather than printing $0 (J3)", () => {
    render(
      <ServiceAgreementPreview
        document={document}
        terms={{ ...terms, billingCeilingCents: 0 }}
        rates={[]}
        signatures={[]}
      />,
    );

    expect(screen.getByText("Not yet set")).toBeVisible();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });

  it("still renders a real, positive ceiling as currency", () => {
    render(
      <ServiceAgreementPreview
        document={document}
        terms={{ ...terms, billingCeilingCents: 1_800_000 }}
        rates={[]}
        signatures={[]}
      />,
    );

    expect(screen.getByText("$18,000")).toBeVisible();
    expect(screen.queryByText("Not yet set")).not.toBeInTheDocument();
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
