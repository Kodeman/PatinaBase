import {
  assessServiceAgreementReadiness,
  buildServiceAgreementPreview,
  commercialDocumentExperience,
  commercialStatusView,
  SIGNED_ON_PAPER_NOTE,
  signedOnPaperNote,
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
  furnishingsDepositPercent: 25,
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
    ).toEqual({ ready: true, blockers: [], notes: [] });

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

  it("treats a zero furnishings deposit percent as valid, but rejects an out-of-range one", () => {
    expect(
      assessServiceAgreementReadiness({
        document,
        terms: { ...terms, furnishingsDepositPercent: 0 },
        rates,
        recipientEmail: "sarah@example.com",
      }).ready,
    ).toBe(true);

    expect(
      assessServiceAgreementReadiness({
        document,
        terms: { ...terms, furnishingsDepositPercent: 150 },
        rates,
        recipientEmail: "sarah@example.com",
      }).blockers,
    ).toContain(
      "Set the furnishings deposit percent, including zero when none is due.",
    );
  });

  it("notes an unset furnishings deposit percent as advisory, never a blocker — it is nullable by design and the release RPC defaults to 50%", () => {
    const result = assessServiceAgreementReadiness({
      document,
      terms: { ...terms, furnishingsDepositPercent: null },
      rates,
      recipientEmail: "sarah@example.com",
    });
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.notes).toContain(
      "No furnishings deposit set — authorizations will default to 50%.",
    );
  });

  it("adds no deposit note at all when terms have not loaded (already covered by its own blockers)", () => {
    const result = assessServiceAgreementReadiness({
      document,
      terms: null,
      rates,
      recipientEmail: "sarah@example.com",
    });
    expect(result.notes).toEqual([]);
  });

  it("allows a draft services addendum through the existing agreement review", () => {
    expect(
      assessServiceAgreementReadiness({
        document: { ...document, kind: "service_addendum" },
        terms,
        rates,
        recipientEmail: "sarah@example.com",
      }),
    ).toEqual({ ready: true, blockers: [], notes: [] });
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

  it("names the day on the paper in the status line, when the rail knows it", () => {
    expect(
      commercialStatusView("client_signed", {
        clientSignedOnPaper: true,
        clientPaperSignedOn: "2026-01-15",
      }).description,
    ).toContain("Signed Jan 15, 2026 on paper · recorded by the studio.");
  });

  it("keeps the undated phrase when it does not", () => {
    expect(
      commercialStatusView("client_signed", { clientSignedOnPaper: true })
        .description,
    ).toContain(SIGNED_ON_PAPER_NOTE);
  });

  it("says nothing about paper for a signature taken on screen", () => {
    expect(
      commercialStatusView("client_signed", {
        clientSignedOnPaper: false,
        clientPaperSignedOn: "2026-01-15",
      }).description,
    ).not.toContain("paper");
  });
});

describe("signedOnPaperNote", () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Chicago";
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("prints the calendar day it was given, undisturbed by the reader's timezone", () => {
    expect(signedOnPaperNote("2026-02-10")).toBe(
      "Signed Feb 10, 2026 on paper · recorded by the studio.",
    );
  });

  it("falls back to the undated phrase rather than printing an empty date", () => {
    expect(signedOnPaperNote(null)).toBe(SIGNED_ON_PAPER_NOTE);
    expect(signedOnPaperNote(undefined)).toBe(SIGNED_ON_PAPER_NOTE);
    expect(signedOnPaperNote("")).toBe(SIGNED_ON_PAPER_NOTE);
  });
});
