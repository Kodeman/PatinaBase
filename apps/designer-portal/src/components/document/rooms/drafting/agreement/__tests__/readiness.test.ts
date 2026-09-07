import type { AgreementPart } from "@patina/types";
import type { CommercialDocument } from "@/lib/document/commercial-documents";
import {
  assessAgreementReadiness,
  blockersForPart,
  partsNeedingAttention,
  HIDDEN_FEE_BLOCKER,
} from "../readiness";
import { FEE_BASIS_BLOCKER } from "../part-kinds";

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

  // R22 — a ceiling is a cap on a fee and not a fee, so it no longer answers
  // the class floor on its own (`_agreement_fee_unnamed`, 00575, refuses the
  // same composition). What this case protects is the OTHER half: a ceiling
  // with no rate card beside it asks for no rate card.
  it("stays ready on a fee and a ceiling with no rate card", () => {
    const flat = part({
      partKey: "custom.flat",
      kind: "schedule",
      variant: "flat",
      title: "Flat fee",
      payload: { cents: 1_100_000 },
    });
    expect(assess([services(), flat, ceiling(2_400_000), terms()]).ready).toBe(
      true,
    );
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
  const noFeeBlocker =
    "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.";

  it("blocks an agreement that names no fee at all", () => {
    expect(messages([services(), terms()])).toContain(noFeeBlocker);
  });

  it("blocks the nine standard parts with nothing typed into any of them", () => {
    // What a designer sees the instant `materialize_standard_parts` seeds the
    // room: every part present, no money written anywhere. A retainer of zero
    // and a monthly cadence are not a fee — the sentence the blocker prints
    // names the three things that are.
    const untouched = [
      services(),
      deliverables(),
      exclusions(),
      roleRates([]),
      ceiling(null),
      deposit(null),
      retainer({
        cents: 0,
        creditRule: "credited",
        activationPolicy: "immediate",
      }),
      cadence("monthly"),
      terms(),
    ];
    const readiness = assess(untouched);
    expect(readiness.blockers.map((blocker) => blocker.message)).toContain(
      noFeeBlocker,
    );
    expect(readiness.ready).toBe(false);
  });

  it("is not satisfied by a retainer and a cadence alone", () => {
    expect(messages([services(), retainer(), cadence(), terms()])).toContain(
      noFeeBlocker,
    );
  });

  it("is not satisfied by a ceiling alone — a cap is not a fee (R22)", () => {
    expect(messages([services(), ceiling(2_400_000), terms()])).toContain(
      noFeeBlocker,
    );
  });

  it("is satisfied by a per-phase fee", () => {
    const perPhase = part({
      partKey: "custom.per_phase",
      kind: "schedule",
      variant: "per_phase",
      title: "Fee by phase",
      payload: {
        phases: [{ key: "concept", label: "Concept", cents: 400_000 }],
      },
    });
    expect(messages([services(), perPhase, terms()])).not.toContain(
      noFeeBlocker,
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

  // M4 of the web walk: a second role added and left blank read
  // "0 OF 9 PARTS NEED ATTENTION", offered Save, and earned
  // `every role on the rate card needs a name` (23514) from the RPC — shown as
  // the generic "The agreement could not be saved." The check above asks only
  // whether SOME role is named, which a named neighbour answers.
  it("R-7: blocks a rate card carrying one named role and one blank one", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.role_rates"),
      roleRates([
        {
          roleName: "Principal designer",
          hourlyRateCents: 22_500,
          sortOrder: 0,
        },
        { roleName: "  ", hourlyRateCents: 15_000, sortOrder: 1 },
      ]),
    ];
    expect(messages(parts)).toContain(
      "Every role on the rate card needs a name.",
    );
  });

  it("R-7: says nothing about names when every role has one", () => {
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.role_rates"),
      roleRates([
        {
          roleName: "Principal designer",
          hourlyRateCents: 22_500,
          sortOrder: 0,
        },
        { roleName: "Junior designer", hourlyRateCents: 15_000, sortOrder: 1 },
      ]),
    ];
    expect(messages(parts)).not.toContain(
      "Every role on the rate card needs a name.",
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

// ── R18 · one part per money variant. The Add menu no longer offers a second
// one; this is what catches a duplicate that arrives any other way, before
// `upsert_agreement_parts` raises 23514 from the room.

describe("assessAgreementReadiness — R18, one part per money variant", () => {
  it("blocks a second ceiling in the RPC's own words", () => {
    const second = part({
      partKey: "custom.second-ceiling",
      kind: "schedule",
      variant: "ceiling",
      title: "Second ceiling",
      payload: { cents: 100_000 },
    });
    const readiness = assess([...nine(), second]);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContainEqual({
      partId: second.id,
      message: "An agreement carries only one ceiling.",
    });
  });

  it("blames the later part, not the one already in the agreement", () => {
    const second = retainer();
    second.id = "part-second-retainer";
    second.partKey = "custom.second-retainer";
    const readiness = assess([...nine(), second]);
    const messages = readiness.blockers
      .filter((blocker) => blocker.message.startsWith("An agreement carries"))
      .map((blocker) => blocker.partId);
    expect(messages).toEqual(["part-second-retainer"]);
  });

  // Wave 1 let an agreement state two flat fees, on the reasoning that
  // nothing projected from either. Wave 2's projection DOES write `fee_basis`
  // from them, so 00577 refuses a second one — "an agreement carries one fee
  // basis" — and the room has to hold it rather than earn the 23514.
  it("holds a second flat fee, which W2's projection can no longer take", () => {
    const first = part({
      partKey: "custom.flat-a",
      kind: "schedule",
      variant: "flat",
      title: "Design fee",
      payload: { cents: 900_000 },
    });
    const second = part({
      partKey: "custom.flat-b",
      kind: "schedule",
      variant: "flat",
      title: "Styling fee",
      payload: { cents: 250_000 },
    });
    const readiness = assess([...nine(), first, second]);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContainEqual({
      partId: second.id,
      message: "An agreement carries one fee basis.",
    });
  });
});

// ── R21 · a money part with no figure in it. `blankPayload` seeds these as
// null now, so the client copy prints nothing; readiness is what stops the
// send while the amount is unwritten.

describe("assessAgreementReadiness — R21, an unwritten amount", () => {
  it("blocks a flat fee with no amount", () => {
    const blank = part({
      partKey: "custom.flat",
      kind: "schedule",
      variant: "flat",
      title: "Flat fee",
      payload: { cents: null },
    });
    const readiness = assess([...nine(), blank]);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContainEqual({
      partId: blank.id,
      message: "Set the amount for Flat fee.",
    });
  });

  it("blocks a fee-by-phase with no phase carrying an amount", () => {
    const blank = part({
      partKey: "custom.per-phase",
      kind: "schedule",
      variant: "per_phase",
      title: "Fee by phase",
      payload: { phases: [] },
    });
    const readiness = assess([...nine(), blank]);
    expect(readiness.blockers).toContainEqual({
      partId: blank.id,
      message: "Set the amount for Fee by phase.",
    });
  });

  it("blocks a blank retainer, which now opens with no amount at all", () => {
    const blank = retainer({
      cents: null,
      creditRule: "credited",
      activationPolicy: "immediate",
    });
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.retainer"),
      blank,
    ];
    const readiness = assess(parts);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContainEqual({
      partId: blank.id,
      message: "Set a valid retainer amount, including zero when none is due.",
    });
  });

  it("takes a written zero as an answer", () => {
    const zero = retainer({
      cents: 0,
      creditRule: "credited",
      activationPolicy: "immediate",
    });
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.retainer"),
      zero,
    ];
    expect(assess(parts).ready).toBe(true);
  });
});

// ── R21/R3-3 · the R4 floor reads only the parts the homeowner reads.

describe("assessAgreementReadiness — the floor is client-facing", () => {
  it("does not let a studio-only fee satisfy an agreement that names none", () => {
    const hiddenFee = part({
      partKey: "custom.internal-fee",
      kind: "schedule",
      variant: "flat",
      title: "Internal fee",
      clientVisible: false,
      payload: { cents: 900_000 },
    });
    const readiness = assess([services(), terms(), hiddenFee]);
    expect(readiness.ready).toBe(false);
    // The floor is unmoved — a fee she cannot read is not a fee she agreed
    // to. What changed is which sentence says so: "This agreement names no
    // fee. Add a rate card, a flat fee, or a per-phase fee." over a Flat fee
    // row the designer is looking at reads as the room losing her work, so
    // R33's own sentence stands in its place, on the part that earned it.
    expect(
      readiness.blockers.some((blocker) =>
        blocker.message.startsWith("This agreement names no fee."),
      ),
    ).toBe(false);
    expect(readiness.blockers).toContainEqual({
      partId: hiddenFee.id,
      message: HIDDEN_FEE_BLOCKER,
    });
  });

  it("still needs a ceiling the client can read beside a rate card she can read", () => {
    const hiddenCeiling = part({
      partKey: "patina.ceiling",
      kind: "schedule",
      variant: "ceiling",
      title: "Ceiling",
      clientVisible: false,
      payload: { cents: 2_400_000 },
    });
    const parts = [
      ...nine().filter((p) => p.partKey !== "patina.ceiling"),
      hiddenCeiling,
    ];
    const readiness = assess(parts);
    expect(
      readiness.blockers.some((blocker) =>
        blocker.message.startsWith("An agreement that bills hourly"),
      ),
    ).toBe(true);
  });

  it("still asks the DATABASE's question of a rate card the client never sees", () => {
    // `_agreement_floor_unmet` (00575) reads every part, visible or not. A
    // room that only asked R21's question would call this ready and then
    // watch the send refuse.
    const hiddenRates = roleRates();
    hiddenRates.clientVisible = false;
    const parts = [
      services(),
      terms(),
      hiddenRates,
      part({
        partKey: "custom.flat",
        kind: "schedule",
        variant: "flat",
        title: "Flat fee",
        payload: { cents: 900_000 },
      }),
    ];
    const readiness = assess(parts);
    expect(readiness.ready).toBe(false);
    expect(
      readiness.blockers.some((blocker) =>
        blocker.message.startsWith("An agreement that bills hourly"),
      ),
    ).toBe(true);
  });
});

// ── R18's second half. `upsert_agreement_parts` raises "an agreement carries
// one fee basis" (check_violation, 00577) for more than one of flat/per_phase
// in ANY combination, and the per-variant duplicate rule cannot see it.

const flatFee = (cents: number | null = 900_000, partKey = "custom.flat") =>
  part({
    partKey,
    kind: "schedule",
    variant: "flat",
    title: "Flat fee",
    payload: { cents },
  });
const feeByPhase = (partKey = "custom.per-phase") =>
  part({
    partKey,
    kind: "schedule",
    variant: "per_phase",
    title: "Fee by phase",
    payload: {
      phases: [{ key: "concept", label: "Concept", cents: 400_000 }],
    },
  });

describe("assessAgreementReadiness — one fee basis (R18 · 00577)", () => {
  const base = () => [services(), terms()];

  it("holds a flat fee standing beside a fee by phase", () => {
    const readiness = assess([...base(), flatFee(), feeByPhase()]);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map((blocker) => blocker.message)).toContain(
      "An agreement carries one fee basis.",
    );
  });

  it("holds two flat fees, differently keyed", () => {
    const messages = assess([
      ...base(),
      flatFee(900_000, "custom.flat-a"),
      flatFee(400_000, "custom.flat-b"),
    ]).blockers.map((blocker) => blocker.message);
    expect(messages).toContain("An agreement carries one fee basis.");
  });

  it("marks the SECOND one, not the first", () => {
    const first = flatFee();
    const second = feeByPhase();
    const readiness = assess([...base(), first, second]);
    const marked = readiness.blockers
      .filter(
        (blocker) => blocker.message === "An agreement carries one fee basis.",
      )
      .map((blocker) => blocker.partId);
    expect(marked).toEqual([second.id]);
  });

  it("says nothing about a single fee basis", () => {
    const readiness = assess([...base(), flatFee()]);
    expect(readiness.blockers.map((blocker) => blocker.message)).not.toContain(
      "An agreement carries one fee basis.",
    );
    expect(readiness.ready).toBe(true);
  });
});

// ── §4.2 — a record-only part is never a blocker on money grounds, but a
// REQUIRED one blocks while its typed payload is empty. Before the W2 payload
// shapes were taught to `scheduleValueIsSet`, every one of these read complete.

describe("assessAgreementReadiness — required Wave 2 fee schedules", () => {
  const withSchedule = (
    variant: string,
    payload: Record<string, unknown>,
    title: string,
  ) => [
    services(),
    terms(),
    flatFee(),
    part({
      partKey: `studio.${variant}`,
      kind: "schedule",
      variant: variant as AgreementPart["variant"],
      title,
      required: true,
      payload,
    }),
  ];

  it.each([
    ["percent_of_cost", "Percent of cost"],
    ["percent_of_spend", "Percent of spend"],
    ["cost_plus", "Cost plus"],
    ["day_rate", "Day rate"],
    ["package", "Package"],
  ])("holds an empty required %s", (variant, title) => {
    const messages = assess(withSchedule(variant, {}, title)).blockers.map(
      (blocker) => blocker.message,
    );
    expect(messages).toContain(`Complete ${title}.`);
  });

  it.each([
    ["percent_of_cost", { basis: "cost", percent: 12 }, "Percent of cost"],
    ["cost_plus", { markupPercent: 18 }, "Cost plus"],
    ["day_rate", { dayRateCents: 120_000, minimumDays: 1 }, "Day rate"],
    [
      "package",
      { name: "One room", priceCents: 850_000, includes: [] },
      "Package",
    ],
  ])("lets a written required %s through", (variant, payload, title) => {
    const messages = assess(
      withSchedule(variant, payload as Record<string, unknown>, title),
    ).blockers.map((blocker) => blocker.message);
    expect(messages).not.toContain(`Complete ${title}.`);
  });

  it("asks nothing of an OPTIONAL empty fee schedule — record only is not a blocker", () => {
    const readiness = assess([
      services(),
      terms(),
      flatFee(),
      part({
        partKey: "studio.package",
        kind: "schedule",
        variant: "package",
        title: "Package",
        payload: {},
      }),
    ]);
    expect(readiness.ready).toBe(true);
  });
});

// ── R33. A fee the studio kept to itself never reaches the money row, so the
// room says so where she typed it rather than letting the figure look live.

describe("R33 — a hidden fee", () => {
  it("blocks, in the sentence the ruling wrote", () => {
    const hidden = part({
      partKey: "custom.hidden-flat",
      kind: "schedule",
      variant: "flat",
      title: "Flat fee",
      clientVisible: false,
      payload: { cents: 800_000 },
    });
    const readiness = assess([
      services(),
      terms(),
      roleRates(),
      ceiling(),
      hidden,
    ]);
    expect(readiness.blockers.map((blocker) => blocker.message)).toContain(
      HIDDEN_FEE_BLOCKER,
    );
    expect(
      readiness.blockers.find(
        (blocker) => blocker.message === HIDDEN_FEE_BLOCKER,
      )?.partId,
    ).toBe(hidden.id);
    expect(readiness.ready).toBe(false);
  });

  it("says nothing about a hidden fee nobody has typed a figure into", () => {
    const readiness = assess([
      services(),
      terms(),
      roleRates(),
      ceiling(),
      part({
        partKey: "custom.hidden-empty",
        kind: "schedule",
        variant: "flat",
        title: "Flat fee",
        clientVisible: false,
        payload: {},
      }),
    ]);
    expect(readiness.blockers.map((blocker) => blocker.message)).not.toContain(
      HIDDEN_FEE_BLOCKER,
    );
  });

  it("does not count a hidden fee as the second fee basis — the database does not either", () => {
    const readiness = assess([
      services(),
      terms(),
      flatFee(),
      part({
        partKey: "custom.hidden-phases",
        kind: "schedule",
        variant: "per_phase",
        title: "Fee by phase",
        clientVisible: false,
        payload: {},
      }),
    ]);
    expect(readiness.blockers.map((blocker) => blocker.message)).not.toContain(
      FEE_BASIS_BLOCKER,
    );
  });

  // The walk found the panel saying "This agreement names no fee. Add a rate
  // card, a flat fee, or a per-phase fee." over a visible Flat fee row, while
  // the sentence that explained why — the ruling's own — was attached to the
  // part and printed nowhere.
  it("does not also say the agreement names no fee when the only fee is the hidden one", () => {
    const hidden = part({
      partKey: "custom.hidden-flat",
      kind: "schedule",
      variant: "flat",
      title: "Flat fee",
      clientVisible: false,
      payload: { cents: 1_500_100 },
    });
    const readiness = assess([services(), terms(), hidden]);
    const messages = readiness.blockers.map((blocker) => blocker.message);
    expect(messages).toContain(HIDDEN_FEE_BLOCKER);
    expect(messages).not.toContain(
      "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
    );
  });

  it("still says the agreement names no fee when there is no fee at all", () => {
    const readiness = assess([services(), terms()]);
    expect(readiness.blockers.map((blocker) => blocker.message)).toContain(
      "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
    );
  });

  it("hands the hidden-fee sentence back for the part that earned it", () => {
    const hidden = part({
      partKey: "custom.hidden-flat",
      kind: "schedule",
      variant: "flat",
      title: "Flat fee",
      clientVisible: false,
      payload: { cents: 1_500_100 },
    });
    const readiness = assess([services(), terms(), hidden]);
    expect(blockersForPart(readiness, hidden.id)).toEqual([HIDDEN_FEE_BLOCKER]);
    expect(blockersForPart(readiness, null)).toEqual([]);
  });
});
