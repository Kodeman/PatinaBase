/**
 * C-31 (00709) — the composer's billing math: deposit then balance on a line,
 * purchases and riders at cost on their own lines, and the R-PB7 override.
 * The writer (add_invoice_billing_lines) re-computes every figure; these are
 * the figures the composer previews and the requests it sends.
 */

import {
  balanceCents,
  balanceOwedItems,
  buildBillingLines,
  clientStageFact,
  depositCents,
  isValidDepositPct,
  lineBillingByItem,
  parseOverrideCents,
  riderAtCostCents,
  riderLabel,
  ridersBillArgs,
  stageSlotWords,
  unbilledRiders,
  type BillingSelection,
  type ComposerFfeItem,
  type ComposerPurchase,
  type ComposerRider,
  type ComposerStageSlot,
  type FactInvoice,
} from "../invoice-composer";

const SOFA: ComposerFfeItem = { id: "f1", name: "Bespoke sofa", quantity: 2, unit_price_cents: 123_457 };
const LAMP: ComposerFfeItem = { id: "f2", name: "Lamp", quantity: 1, unit_price_cents: 40_000 };

const slot = (over: Partial<ComposerStageSlot> = {}): ComposerStageSlot => ({
  ffe_item_id: "f1",
  billing_stage: "deposit",
  billing_stage_pct: 50,
  invoice_id: "inv-1",
  invoice_number: "0217",
  invoice_status: "paid",
  billed_cents: 123_457,
  ...over,
});

const rider = (id: string, over: Partial<ComposerRider> = {}): ComposerRider => ({
  id,
  kind: "white_glove",
  note: null,
  billable_to_client: true,
  invoice_line_id: null,
  estimate_cents: 45_000,
  actual_cents: null,
  purchase_order: { po_number: "1042" },
  ...over,
});

const purchase = (id: string, over: Partial<ComposerPurchase> = {}): ComposerPurchase => ({
  id,
  status: "recorded",
  billable_to_client: true,
  invoice_line_id: null,
  payee_name: "CB2",
  description: "Pair of table lamps",
  purchased_on: "2026-10-03",
  amount_cents: 120_050,
  tax_cents: 9_600,
  buyer_premium_cents: 0,
  shipping_cents: 0,
  ...over,
});

const selection = (over: Partial<BillingSelection> = {}): BillingSelection => ({
  depositItems: [],
  depositPct: 50,
  balanceItems: [],
  billing: new Map(),
  purchases: [],
  riders: [],
  ...over,
});

