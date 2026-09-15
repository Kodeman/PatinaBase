import type { ProjectBillingAuthority } from "../commercial-documents";
import {
  automaticTimeBillingIntent,
  isInvoiceEligibleTimeEntry,
  timeBillingStateLabel,
  timeRateProvenance,
  timeRateRoleLabel,
} from "../authority-hours";

const AUTHORITY: ProjectBillingAuthority = {
  id: "authority-secret-id",
  projectId: "project-1",
  agreementId: "agreement-secret-id",
  state: "active",
  currency: "USD",
  ceilingCents: 1_000_000,
  authorizedCents: 1_000_000,
  accruedCents: 250_000,
  invoicedCents: 100_000,
  pendingAuthorizationCents: 0,
  remainingCents: 750_000,
  retainerAmountCents: 100_000,
  retainerPaidCents: 0,
  retainerActivationPolicy: "immediate",
  activeRateVersion: 3,
  billingThrough: null,
  rates: [
    {
      id: "rate-secret-id",
      proposalId: "agreement-secret-id",
      version: 3,
      roleName: "Principal designer",
      hourlyRateCents: 18_500,
      effectiveAt: "2026-08-01T00:00:00.000Z",
    },
  ],
};

describe("automatic document time billing intent", () => {
  it("allows active immediate authority", () => {
    expect(automaticTimeBillingIntent(AUTHORITY)).toEqual({
      billable: true,
      reason: "active",
    });
  });

  it("allows retainer-paid authority only after the retainer is satisfied", () => {
    const retainerPaid = {
      ...AUTHORITY,
      retainerActivationPolicy: "retainer_paid" as const,
      retainerPaidCents: AUTHORITY.retainerAmountCents,
    };
    expect(automaticTimeBillingIntent(retainerPaid).billable).toBe(true);

    expect(
      automaticTimeBillingIntent({
        ...retainerPaid,
        retainerPaidCents: AUTHORITY.retainerAmountCents - 1,
      }),
    ).toEqual({ billable: false, reason: "retainer_pending" });
  });

  it("fails closed without authority while preserving a nonbillable intent", () => {
    expect(automaticTimeBillingIntent(null)).toEqual({
      billable: false,
      reason: "no_authority",
    });
    expect(
      automaticTimeBillingIntent({
        ...AUTHORITY,
        state: "retainer_pending",
        retainerActivationPolicy: "retainer_paid",
      }),
    ).toEqual({ billable: false, reason: "retainer_pending" });
  });
});

describe("server-classified invoice eligibility", () => {
  it("excludes cap overage pending authorization and explicit nonbillable time", () => {
    expect(
      isInvoiceEligibleTimeEntry({
        billable: true,
        invoice_id: null,
        billing_state: "pending_authorization",
      }),
    ).toBe(false);
    expect(
      isInvoiceEligibleTimeEntry({
        billable: false,
        invoice_id: null,
        billing_state: "nonbillable",
      }),
    ).toBe(false);
    expect(
      timeBillingStateLabel({
        billable: true,
        invoice_id: null,
        billing_state: "pending_authorization",
      }),
    ).toBe("Pending auth");
  });

  it("accepts authorized rows and legacy rows with no authority classification", () => {
    expect(
      isInvoiceEligibleTimeEntry({
        billable: true,
        invoice_id: null,
        billing_state: "authorized",
      }),
    ).toBe(true);
    expect(
      isInvoiceEligibleTimeEntry({
        billable: true,
        invoice_id: null,
        billing_state: null,
      }),
    ).toBe(true);
  });
});

describe("studio rate provenance", () => {
  it("resolves the agreed role and rate without carrying internal IDs", () => {
    const provenance = timeRateProvenance(
      {
        authority_rate_id: "rate-secret-id",
        hourly_rate_cents: 18_500,
        rate_source: "authority",
        rate_role: "lead_designer",
      },
      AUTHORITY,
    );

    expect(provenance).toEqual({
      kind: "rated",
      label: "Principal designer",
      hourlyRateCents: 18_500,
      version: 3,
      rateSource: "authority",
      rateRole: "lead_designer",
    });
    expect(JSON.stringify(provenance)).not.toContain("secret-id");
  });

  it("keeps legacy rates readable when no authority exists", () => {
    expect(timeRateProvenance({ hourly_rate_cents: 12_500 }, null)).toEqual({
      kind: "rated",
      label: "Legacy rate",
      hourlyRateCents: 12_500,
      version: null,
      rateSource: null,
      rateRole: null,
    });
  });

  it("names the studio rate card as the leg that priced the hour", () => {
    expect(
      timeRateProvenance(
        { hourly_rate_cents: 15_000, rate_source: "studio_member" },
        null,
      ),
    ).toMatchObject({ kind: "rated", label: "Studio rate" });
  });

  // HT-26 — the whole point of the discriminated result: three different facts
  // used to render as the same blank cell.
  it("never returns null, and says 'rate pending' where the resolver found no card", () => {
    const pending = timeRateProvenance(
      { hourly_rate_cents: null, rate_source: "none", billable: true },
      null,
    );

    expect(pending).not.toBeNull();
    expect(pending).toEqual({
      kind: "pending",
      label: "rate pending",
      rateRole: null,
    });
  });

  it("distinguishes a legitimately non-billable hour from an unpriced one", () => {
    expect(
      timeRateProvenance(
        { hourly_rate_cents: null, billable: false, rate_source: "none" },
        null,
      ),
    ).toEqual({ kind: "nonbillable", label: "not billable", rateRole: null });

    expect(
      timeRateProvenance({ hourly_rate_cents: null, billable: true }, null),
    ).toEqual({
      kind: "unrecorded",
      label: "rate not recorded",
      rateRole: null,
    });
  });

  it("carries the role the member picked through every arm (HT-41)", () => {
    expect(
      timeRateProvenance(
        { hourly_rate_cents: null, rate_source: "none", rate_role: "bookkeeper" },
        null,
      ),
    ).toMatchObject({ kind: "pending", rateRole: "bookkeeper" });

    expect(timeRateRoleLabel("support_designer")).toBe("support designer");
    expect(timeRateRoleLabel(null)).toBeNull();
  });
});
