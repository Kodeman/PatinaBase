import { render, screen } from "@testing-library/react";
import type { ProjectBillingAuthority } from "@/lib/document/commercial-documents";
import { ProjectAuthorityBand } from "./project-authority-band";

const authority: ProjectBillingAuthority = {
  id: "internal-authority-id",
  projectId: "project-1",
  agreementId: "internal-agreement-id",
  state: "active",
  currency: "USD",
  ceilingCents: 500_000,
  authorizedCents: 500_000,
  accruedCents: 320_000,
  invoicedCents: 200_000,
  pendingAuthorizationCents: 45_000,
  remainingCents: 180_000,
  retainerAmountCents: 75_000,
  retainerPaidCents: 75_000,
  retainerActivationPolicy: "retainer_paid",
  activeRateVersion: 2,
  billingThrough: "Aug 3, 2026",
  rates: [
    {
      id: "internal-rate-id",
      proposalId: "internal-agreement-id",
      version: 2,
      roleName: "Senior designer",
      hourlyRateCents: 20_000,
      effectiveAt: "2026-08-01T00:00:00.000Z",
    },
  ],
};

describe("ProjectAuthorityBand", () => {
  it("shows the server summary and agreed rate provenance without internal IDs", () => {
    const { container } = render(
      <ProjectAuthorityBand authority={authority} />,
    );

    expect(screen.getByText("authorized")).toBeVisible();
    expect(screen.getByText("accrued")).toBeVisible();
    expect(screen.getByText("pending")).toBeVisible();
    expect(screen.getByText("remaining")).toBeVisible();
    expect(screen.getByText(/Agreement v2/)).toHaveTextContent(
      "Senior designer $200/hr",
    );
    expect(
      screen.getByText(/awaiting additional written authorization/),
    ).toHaveTextContent("$450");
    expect(container).not.toHaveTextContent("internal-authority-id");
    expect(container).not.toHaveTextContent("internal-rate-id");
    expect(container).not.toHaveTextContent("internal-agreement-id");
  });

  it("narrates the unpaid retainer gate", () => {
    render(
      <ProjectAuthorityBand
        authority={{
          ...authority,
          state: "retainer_pending",
          accruedCents: 0,
          pendingAuthorizationCents: 0,
          retainerPaidCents: 25_000,
        }}
      />,
    );

    expect(
      screen.getByText(
        /of the retainer remains before billing authority becomes active/,
      ),
    ).toHaveTextContent("$500");
  });
});