describe("stage math", () => {
  it("rounds a deposit half away from zero, as the writer does", () => {
    expect(depositCents(246_914, 50)).toBe(123_457);
    expect(depositCents(1_001, 50)).toBe(501); // 500.5 → 501
    expect(depositCents(10_000, 33.33)).toBe(3_333);
    expect(depositCents(12_345, 33.33)).toBe(4_115); // 4114.5885 → 4115
    expect(depositCents(99_999, 100)).toBe(99_999);
  });

  it("accepts a percent above 0, at most 100, to two places", () => {
    expect(isValidDepositPct(50)).toBe(true);
    expect(isValidDepositPct(33.33)).toBe(true);
    expect(isValidDepositPct(100)).toBe(true);
    expect(isValidDepositPct(0)).toBe(false);
    expect(isValidDepositPct(100.01)).toBe(false);
    expect(isValidDepositPct(12.345)).toBe(false);
    expect(isValidDepositPct(NaN)).toBe(false);
  });

  it("never double-bills: a deposit then its balance sums to the line's price", () => {
    for (const price of [1, 999, 1_001, 246_914, 12_345, 1_000_000_000]) {
      for (const pct of [0.01, 10, 33.33, 50, 66.67, 99.99, 100]) {
        const deposit = depositCents(price, pct);
        expect(deposit + balanceCents(price, deposit)).toBe(price);
      }
    }
  });

  it("reads a line's live slots: deposited sum, closed once a full or balance slot exists", () => {
    const billing = lineBillingByItem([
      slot({ ffe_item_id: "f2", billing_stage: "full", billing_stage_pct: null }),
      slot({ billing_stage: "balance", billing_stage_pct: null, invoice_id: "inv-2" }),
      slot(),
    ]);
    expect(billing.get("f1")).toMatchObject({ depositedCents: 123_457, closed: true });
    expect(billing.get("f1")!.slots.map((s) => s.billing_stage)).toEqual(["deposit", "balance"]);
    expect(billing.get("f2")).toMatchObject({ depositedCents: 0, closed: true });
    expect(lineBillingByItem(undefined).size).toBe(0);
  });

  it("offers a balance only to a deposited, open, priced line with something left", () => {
    const billing = lineBillingByItem([
      slot(),
      slot({ ffe_item_id: "f2", billing_stage: "full", billing_stage_pct: null }),
    ]);
    const unpriced = { ...LAMP, id: "f3", unit_price_cents: null };
    const fullyDeposited = { ...LAMP, id: "f4" };
    const more = lineBillingByItem([
      slot({ ffe_item_id: "f3" }),
      slot({ ffe_item_id: "f4", billing_stage_pct: 100, billed_cents: 40_000 }),
    ]);
    expect(balanceOwedItems([SOFA, LAMP], billing).map((i) => i.id)).toEqual(["f1"]);
    expect(balanceOwedItems([unpriced, fullyDeposited], more)).toEqual([]);
  });

  it("names each slot with its stage, number and state", () => {
    expect(stageSlotWords(slot())).toBe("deposit 50% · №0217 · paid");
    expect(
      stageSlotWords(slot({ billing_stage: "balance", billing_stage_pct: null, invoice_status: "sent" })),
    ).toBe("balance · №0217 · billed");
    expect(
      stageSlotWords(slot({ billing_stage: "full", invoice_number: null, invoice_status: "draft" })),
    ).toBe("in full · in draft");
  });
});

describe("the billing writer's lines", () => {
  it("bills a deposit group by percent and a balance as price less the live deposit", () => {
    const billing = lineBillingByItem([slot()]);
    const lines = buildBillingLines(
      selection({ depositItems: [LAMP], depositPct: 40, balanceItems: [SOFA], billing }),
    );
    expect(lines).toEqual([
      {
        request: { ffeItemId: "f2", stage: "deposit", depositPct: 40 },
        description: "Deposit (40%) · Lamp",
        amountCents: 16_000,
      },
      {
        request: { ffeItemId: "f1", stage: "balance" },
        description: "Balance · Bespoke sofa",
        amountCents: 123_457,
      },
    ]);
    // Deposit 50% (123,457) + balance (123,457) = the sofa's 2 × 123,457.
    expect(123_457 + lines[1].amountCents!).toBe(2 * 123_457);
  });

  it("holds a deposit with no figure when the percent is out of range", () => {
    const [line] = buildBillingLines(selection({ depositItems: [LAMP], depositPct: 0 }));
    expect(line.amountCents).toBeNull();
  });

  it("puts each purchase on its own line at cost, sending no override when untouched", () => {
    const lines = buildBillingLines(
      selection({ purchases: [{ subject: purchase("p1") }, { subject: purchase("p2", { description: null }) }] }),
    );
    expect(lines.map((l) => l.request)).toEqual([{ purchaseId: "p1" }, { purchaseId: "p2" }]);
    expect(lines.map((l) => l.amountCents)).toEqual([129_650, 129_650]);
    expect(lines.map((l) => l.description)).toEqual(["Pair of table lamps", "CB2"]);
  });

  it("puts each rider on its own line at cost: the actual, else the estimate", () => {
    const lines = buildBillingLines(
      selection({
        riders: [
          { subject: rider("r1", { actual_cents: 52_000 }) },
          { subject: rider("r2", { kind: "liftgate", note: " second floor " }) },
        ],
      }),
    );
    expect(lines).toEqual([
      { request: { costLineId: "r1" }, description: "White Glove", amountCents: 52_000 },
      { request: { costLineId: "r2" }, description: "Liftgate · second floor", amountCents: 45_000 },
    ]);
  });

  it("sends an override only when it differs from cost, and holds a rider with no figure", () => {
    const lines = buildBillingLines(
      selection({
        purchases: [
          { subject: purchase("p1"), overrideText: "$1,500" },
          { subject: purchase("p2"), overrideText: "1296.50" },
          { subject: purchase("p3"), overrideText: "0" },
        ],
        riders: [
          { subject: rider("r1", { estimate_cents: null }) },
          { subject: rider("r2", { estimate_cents: null }), overrideText: "175.5" },
          { subject: rider("r3"), overrideText: "twelve" },
        ],
      }),
    );
    expect(lines.map((l) => [l.request, l.amountCents])).toEqual([
      [{ purchaseId: "p1", amountCents: 150_000 }, 150_000],
      [{ purchaseId: "p2" }, 129_650],
      [{ purchaseId: "p3", amountCents: 0 }, 0],
      [{ costLineId: "r1" }, null],
      [{ costLineId: "r2", amountCents: 17_550 }, 17_550],
      [{ costLineId: "r3" }, null],
    ]);
  });

  it("parses an override strictly, so a typo never bills as $0", () => {
    expect(parseOverrideCents("1,234.5")).toBe(123_450);
    expect(parseOverrideCents(" $80 ")).toBe(8_000);
    expect(parseOverrideCents("0")).toBe(0);
    expect(parseOverrideCents("")).toBeNull();
    expect(parseOverrideCents("-5")).toBeNull();
    expect(parseOverrideCents("1.234")).toBeNull();
    expect(parseOverrideCents("abc")).toBeNull();
    expect(parseOverrideCents("10000001")).toBeNull();
  });
});

