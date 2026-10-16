/**
 * Contract tests for the invoice composer's line assembly (R74b) — the four
 * typed line kinds (00178/00187), their ordering, the single rolled-up time
 * line, the FF&E coverage partition, and milestone billability gating.
 */

import {
  STUDIO_TARGET,
  activeDesignStudios,
  asSentence,
  billingLinesRefusal,
  buildComposerLines,
  canDraftStudioInvoice,
  claimTimeRefusal,
  deriveInvoiceBillingGap,
  dollarsToCents,
  draftInvoiceRefusal,
  partitionFfeBillable,
  stampStudioRefusal,
  studioInvoiceBlocker,
  unbilledMilestones,
  unfilledAllowanceText,
  type ComposerFfeItem,
  type ComposerMilestone,
  type ComposerStudio,
} from "../invoice-composer";

const MILESTONE: ComposerMilestone = {
  id: "m1",
  label: "Design retainer",
  amount_cents: 250_000,
  status: "pending",
};

const FFE_SOFA: ComposerFfeItem = {
  id: "f1",
  name: "Bespoke sofa",
  quantity: 2,
  unit_price_cents: 120_000,
  room: { name: "Living room" },
};

const FFE_NO_ROOM: ComposerFfeItem = {
  id: "f2",
  name: "Brass sconce",
  quantity: null,
  unit_price_cents: 40_000,
  room: null,
};

