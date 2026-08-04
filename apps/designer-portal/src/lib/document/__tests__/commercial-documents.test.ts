import {
  assessServiceAgreementReadiness,
  buildServiceAgreementPreview,
  commercialDocumentExperience,
  commercialStatusView,
  type CommercialDocument,
  type ServiceAgreementTerms,
  type ServiceRate,
} from "../commercial-documents";

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
  scope: "Interior design services for the living and dining areas.",
  deliverables: ["Concept direction", "Design documentation"],
  exclusions: ["Construction labor", "Furnishings and freight"],
  billingCeilingCents: 1_800_000,
  retainerAmountCents: 500_000,
  retainerActivationPolicy: "retainer_paid",
  billingCadence: "monthly",
  currency: "USD",
  terms: "Actual time is billed up to the authorization ceiling.",
  currentRateVersion: 1,
  updatedAt: "2026-08-03T12:00:00.000Z",
};

const rates: ServiceRate[] = [
  {
    id: "rate-1",
    proposalId: "proposal-1",
    version: 1,
    roleName: "Principal designer",
    hourlyRateCents: 22_500,
    effectiveAt: "2026-08-03T12:00:00.000Z",
  },
];

describe("commercial document routing", () => {
  it("routes only design-services documents into the agreement experience", () => {
    expect(commercialDocumentExperience("design_services")).toBe(
      "design_services",
    );
    expect(commercialDocumentExperience("legacy")).toBe("legacy");
    expect(commercialDocumentExperience("furnishings_authorization")).toBe(
      "commercial_readonly",
    );
    expect(commercialDocumentExperience("service_addendum")).toBe(
      "design_services",
    );
    expect(commercialDocumentExperience(null)).toBe("legacy");
    expect(commercialDocumentExperience("unexpected")).toBe("legacy");
  });
});

describe("service agreement send readiness", () => {
  it("requires the complete services, money, cadence, and terms contract", () => {
    expect(
      assessServiceAgreementReadiness({
        document,
        terms,
        rates,
        recipientEmail: "sarah@example.com",
      }),
    ).toEqual({ ready: true, blockers: [] });

    const result = assessServiceAgreementReadiness({
      document,
      terms: {
        ...terms,
        scope: " ",
        deliverables: [],
        exclusions: [],
        billingCeilingCents: 0,
        terms: "",
      },
      rates: [{ ...rates[0], roleName: "", hourlyRateCents: 0 }],
      recipientEmail: null,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "Name the services included in this agreement.",
        "Add at least one client deliverable.",
        "State what is not included.",
        "Add at least one role with an hourly rate.",
        "Set the design authorization ceiling.",
        "Write the agreement terms.",
        "Link a client with an email address.",
      ]),
    );
  });

  it("allows a draft services addendum through the existing agreement review", () => {
    expect(
      assessServiceAgreementReadiness({
        document: { ...document, kind: "service_addendum" },
        terms,
        rates,
        recipientEmail: "sarah@example.com",
      }),
    ).toEqual({ ready: true, blockers: [] });
  });
});

describe("service agreement client privacy", () => {
  it("builds an allowlisted preview without project, FF&E, or internal fields", () => {
    const preview = buildServiceAgreementPreview({
      document: {
        ...document,
        internalNotes: "never expose this",
      } as CommercialDocument & { internalNotes: string },
      terms: {
        ...terms,
        rooms: ["Living room"],
        internalCostCents: 3_000,
      } as ServiceAgreementTerms & {
        rooms: string[];
        internalCostCents: number;
      },
      rates: [
        {
          ...rates[0],
          internalCostRateCents: 8_000,
        } as ServiceRate & { internalCostRateCents: number },
      ],
      signatures: [],
    });

    expect(preview).toMatchObject({
      title: document.title,
      scope: terms.scope,
      deliverables: terms.deliverables,
      exclusions: terms.exclusions,
      rates: [{ roleName: "Principal designer", hourlyRateCents: 22_500 }],
    });
    expect(Object.keys(preview)).not.toEqual(
      expect.arrayContaining([
        "internalNotes",
        "internalCostCents",
        "projectId",
        "rooms",
        "ffe",
        "palette",
        "boards",
      ]),
    );
    expect(Object.keys(preview.rates[0])).toEqual([
      "roleName",
      "hourlyRateCents",
    ]);
  });
});

describe("commercial status treatment", () => {
  it("holds client-signed agreements for a separate studio countersignature", () => {
    expect(commercialStatusView("client_signed")).toMatchObject({
      label: "CLIENT SIGNED",
      canCountersign: true,
      isExecuted: false,
      description: expect.stringMatching(/awaiting the studio/i),
    });
    expect(commercialStatusView("executed")).toMatchObject({
      label: "EXECUTED",
      canCountersign: false,
      isExecuted: true,
    });
  });
});
