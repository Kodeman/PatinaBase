import type { AgreementPart } from "@patina/types";
import type { CommercialDocument } from "@/lib/document/commercial-documents";
import { assessAgreementReadiness, partsNeedingAttention } from "../readiness";

const document: CommercialDocument = {
  id: "agreement-1",
  projectId: null,
  kind: "design_services",
  state: "draft",
  title: "Okafor design agreement",
  version: 1,
  waveName: null,
  sentAt: null,
  executedAt: null,
  supersededAt: null,
  replacementProposalId: null,
};

let seq = 0;
function part(
  input: Partial<AgreementPart> & { partKey: string },
): AgreementPart {
  seq += 1;
  return {
    id: input.id ?? `part-${seq}`,
    proposalId: "agreement-1",
    position: input.position ?? seq,
    kind: input.kind ?? "clause",
    variant: input.variant ?? null,
    title: input.title ?? "Part",
    payload: input.payload ?? {},
    required: input.required ?? false,
    clientVisible: input.clientVisible ?? true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
    partKey: input.partKey,
  };
}

const services = () =>
  part({
    partKey: "patina.services",
    kind: "clause",
    title: "Services",
    required: true,
    payload: { body: "Interior design services." },
  });
const terms = () =>
  part({
    partKey: "patina.terms",
    kind: "clause",
    title: "Terms",
    required: true,
    payload: { body: "Ownership, cancellation, expenses." },
  });
const deliverables = () =>
  part({
    partKey: "patina.deliverables",
    kind: "list",
    title: "Deliverables",
    payload: { items: [{ id: "a", text: "Concept presentation" }] },
  });
const exclusions = () =>
  part({
    partKey: "patina.exclusions",
    kind: "list",
    title: "Exclusions",
    payload: { items: [{ id: "b", text: "Construction labor" }] },
  });
const roleRates = (
  roles = [
    { roleName: "Principal designer", hourlyRateCents: 22_500, sortOrder: 0 },
  ],
) =>
  part({
    partKey: "patina.role_rates",
    kind: "schedule",
    variant: "rate_card",
    title: "Role rates",
    payload: { roles },
  });
const ceiling = (cents: number | null = 2_400_000) =>
  part({
    partKey: "patina.ceiling",
    kind: "schedule",
    variant: "ceiling",
    title: "Ceiling",
    payload: { cents },
  });
const deposit = (depositPercent: number | null = 50) =>
  part({
    partKey: "patina.deposit",
    kind: "schedule",
    variant: "procurement",
    title: "Furnishings deposit",
    payload: { depositPercent },
  });
const retainer = (
  payload: Record<string, unknown> = {
    cents: 500_000,
    creditRule: "credited",
    activationPolicy: "immediate",
  },
) =>
  part({
    partKey: "patina.retainer",
    kind: "schedule",
    variant: "retainer",
    title: "Retainer",
    payload,
  });
const cadence = (value = "monthly") =>
  part({
    partKey: "patina.cadence",
    kind: "schedule",
    variant: "cadence",
    title: "Billing cadence",
    payload: { cadence: value },
  });

const nine = () => [
  services(),
  deliverables(),
  exclusions(),
  roleRates(),
  ceiling(),
  deposit(),
  retainer(),
  cadence(),
  terms(),
];

const assess = (
  parts: AgreementPart[],
  overrides: Partial<Parameters<typeof assessAgreementReadiness>[0]> = {},
) =>
  assessAgreementReadiness({
    document,
    parts,
    recipientEmail: "okafor@example.com",
    ...overrides,
  });

const messages = (parts: AgreementPart[]) =>
  assess(parts).blockers.map((blocker) => blocker.message);

beforeEach(() => {
  seq = 0;
});

