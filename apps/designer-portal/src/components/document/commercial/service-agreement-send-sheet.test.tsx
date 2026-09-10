import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/hooks/use-commercial-documents", () => ({
  useSendServiceAgreement: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import type { AgreementPart } from "@patina/types";
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

const rates = [
  {
    id: "rate-1",
    proposalId: "proposal-1",
    version: 1,
    roleName: "Principal",
    hourlyRateCents: 20000,
    effectiveAt: null,
  },
];

let position = 0;
const part = (
  over: Partial<AgreementPart> & Pick<AgreementPart, "partKey" | "title">,
): AgreementPart => ({
  id: over.partKey,
  proposalId: "proposal-1",
  position: (position += 1),
  kind: "clause",
  variant: null,
  payload: {},
  required: false,
  clientVisible: true,
  sourceTemplateKey: null,
  sourcePartId: null,
  updatedAt: null,
  ...over,
});

const parts = (): AgreementPart[] => {
  position = 0;
  return [
    part({
      partKey: "patina.services",
      title: "Services",
      payload: { body: "Design." },
    }),
    part({
      partKey: "patina.retainer",
      title: "retainer",
      kind: "schedule",
      variant: "retainer",
      payload: { cents: 500_000 },
    }),
    part({
      partKey: "patina.cadence",
      title: "billing cadence",
      kind: "schedule",
      variant: "cadence",
      payload: { cadence: "monthly" },
    }),
  ];
};

describe("ServiceAgreementSendSheet · synthesis §5", () => {
  it("names the recipient and the written parts in one composed sentence", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail="sarah@example.com"
        recipientName="Sarah Whitfield"
        parts={parts()}
      />,
    );

    expect(
      screen.getByText(
        "Sarah Whitfield receives the three parts this agreement has written — the services, the $5,000.00 retainer and the monthly billing cadence — and their signature preserves consent; nothing is billed and no work is authorized until the studio countersigns.",
      ),
    ).toBeVisible();
  });

  it("cuts the eyebrow, the heading, the Recipient box and the deposit box", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail="sarah@example.com"
        recipientName="Sarah Whitfield"
        parts={parts()}
      />,
    );

    expect(screen.queryByText("Yes to the designer")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Send for the client signature"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Recipient")).not.toBeInTheDocument();
    expect(screen.queryByText("sarah@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/Furnishings deposit/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/on each authorization/i),
    ).not.toBeInTheDocument();
    // N4 — readiness proves R4's floor, not completeness.
    expect(screen.queryByText(/Ready to send/)).not.toBeInTheDocument();
    expect(screen.queryByText(/facet/i)).not.toBeInTheDocument();
  });

  it("carries the unset deposit as the caution slot's own sentence", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={{ ...terms, furnishingsDepositPercent: null }}
        rates={rates}
        recipientEmail="sarah@example.com"
        parts={parts()}
      />,
    );

    expect(
      screen.getByText(
        "The furnishings deposit is not set. Authorizations will default to 50%.",
      ),
    ).toBeVisible();
  });

  it("says nothing about a deposit that is set", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail="sarah@example.com"
        parts={parts()}
      />,
    );

    expect(
      screen.queryByText(/furnishings deposit is not set/i),
    ).not.toBeInTheDocument();
  });

  it("names the retainer on the terminal act, and renames Send later", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail="sarah@example.com"
        parts={parts()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Send the agreement · $5,000.00 retainer",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Not yet" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Send agreement/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Send later" }),
    ).not.toBeInTheDocument();
  });

  it("drops the figure when no retainer is written", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail="sarah@example.com"
        parts={[
          part({
            partKey: "patina.services",
            title: "Services",
            payload: { body: "Design." },
          }),
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Send the agreement" }),
    ).toBeVisible();
  });

  it("holds an unready Send rather than disabling it, and says why on activation", async () => {
    const user = userEvent.setup();
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail="sarah@example.com"
        parts={parts()}
        readinessOverride={{
          ready: false,
          blockers: ["This agreement names no fee."],
          notes: [],
        }}
      />,
    );

    const act = screen.getByRole("button", {
      name: "Send the agreement · $5,000.00 retainer",
    });
    // Held, never disabled: it keeps its place in the tab order.
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).toBeEnabled();
    expect(screen.getByText("Finish before sending")).toBeVisible();
    const described = act.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    expect(window.document.getElementById(described!)?.textContent).toContain(
      "This agreement names no fee.",
    );

    await user.click(act);
    expect(screen.getByRole("status")).toHaveTextContent(
      "This agreement names no fee.",
    );
  });

  it("keeps the offline-signature act at the sheet foot", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail="sarah@example.com"
        parts={parts()}
        onRecordOffline={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Record a signature received outside Patina",
      }),
    ).toBeVisible();
  });

  it("composes the turnkey sheet from its own parts, naming the class in the title alone", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={{ ...document, kind: "design_build" }}
        terms={terms}
        rates={[]}
        recipientEmail="sarah@example.com"
        recipientName="Sarah"
        parts={parts()}
      />,
    );

    expect(
      screen.getByText(
        /Sarah receives the three parts this agreement has written/,
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/services, rates, retainer policy/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /the price, the schedule of values, the draw schedule/i,
      ),
    ).not.toBeInTheDocument();
    // No furnishings pass through a design-build agreement, so no caution.
    expect(screen.queryByText(/furnishings deposit/i)).not.toBeInTheDocument();
  });

  it("falls back to the zero-part sentence when no parts are passed", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail="sarah@example.com"
      />,
    );

    expect(
      screen.getByText(
        "The client receives nothing this agreement has written yet; nothing is billed and no work is authorized until the studio countersigns.",
      ),
    ).toBeVisible();
  });

  it("prints the note's hint as a line under the label, not a placeholder", () => {
    render(
      <ServiceAgreementSendSheet
        open
        onClose={jest.fn()}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail="sarah@example.com"
        parts={parts()}
      />,
    );

    expect(
      screen.getByText("A short personal note to accompany the agreement."),
    ).toBeVisible();
    expect(
      screen.queryByPlaceholderText(
        "A short personal note to accompany the agreement.",
      ),
    ).not.toBeInTheDocument();
  });
});