describe("the riders door", () => {
  it("reads only billable riders on no invoice line, and opens the composer on them", () => {
    const rows = [rider("a"), rider("billed", { invoice_line_id: "il-1" }), rider("own", { billable_to_client: false }), rider("b")];
    const unbilled = unbilledRiders(rows);
    expect(unbilled.map((r) => r.id)).toEqual(["a", "b"]);
    expect(unbilledRiders(undefined)).toEqual([]);
    expect(ridersBillArgs("proj-1", unbilled)).toEqual({ projectId: "proj-1", initialCostLineIds: ["a", "b"] });
  });

  it("costs a rider at its actual, else its estimate, else nothing", () => {
    expect(riderAtCostCents({ actual_cents: 1, estimate_cents: 2 })).toBe(1);
    expect(riderAtCostCents({ actual_cents: null, estimate_cents: 2 })).toBe(2);
    expect(riderAtCostCents({ actual_cents: null, estimate_cents: null })).toBeNull();
    expect(riderLabel({ kind: "receiving_fee", note: "" })).toBe("Receiving Fee");
  });
});

describe("the Money cell's quiet fact", () => {
  const fmt = (iso: string) => `<${iso.slice(0, 10)}>`;
  const invoices = (rows: FactInvoice[]) => new Map(rows.map((r) => [r.id, r]));

  it("dates a paid deposit and says the balance is unbilled", () => {
    expect(
      clientStageFact(
        lineBillingByItem([slot()]).get("f1"),
        invoices([{ id: "inv-1", status: "paid", issue_date: "2026-10-03", paid_at: "2026-10-06T15:00:00Z" }]),
        fmt,
      ),
    ).toBe("Client deposit billed <2026-10-03> · paid <2026-10-06> · balance unbilled");
  });

  it("reads deposit and balance in order, a draft without a date", () => {
    const billing = lineBillingByItem([
      slot({ billing_stage: "balance", billing_stage_pct: null, invoice_id: "inv-2" }),
      slot({ invoice_status: "sent" }),
    ]).get("f1");
    expect(
      clientStageFact(
        billing,
        invoices([
          { id: "inv-1", status: "sent", issue_date: null, sent_at: "2026-10-03T09:00:00Z" },
          { id: "inv-2", status: "draft" },
        ]),
        fmt,
      ),
    ).toBe("Client deposit billed <2026-10-03> · balance in draft");
  });

  it("stays silent for a line billed in full or not at all", () => {
    const full = lineBillingByItem([slot({ billing_stage: "full", billing_stage_pct: null })]).get("f1");
    expect(clientStageFact(full, new Map(), fmt)).toBeNull();
    expect(clientStageFact(undefined, new Map(), fmt)).toBeNull();
  });
});