describe("assessAgreementReadiness — the happy floor", () => {
  it("passes the nine standard parts, fully written", () => {
    const readiness = assess(nine());
    expect(readiness.blockers).toEqual([]);
    expect(readiness.ready).toBe(true);
  });

  it("stays ready with Exclusions removed — R4 names it removable", () => {
    const parts = nine().filter((p) => p.partKey !== "patina.exclusions");
    expect(assess(parts).ready).toBe(true);
  });

  it("stays ready with Deliverables removed", () => {
    const parts = nine().filter((p) => p.partKey !== "patina.deliverables");
    expect(assess(parts).ready).toBe(true);
  });

  it("stays ready on a ceiling with no rate card — the uncapped case", () => {
    expect(assess([services(), ceiling(2_400_000), terms()]).ready).toBe(true);
  });

  it("stays ready on a flat fee alone", () => {
    const flat = part({
      partKey: "custom.flat",
      kind: "schedule",
      variant: "flat",
      title: "Flat fee",
      payload: { cents: 1_100_000 },
    });
    expect(assess([services(), flat, terms()]).ready).toBe(true);
  });
});

describe("assessAgreementReadiness — R-4, required parts", () => {
  it("blocks a required clause that is only whitespace, and names the part", () => {
    const blank = part({
      partKey: "patina.terms",
      kind: "clause",
      title: "Terms",
      required: true,
      payload: { body: "   " },
    });
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.terms"),
      blank,
    ];
    const readiness = assess(parts);
    expect(readiness.blockers).toContainEqual({
      partId: blank.id,
      message: "Write Terms.",
    });
    expect(readiness.ready).toBe(false);
  });

  it("blocks a required list with no items", () => {
    const required = part({
      partKey: "custom.checklist",
      kind: "list",
      title: "Site conditions",
      required: true,
      payload: { items: [] },
    });
    expect(messages([...nine(), required])).toContain(
      "Add at least one item to Site conditions.",
    );
  });

  it("blocks a required schedule part with no typed value", () => {
    const required = part({
      partKey: "custom.flat",
      kind: "schedule",
      variant: "flat",
      title: "Flat fee",
      required: true,
      payload: { cents: 0 },
    });
    expect(messages([...nine(), required])).toContain("Complete Flat fee.");
  });
});

describe("assessAgreementReadiness — R-5, the class floor", () => {
  it("blocks an agreement that names no fee at all", () => {
    expect(messages([services(), terms()])).toContain(
      "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
    );
  });
});

describe("assessAgreementReadiness — R-6, a rate card needs a ceiling", () => {
  const ceilingBlocker =
    "An agreement that bills hourly needs a ceiling. Add a Ceiling part, or remove the role rates.";

  it("blocks a rate card with no ceiling part", () => {
    const parts = nine().filter((p) => p.partKey !== "patina.ceiling");
    expect(messages(parts)).toContain(ceilingBlocker);
  });

  it("blocks a rate card whose ceiling is null", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.ceiling"),
      ceiling(null),
    ];
    expect(messages(parts)).toContain(ceilingBlocker);
  });

  it("blocks a rate card whose ceiling is zero", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.ceiling"),
      ceiling(0),
    ];
    expect(messages(parts)).toContain(ceilingBlocker);
  });
});