describe("buildComposerLines", () => {
  it("assembles all four kinds in milestone → ffe → time → adhoc order", () => {
    const lines = buildComposerLines({
      milestones: [MILESTONE],
      ffeItems: [FFE_SOFA],
      timeEntries: [
        { id: "t1", duration_minutes: 90, amount_cents: 18_750 },
        { id: "t2", duration_minutes: 30, amount_cents: 6_250 },
      ],
      adhoc: [{ description: "Site visit", quantity: "2", unitDollars: "150" }],
    });

    expect(lines.map((l) => l.kind)).toEqual([
      "milestone",
      "ffe",
      "time",
      "adhoc",
    ]);
    expect(lines.map((l) => l.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("milestone lines: qty 1, unit = milestone amount, milestoneId carried", () => {
    const [line] = buildComposerLines({
      milestones: [MILESTONE],
      ffeItems: [],
      timeEntries: [],
      adhoc: [],
    });
    expect(line).toMatchObject({
      kind: "milestone",
      milestoneId: "m1",
      description: "Design retainer",
      quantity: 1,
      unitAmountCents: 250_000,
    });
  });

  it("ffe lines: ffeItemId carried (00187), room suffixed, qty × unit intact", () => {
    const lines = buildComposerLines({
      milestones: [],
      ffeItems: [FFE_SOFA, FFE_NO_ROOM],
      timeEntries: [],
      adhoc: [],
    });
    expect(lines[0]).toMatchObject({
      kind: "ffe",
      ffeItemId: "f1",
      description: "Bespoke sofa — Living room",
      quantity: 2,
      unitAmountCents: 120_000,
    });
    // No room → plain name; null quantity defaults to 1.
    expect(lines[1]).toMatchObject({
      kind: "ffe",
      ffeItemId: "f2",
      description: "Brass sconce",
      quantity: 1,
      unitAmountCents: 40_000,
    });
  });

  it("time entries roll into ONE line: qty 1, unit = Σ amounts, provenance in metadata", () => {
    const lines = buildComposerLines({
      milestones: [],
      ffeItems: [],
      timeEntries: [
        { id: "t1", duration_minutes: 90, amount_cents: 18_750 },
        { id: "t2", duration_minutes: 30, amount_cents: 6_250 },
      ],
      adhoc: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: "time",
      quantity: 1,
      unitAmountCents: 25_000,
      metadata: { time_entry_ids: ["t1", "t2"], total_minutes: 120 },
    });
    expect(lines[0].description).toContain("2h");
    expect(lines[0].description).toContain("2 entries");
    // No dated sub-table content when nothing carries a started_at.
    expect(lines[0].metadata).not.toHaveProperty("attribution");
  });

  it("fix round 1 (finding B2) — entries from distinct authors still merge into ONE time line, never one per person", () => {
    const lines = buildComposerLines({
      milestones: [],
      ffeItems: [],
      timeEntries: [
        {
          id: "t1",
          duration_minutes: 60,
          amount_cents: 14_500,
          user_id: "u1",
          member_name: "Maria Alvarez",
          started_at: "2026-09-03T14:00:00Z",
          resolved_rate_cents: 14_500,
        },
        {
          id: "t2",
          duration_minutes: 30,
          amount_cents: 7_500,
          user_id: "u2",
          member_name: "Leah Brooks",
          started_at: "2026-09-04T09:00:00Z",
          resolved_rate_cents: 15_000,
        },
      ],
      adhoc: [],
    });
    const timeLines = lines.filter((l) => l.kind === "time");
    expect(timeLines).toHaveLength(1);
    expect(timeLines[0].description).toBe(
      "Design services — 1h 30m (2 entries)",
    );
    expect(timeLines[0].description).not.toMatch(/Leah|Brooks|Maria|Alvarez/);
    expect(timeLines[0].unitAmountCents).toBe(22_000);
    expect(timeLines[0].metadata).toMatchObject({
      time_entry_ids: ["t1", "t2"],
      total_minutes: 90,
    });
    // sortOrder is sequential across the whole line set.
    expect(lines.map((l) => l.sortOrder)).toEqual([0]);

    // HT-21 — the dated sub-table rides metadata.attribution as JSON,
    // merged and date-ordered across both authors, and carries no member
    // name anywhere (LEAH-15/REP-15: no staffing detail reaches the client).
    const payload = JSON.parse(timeLines[0].metadata!.attribution as string);
    expect(payload).toEqual({
      kind: "patina_time_subtable",
      rows: [
        { date: "2026-09-03", minutes: 60, rateCents: 14_500 },
        { date: "2026-09-04", minutes: 30, rateCents: 15_000 },
      ],
    });
    expect(JSON.stringify(payload)).not.toMatch(/Leah|Brooks|Maria|Alvarez/);
  });

  it("no time entries → no time line at all", () => {
    const lines = buildComposerLines({
      milestones: [MILESTONE],
      ffeItems: [],
      timeEntries: [],
      adhoc: [],
    });
    expect(lines.some((l) => l.kind === "time")).toBe(false);
  });

  it("adhoc rows: blank descriptions and zero amounts are dropped; bad qty → 1", () => {
    const lines = buildComposerLines({
      milestones: [],
      ffeItems: [],
      timeEntries: [],
      adhoc: [
        { description: "  ", quantity: "1", unitDollars: "100" }, // blank → dropped
        { description: "Freight", quantity: "1", unitDollars: "0" }, // zero → dropped
        { description: "Consultation", quantity: "-2", unitDollars: "150.50" },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: "adhoc",
      description: "Consultation",
      quantity: 1, // non-positive qty falls back to 1
      unitAmountCents: 15_050,
    });
  });
});

describe("partitionFfeBillable", () => {
  it("splits billable / covered / unpriced by 00187 coverage", () => {
    const unpriced: ComposerFfeItem = {
      ...FFE_NO_ROOM,
      id: "f3",
      unit_price_cents: null,
    };
    const {
      billable,
      covered,
      unpriced: noPrice,
    } = partitionFfeBillable([FFE_SOFA, FFE_NO_ROOM, unpriced], {
      f2: { coverage: "invoiced" },
      // f1 missing from the map = not covered → treated uninvoiced
    });
    expect(billable.map((i) => i.id)).toEqual(["f1"]);
    expect(covered.map((i) => i.id)).toEqual(["f2"]);
    expect(noPrice.map((i) => i.id)).toEqual(["f3"]);
  });

  it("paid coverage also counts as covered", () => {
    const { covered } = partitionFfeBillable([FFE_SOFA], {
      f1: { coverage: "paid" },
    });
    expect(covered.map((i) => i.id)).toEqual(["f1"]);
  });

  // T-7a (F8): the column defaults to 0 (00066), so a $0 line with no product
  // that is not an allowance prints `Not priced` and has nothing to bill.
  it("holds a $0 line with no product and no allowance out of billable", () => {
    const rough: ComposerFfeItem = {
      ...FFE_NO_ROOM,
      id: "f4",
      unit_price_cents: 0,
      product_id: null,
      item_type: "fixed",
    };
    const productAtZero: ComposerFfeItem = {
      ...rough,
      id: "f5",
      product_id: "p-1",
    };
    const { billable, unpriced } = partitionFfeBillable(
      [rough, productAtZero],
      undefined,
    );
    expect(unpriced.map((i) => i.id)).toEqual(["f4"]);
    expect(billable.map((i) => i.id)).toEqual(["f5"]);
  });

  // F21: an allowance with no price yet is listed but never billable, and it
  // does not count as billed. Once filled, it bills at its real price.
  it("holds an unfilled allowance apart: unselectable, not billed", () => {
    const rug: ComposerFfeItem = {
      id: "rug",
      name: "Area rug, 9 × 12",
      quantity: 1,
      unit_price_cents: 0,
      product_id: null,
      item_type: "allowance",
      budget_max_cents: 450_000,
      room: { name: "Living Room" },
    };
    const nullPrice: ComposerFfeItem = { ...rug, id: "rug-null", unit_price_cents: null };
    const filled: ComposerFfeItem = {
      ...rug,
      id: "rug-filled",
      unit_price_cents: 410_000,
      product_id: "p-rug",
    };
    const { billable, covered, unpriced, unfilled } = partitionFfeBillable(
      [rug, nullPrice, filled],
      undefined,
    );
    expect(unfilled.map((i) => i.id)).toEqual(["rug", "rug-null"]);
    expect(billable.map((i) => i.id)).toEqual(["rug-filled"]);
    expect(covered).toEqual([]);
    expect(unpriced).toEqual([]);
    expect(unfilledAllowanceText(rug)).toBe("Up to $4,500 · bills once it's filled");
  });
});

describe("unbilledMilestones", () => {
  const paid: ComposerMilestone = { ...MILESTONE, id: "m2", status: "paid" };
  const outstanding: ComposerMilestone = {
    ...MILESTONE,
    id: "m3",
    status: "outstanding",
  };

  it("offers pending/outstanding milestones not on a live invoice", () => {
    const result = unbilledMilestones(
      [MILESTONE, paid, outstanding],
      [{ status: "sent", line_items: [{ milestone_id: "m3" }] }],
    );
    expect(result.map((m) => m.id)).toEqual(["m1"]);
  });

  it("a VOID invoice releases its milestone slot", () => {
    const result = unbilledMilestones(
      [outstanding],
      [{ status: "void", line_items: [{ milestone_id: "m3" }] }],
    );
    expect(result.map((m) => m.id)).toEqual(["m3"]);
  });
});

describe("dollarsToCents", () => {
  it("parses currency-ish strings and rounds to whole cents", () => {
    expect(dollarsToCents("1,234.56")).toBe(123_456);
    expect(dollarsToCents("$150")).toBe(15_000);
    expect(dollarsToCents("")).toBe(0);
    expect(dollarsToCents("abc")).toBe(0);
  });
});

// ── The studio invoice — an invoice with no house (R136) ────────────────────

describe("canDraftStudioInvoice", () => {
  const LINE = {
    kind: "adhoc" as const,
    description: "Design consultation, on site (2 h)",
    quantity: 1,
    unitAmountCents: 45_000,
    sortOrder: 0,
  };
  const ready = {
    clientId: "client-1",
    title: "Design consultation · 12 Sept 2026",
    studioId: "studio-1",
    lines: [LINE],
  };

  it("draws when a household, a regarding line, a studio and a line are all present", () => {
    expect(canDraftStudioInvoice(ready)).toBe(true);
  });

  it("refuses without a household (S4)", () => {
    expect(canDraftStudioInvoice({ ...ready, clientId: null })).toBe(false);
  });

  it("refuses a blank or whitespace-only regarding line (S12)", () => {
    expect(canDraftStudioInvoice({ ...ready, title: "" })).toBe(false);
    expect(canDraftStudioInvoice({ ...ready, title: "   " })).toBe(false);
  });

  it("refuses without a studio to number off (S8)", () => {
    expect(canDraftStudioInvoice({ ...ready, studioId: null })).toBe(false);
    expect(canDraftStudioInvoice({ ...ready, studioId: "" })).toBe(false);
  });

  it("refuses with no line that carries money", () => {
    expect(canDraftStudioInvoice({ ...ready, lines: [] })).toBe(false);
  });
});

describe("studio mode line assembly (S6)", () => {
  it("carries ad-hoc lines only — the composer passes no house-bound selection", () => {
    const lines = buildComposerLines({
      milestones: [],
      ffeItems: [],
      timeEntries: [],
      adhoc: [
        {
          description: "Design consultation, on site (2 h)",
          quantity: "1",
          unitDollars: "450",
        },
        { description: "", quantity: "1", unitDollars: "" },
      ],
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: "adhoc",
      description: "Design consultation, on site (2 h)",
      quantity: 1,
      unitAmountCents: 45_000,
      sortOrder: 0,
    });
  });
});

describe("activeDesignStudios", () => {
  const studio = (over: Partial<ComposerStudio>): ComposerStudio => ({
    id: "studio-1",
    name: "Middle West Studio",
    type: "design_studio",
    status: "active",
    ...over,
  });

  it("keeps only active design studios — a manufacturer is not a studio", () => {
    const result = activeDesignStudios([
      studio({}),
      studio({ id: "org-2", type: "manufacturer", name: "Hedges & Co." }),
      studio({ id: "org-3", status: "deactivated", name: "A closed studio" }),
    ]);
    expect(result.map((s) => s.id)).toEqual(["studio-1"]);
  });

  // 00571 draws only against an ACTIVE, NON-GUEST membership of the named
  // studio. A guest membership offered here is an option whose only answer is
  // `insufficient_privilege`, raised verbatim into the composer's error band.
  it("drops a guest membership, whose draw 00571 refuses", () => {
    const result = activeDesignStudios([
      studio({}),
      studio({
        id: "studio-guest",
        name: "Arden & Co.",
        membership: { role: "guest", status: "active" },
      }),
    ]);
    expect(result.map((s) => s.id)).toEqual(["studio-1"]);
  });

  it("drops a membership that is not active", () => {
    const result = activeDesignStudios([
      studio({}),
      studio({
        id: "studio-invited",
        name: "Arden & Co.",
        membership: { role: "member", status: "invited" },
      }),
    ]);
    expect(result.map((s) => s.id)).toEqual(["studio-1"]);
  });

  it("keeps an active non-guest membership", () => {
    const result = activeDesignStudios([
      studio({ membership: { role: "owner", status: "active" } }),
      studio({
        id: "studio-2",
        name: "Verona Interiors",
        membership: { role: "member", status: "active" },
      }),
    ]);
    expect(result.map((s) => s.id)).toEqual(["studio-1", "studio-2"]);
  });

  it("reports the two-studio case the studio line is gated on (S8)", () => {
    const result = activeDesignStudios([
      studio({}),
      studio({ id: "studio-2", name: "Verona Interiors" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("orders by name, so the silent default never rides on row order", () => {
    const verona = studio({ id: "studio-2", name: "Verona Interiors" });
    const middleWest = studio({});
    const arden = studio({ id: "studio-3", name: "Arden & Co." });

    const oneWay = activeDesignStudios([verona, middleWest, arden]);
    const other = activeDesignStudios([middleWest, arden, verona]);

    expect(oneWay.map((s) => s.name)).toEqual([
      "Arden & Co.",
      "Middle West Studio",
      "Verona Interiors",
    ]);
    expect(other.map((s) => s.id)).toEqual(oneWay.map((s) => s.id));
  });

  it("breaks a same-name tie on id, so the first row is still fixed", () => {
    const result = activeDesignStudios([
      studio({ id: "studio-b" }),
      studio({ id: "studio-a" }),
    ]);
    expect(result.map((s) => s.id)).toEqual(["studio-a", "studio-b"]);
  });

  it("leaves the caller\u2019s array untouched", () => {
    const input = [
      studio({ id: "studio-2", name: "Verona Interiors" }),
      studio({}),
    ];
    activeDesignStudios(input);
    expect(input.map((s) => s.id)).toEqual(["studio-2", "studio-1"]);
  });
});

describe("STUDIO_TARGET", () => {
  it("is not a shape a project id could take", () => {
    expect(STUDIO_TARGET).toBe("__studio__");
  });
});

describe("deriveInvoiceBillingGap", () => {
  it("distinguishes client, studio, both missing, and complete projects", () => {
    expect(deriveInvoiceBillingGap({ client_id: null, studio_id: "s1" })).toBe("no-client");
    expect(deriveInvoiceBillingGap({ client_id: "c1", studio_id: null })).toBe("no-studio");
    expect(deriveInvoiceBillingGap({ client_id: null, studio_id: null })).toBe("no-client");
    expect(deriveInvoiceBillingGap({ client_id: "c1", studio_id: "s1" })).toBeNull();
  });
});

// ── US-35 (SQ-1028) — the held act's reasons and the writers' refusals ───────

describe("studioInvoiceBlocker", () => {
  const ready = {
    clientId: "client-1",
    title: "Design consultation",
    studioId: "studio-1",
    lines: [{ kind: "adhoc" as const, description: "Fee", quantity: 1, unitAmountCents: 100, sortOrder: 0 }],
  };

  it("names the first unmet requirement, in the order the composer asks", () => {
    expect(studioInvoiceBlocker({ ...ready, clientId: null, title: "  " })).toBe("household");
    expect(studioInvoiceBlocker({ ...ready, title: "  ", studioId: "" })).toBe("regarding");
    expect(studioInvoiceBlocker({ ...ready, studioId: "", lines: [] })).toBe("studio");
    expect(studioInvoiceBlocker({ ...ready, lines: [] })).toBe("lines");
    expect(studioInvoiceBlocker(ready)).toBeNull();
  });
});

describe("asSentence", () => {
  it("ends a reason with one full stop, never two", () => {
    expect(asSentence("Could not attach the time entries")).toBe("Could not attach the time entries.");
    expect(asSentence("Already ended.")).toBe("Already ended.");
    expect(asSentence("Is it billed?")).toBe("Is it billed?");
  });
});

describe("billingLinesRefusal", () => {
  const names: Record<string, string> = {
    "11111111-1111-1111-1111-111111111111": "Pair of table lamps",
    "22222222-2222-2222-2222-222222222222": "White Glove",
    "33333333-3333-3333-3333-333333333333": "Bespoke sofa",
  };
  const nameOf = (id: string) => names[id];
  const P = "11111111-1111-1111-1111-111111111111";
  const R = "22222222-2222-2222-2222-222222222222";
  const L = "33333333-3333-3333-3333-333333333333";
  const refuse = (reason: string) => billingLinesRefusal(`add_invoice_billing_lines: ${reason}`, nameOf);

  it.each([
    [`purchase ${P} is already billed`, "Pair of table lamps is already on another invoice."],
    [`purchase ${P} was voided`, "Pair of table lamps was voided."],
    [`purchase ${P} is on another project`, "Pair of table lamps belongs to another project."],
    [`purchase ${P} is not billable to the client`, "Pair of table lamps isn't billable to the client."],
    [`purchase ${P} is in EUR, the invoice in USD`, "Pair of table lamps is in a different currency from the invoice."],
    [`purchase ${P} is over the line limit`, "Pair of table lamps is over the $10,000,000 line limit."],
    [`purchase ${P} was refunded`, "Pair of table lamps can no longer be billed."],
    [`rider ${R} has no estimate or actual; enter amountCents`, "White Glove has no estimate or actual yet. Enter a billed amount."],
    [`rider ${R} amount is outside 0 to 1000000000`, "White Glove must bill between $0 and $10,000,000."],
    [`line ${L} has no client price; enter amountCents`, "Bespoke sofa has no client price yet. Set one to bill it."],
    [`line ${L} has no deposit billed; bill it in full instead`, "Bespoke sofa has no deposit billed yet. Bill it in full instead."],
    [`line ${L} was removed`, "Bespoke sofa was removed from the schedule."],
    [`line ${L} is not on this invoice's project`, "Bespoke sofa belongs to another project."],
    [`a deposit of 120000 cents is more than the 100000 cents left to bill on line ${L}`, "The deposit on Bespoke sofa is more than is left to bill."],
    [`a balance of 90000 cents is more than the 50000 cents left on line ${L} after its deposit`, "The balance on Bespoke sofa is more than is left after its deposit."],
    ["a deposit needs depositPct above 0 and at most 100, to two places", "A deposit must be above 0% and at most 100%, to two decimal places."],
    ["invoice 44444444-4444-4444-4444-444444444444 is sent, not a draft", "The invoice stopped being a draft before its lines were added."],
    ["lines must be an array of 1 to 200 objects", "An invoice takes at most 200 billing lines. Untick some and draft again."],
  ])("says %s in the composer's words", (reason, sentence) => {
    expect(refuse(reason)).toBe(sentence);
  });

  it("names an unknown subject by its kind, never by its id", () => {
    const said = billingLinesRefusal(
      "add_invoice_billing_lines: purchase 99999999-9999-9999-9999-999999999999 is already billed",
    );
    expect(said).toBe("A purchase is already on another invoice.");
  });

  it.each([
    ["an unrecognised reason", "add_invoice_billing_lines: purchase p1 exploded into 12 cents"],
    ["an unprefixed message", "TypeError: Failed to fetch"],
    ["no message at all", undefined],
  ])("falls back to one plain sentence for %s", (_label, message) => {
    const said = billingLinesRefusal(message, nameOf);
    expect(said).toBe("The billing lines couldn't be added to the draft.");
    expect(said).not.toMatch(/add_invoice_billing_lines|p1|cents/);
  });
});

describe("draftInvoiceRefusal", () => {
  const RPC = "Failed to create draft invoice: ";
  const STUDIO_RPC = "Failed to create draft studio invoice: ";

  it.each([
    [`${RPC}invoice project not found or access denied`, "This project couldn't be billed from your account. Reload the page in case its client or studio just changed."],
    [`${RPC}invalid draft invoice payload`, "One of the lines couldn't be drafted as it stands. Check each line, then draft again."],
    [`${RPC}An allowance bills once it's filled.`, "An allowance bills once it's filled. Reload the page to see which one isn't yet."],
    [
      `${RPC}invoices are denominated in USD; selection 3f0c9d2e-0000-4000-8000-000000000002 is priced in another currency`,
      "A selection is priced in another currency. Invoices bill in US dollars only.",
    ],
    ["Not authenticated", "You're signed out. Sign in again, then draw the invoice."],
    ["Invoice client does not match the selected project", "This project's client changed after the invoice was started. Reload the page to bill the current client."],
    ["We couldn't find this project. Reload and try again.", "We couldn't find this project. Reload and try again."],
    [`${STUDIO_RPC}studio invoice studio not found or access denied`, "This studio couldn't be billed from your account. Reload the page in case your seat just changed."],
    [`${STUDIO_RPC}studio invoice household not found or access denied`, "That household isn't on this studio's roster. Pick another, or reload the page."],
    [`${STUDIO_RPC}invalid studio invoice payload`, "One of the lines couldn't be drafted as it stands. Check each line, then draft again."],
    [
      `${STUDIO_RPC}a studio invoice carries ad-hoc lines only; milestone, time, and ffe lines are project-bound`,
      "A studio invoice carries its own lines only. Bill pieces, hours and milestones from their project.",
    ],
  ])("says %s in the composer's words, with no retry", (message, sentence) => {
    expect(draftInvoiceRefusal(message)).toEqual({ message: sentence, retryable: false });
  });

  it("keeps a failed project read retryable", () => {
    expect(draftInvoiceRefusal("We couldn't open this project to bill it. Reload and try again.")).toEqual({
      message: "We couldn't open this project to bill it. Reload and try again.",
      retryable: true,
    });
  });

  it.each([
    ["an unrecognised RPC refusal", `${RPC}duplicate key value violates unique constraint "invoices_pkey" (12000 cents)`],
    ["a dropped connection", `${RPC}TypeError: Failed to fetch`],
    ["an unrecognised studio refusal", `${STUDIO_RPC}null value in column "studio_id" (4d1e0000-0000-4000-8000-000000000001)`],
    ["a recognised reason inside other words", `${RPC}lines for invoice project not found or access denied`],
    ["no message at all", undefined],
  ])("falls back to one plain, retryable sentence for %s", (_label, message) => {
    const said = draftInvoiceRefusal(message);
    expect(said).toEqual({ message: "The invoice couldn't be drafted.", retryable: true });
    expect(said.message).not.toMatch(/create_draft_invoice|Failed to create|invoices_pkey|cents|studio_id/);
  });
});

describe("claimTimeRefusal", () => {
  it.each([
    [
      "Some of the selected time entries were just billed on another invoice. Refresh and try again.",
      "Some of these hours were just billed on another invoice.",
    ],
    [
      "Time entry 5b1f0c7e-0000-4000-8000-000000000001 is attached to invoice 9a2e4d10-0000-4000-8000-000000000003; only notes (and detaching the invoice) may change.",
      "Some of these hours were just billed on another invoice.",
    ],
    ["JWT expired", "You're signed out. Sign in again, then draw the invoice."],
    ["permission denied for function claim_time_entries", "You're signed out. Sign in again, then draw the invoice."],
  ])("says %s in the composer's words", (message, sentence) => {
    expect(claimTimeRefusal(message)).toBe(sentence);
  });

  it.each([
    ["an unrecognised refusal", "claim_time_entries: 30000 cents on entry 5b1f0c7e-0000-4000-8000-000000000001 refused"],
    ["a foreign-key refusal", 'insert or update on table "project_time_entries" violates foreign key constraint "fk_time_entries_invoice"'],
    ["no message at all", undefined],
  ])("falls back to one plain sentence for %s", (_label, message) => {
    const said = claimTimeRefusal(message);
    expect(said).toBe("The hours couldn't be attached to the draft.");
    expect(said).not.toMatch(/claim_time_entries|project_time_entries|5b1f0c7e|cents/);
  });
});

describe("stampStudioRefusal", () => {
  it.each([
    ["stamp_project_pricing_studio: this project already names a studio", "This project already names a studio. Reload to see which."],
    ["only an owner or admin of the studio being named may name it", "Only an owner or admin of Middle West Studio can name it here."],
    ["the studio being named must be the studio that EMPLOYS its designer", "Middle West Studio doesn't employ this project's designer, so it can't be named here."],
    ["this studio holds no rate for this project's designer that somebody other than she wrote", "Middle West Studio has no rate for this project's designer yet. Add one on the studio rate card first."],
    ["no actor", "You're signed out. Sign in again to name the studio."],
    ["this project cannot be stamped", "The studio could not be named on this document."],
    [undefined, "The studio could not be named on this document."],
  ])("maps %s", (message, sentence) => {
    expect(stampStudioRefusal(message, "Middle West Studio")).toBe(sentence);
  });
});