describe("assessAgreementReadiness — the conditional facet rules", () => {
  it("R-7: blocks a rate card whose only role has a blank name", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.role_rates"),
      roleRates([{ roleName: "", hourlyRateCents: 22_500, sortOrder: 0 }]),
    ];
    expect(messages(parts)).toContain(
      "Add at least one role with an hourly rate.",
    );
  });

  it("R-8: blocks a negative retainer", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.retainer"),
      retainer({
        cents: -1,
        creditRule: "credited",
        activationPolicy: "immediate",
      }),
    ];
    expect(messages(parts)).toContain(
      "Set a valid retainer amount, including zero when none is due.",
    );
  });

  it("R-8: blocks a retainer with no activation policy", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.retainer"),
      retainer({ cents: 500_000, creditRule: "credited" }),
    ];
    expect(messages(parts)).toContain(
      "Choose when the agreement becomes active.",
    );
  });

  it("R-9: blocks a cadence part with no cadence chosen", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.cadence"),
      cadence(""),
    ];
    expect(messages(parts)).toContain("Choose a billing cadence.");
  });

  it("R-10: an unset deposit is a note, never a blocker", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.deposit"),
      deposit(null),
    ];
    const readiness = assess(parts);
    expect(readiness.ready).toBe(true);
    expect(readiness.notes).toContain(
      "No furnishings deposit set — authorizations will default to 50%.",
    );
  });

  it("R-10: a deposit over 100 blocks", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.deposit"),
      deposit(150),
    ];
    expect(messages(parts)).toContain(
      "Set the furnishings deposit percent, including zero when none is due.",
    );
  });

  it("a removed retainer, cadence and deposit ask nothing at all", () => {
    const parts = nine().filter(
      (p) =>
        p.partKey !== "patina.retainer" &&
        p.partKey !== "patina.cadence" &&
        p.partKey !== "patina.deposit",
    );
    const readiness = assess(parts);
    expect(readiness.ready).toBe(true);
    expect(readiness.notes).toEqual([]);
  });
});

describe("assessAgreementReadiness — keys, titles, and the document", () => {
  it("R-11: blocks two parts sharing a key, once", () => {
    const parts = [...nine(), ceiling(1_000_000)];
    const duplicates = messages(parts).filter((m) =>
      m.startsWith("Two parts share the key"),
    );
    expect(duplicates).toEqual([
      "Two parts share the key patina.ceiling. Rename one.",
    ]);
  });

  it("R-12: blocks a blank title", () => {
    const nameless = part({
      partKey: "custom.nameless",
      kind: "clause",
      title: "   ",
      payload: { body: "text" },
    });
    expect(messages([...nine(), nameless])).toContain("Name this part.");
  });

  it("R-2: blocks a document that has already been sent", () => {
    const readiness = assessAgreementReadiness({
      document: { ...document, state: "sent" },
      parts: nine(),
      recipientEmail: "okafor@example.com",
    });
    expect(readiness.blockers).toContainEqual({
      partId: null,
      message: "Only a draft agreement can be sent.",
    });
  });

  it("R-1: blocks a document that is not an agreement or addendum", () => {
    const readiness = assessAgreementReadiness({
      document: { ...document, kind: "furnishings_authorization" },
      parts: nine(),
      recipientEmail: "okafor@example.com",
    });
    expect(readiness.blockers).toContainEqual({
      partId: null,
      message:
        "Only a design services agreement or addendum can use this send review.",
    });
  });

  it("R-3: blocks a missing client email, and keeps it out of the attention count", () => {
    const readiness = assess(nine(), { recipientEmail: null });
    expect(readiness.blockers).toEqual([
      { partId: null, message: "Link a client with an email address." },
    ]);
    expect(readiness.ready).toBe(false);
    expect(partsNeedingAttention(readiness)).toBe(0);
  });
});

describe("partsNeedingAttention", () => {
  it("counts each blocked part once, however many blockers it carries", () => {
    const broken = part({
      partKey: "patina.retainer",
      kind: "schedule",
      variant: "retainer",
      title: "Retainer",
      payload: { cents: -1 },
    });
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.retainer"),
      broken,
    ];
    const readiness = assess(parts);
    // Two blockers (amount, activation policy) on one part.
    expect(
      readiness.blockers.filter((b) => b.partId === broken.id),
    ).toHaveLength(2);
    expect(partsNeedingAttention(readiness)).toBe(1);
  });

  it("is zero on a ready agreement", () => {
    expect(partsNeedingAttention(assess(nine()))).toBe(0);
  });
});

describe("assessAgreementReadiness — unknown kinds", () => {
  it("never throws on a kind Wave 1 cannot open, and does not block on it", () => {
    const wormhole = {
      ...part({ partKey: "custom.wormhole", title: "Wormhole" }),
      kind: "wormhole",
      variant: "quantum",
    } as unknown as AgreementPart;
    const readiness = assess([...nine(), wormhole]);
    expect(readiness.ready).toBe(true);
  });
});
