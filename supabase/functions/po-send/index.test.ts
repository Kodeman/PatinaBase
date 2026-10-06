// Deno test for the po-send pure helpers (Wave 4, W4-T3).
// Run: deno test supabase/functions/po-send/index.test.ts
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve.
// Network-touching behavior (auth, storage, Resend) is exercised by the
// local `supabase functions serve` smoke flow, not here.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildFallbackSidemark,
  buildSchedulePoProposal,
  type CallerRpcClient,
  callerMaySendPurchaseOrder,
  checkPoRepricingGate,
  checkPoTotalsCoherence,
  PO_NEEDS_REPRICING_DETAIL,
  PO_OUT_OF_SYNC_DETAIL,
  PO_SENT_NO_THREAD_PHASE_NOTE,
  parsePoSendBody,
  paymentPatternLabel,
  paymentRowLabel,
  readStudioOrdersEmail,
  resolvePoShipTo,
  resolveVendorRecipient,
  SHIP_TO_NOT_SET_LABEL,
  SHIP_TO_REQUIRED_DETAIL,
  vendorConfigurationLines,
  vendorSafeSpecNotes,
} from "./lib.ts";
import configurationSpecFixture from "./fixtures/configuration-snapshot.fixture.json" with {
  type: "json",
};

// ─── parsePoSendBody — payload validation ────────────────────────────────────

Deno.test("parsePoSendBody rejects non-object bodies", () => {
  for (const bad of [null, undefined, 42, "po-1", ["po-1"]]) {
    const result = parsePoSendBody(bad);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_body");
  }
});

Deno.test("parsePoSendBody requires purchaseOrderId", () => {
  for (const body of [{}, { purchaseOrderId: "" }, { purchaseOrderId: "   " }, { purchaseOrderId: 7 }]) {
    const result = parsePoSendBody(body);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "purchaseOrderId_required");
  }
});

Deno.test("parsePoSendBody rejects unknown modes", () => {
  const result = parsePoSendBody({ purchaseOrderId: "po-1", mode: "emailify" });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "invalid_mode");
});

Deno.test("parsePoSendBody defaults mode to send and ccDesigner to false", () => {
  const result = parsePoSendBody({ purchaseOrderId: "po-1" });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.payload.mode, "send");
    assertEquals(result.payload.ccDesigner, false);
    assertEquals(result.payload.recipientEmail, undefined);
    assertEquals(result.payload.message, undefined);
  }
});

Deno.test("parsePoSendBody accepts each valid mode", () => {
  for (const mode of ["preview", "send", "mark_sent"] as const) {
    const result = parsePoSendBody({ purchaseOrderId: "po-1", mode });
    assertEquals(result.ok, true);
    if (result.ok) assertEquals(result.payload.mode, mode);
  }
});

Deno.test("parsePoSendBody carries the full payload through", () => {
  const result = parsePoSendBody({
    purchaseOrderId: " po-1 ",
    mode: "send",
    recipientEmail: " orders@vendor.test ",
    message: "  Please rush this one.  ",
    ccDesigner: true,
  });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.payload, {
      purchaseOrderId: "po-1",
      mode: "send",
      recipientEmail: "orders@vendor.test",
      message: "Please rush this one.",
      ccDesigner: true,
    });
  }
});

Deno.test("parsePoSendBody rejects a malformed recipientEmail override", () => {
  for (const recipientEmail of ["", "   ", "not-an-email", 42]) {
    const result = parsePoSendBody({ purchaseOrderId: "po-1", recipientEmail });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_recipient");
  }
});

Deno.test("parsePoSendBody treats non-true ccDesigner as false", () => {
  const result = parsePoSendBody({ purchaseOrderId: "po-1", ccDesigner: "yes" });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.payload.ccDesigner, false);
});

// ─── needs_repricing — final release guard ─────────────────────────────────

Deno.test("repricing blocks send and mark_sent before any release side effect", () => {
  for (const mode of ["send", "mark_sent"] as const) {
    const calls = { render: 0, send: 0, mark: 0 };
    const gate = checkPoRepricingGate({ needs_repricing: true }, mode);
    if (gate.ok) {
      calls.render += 1;
      if (mode === "send") calls.send += 1;
      calls.mark += 1;
    }
    assertEquals(gate, {
      ok: false,
      error: "po_needs_repricing",
      detail: PO_NEEDS_REPRICING_DETAIL,
    });
    assertEquals(calls, { render: 0, send: 0, mark: 0 });
  }
});

Deno.test("repricing payload is strictly boolean and preview remains diagnostic-only", () => {
  assertEquals(checkPoRepricingGate({ needs_repricing: false }, "send"), {
    ok: true,
    needsRepricing: false,
  });
  assertEquals(checkPoRepricingGate({ needs_repricing: true }, "preview"), {
    ok: true,
    needsRepricing: true,
  });
  for (const value of [{}, { needs_repricing: "true" }, null]) {
    assertEquals(checkPoRepricingGate(value, "send"), {
      ok: false,
      error: "invalid_po_state",
      detail: "Purchase order repricing state is unavailable.",
    });
  }
});

// ─── resolveVendorRecipient — the 00188 fallback chain ───────────────────────

Deno.test("resolveVendorRecipient prefers the explicit override", () => {
  assertEquals(
    resolveVendorRecipient(
      { orders_email: "orders@vendor.test", contact_info: { email: "info@vendor.test" } },
      "override@vendor.test",
    ),
    "override@vendor.test",
  );
});

Deno.test("resolveVendorRecipient falls back to orders_email", () => {
  assertEquals(
    resolveVendorRecipient({
      orders_email: " orders@vendor.test ",
      contact_info: { email: "info@vendor.test" },
    }),
    "orders@vendor.test",
  );
});

Deno.test("resolveVendorRecipient falls back to contact_info email", () => {
  assertEquals(
    resolveVendorRecipient({ orders_email: null, contact_info: { email: "info@vendor.test" } }),
    "info@vendor.test",
  );
  // Blank orders_email falls through too.
  assertEquals(
    resolveVendorRecipient({ orders_email: "  ", contact_info: { email: "info@vendor.test" } }),
    "info@vendor.test",
  );
});

Deno.test("resolveVendorRecipient returns null when nothing is usable", () => {
  assertEquals(resolveVendorRecipient(null), null);
  assertEquals(resolveVendorRecipient({}), null);
  assertEquals(resolveVendorRecipient({ orders_email: null, contact_info: null }), null);
  assertEquals(resolveVendorRecipient({ contact_info: { email: 42 } }), null);
  assertEquals(resolveVendorRecipient({ contact_info: { email: "  " } }), null);
});

// ─── C-12: the studio account's orders inbox ────────────────────────────────

Deno.test("resolveVendorRecipient sends to the studio's orders_email_override first", () => {
  const vendor = { orders_email: "orders@vendor.test", contact_info: { email: "info@vendor.test" } };
  // Every send surface passes the vendor's shared address as the override
  // (clientVendorEmailHint), so the studio's inbox must beat it.
  assertEquals(
    resolveVendorRecipient(vendor, "orders@vendor.test", " jane@vendor.test "),
    "jane@vendor.test",
  );
  assertEquals(resolveVendorRecipient(vendor, undefined, "jane@vendor.test"), "jane@vendor.test");
});

Deno.test("resolveVendorRecipient falls back to the vendor email when the studio sets none", () => {
  const vendor = { orders_email: "orders@vendor.test", contact_info: { email: "info@vendor.test" } };
  assertEquals(resolveVendorRecipient(vendor, undefined, null), "orders@vendor.test");
  assertEquals(resolveVendorRecipient(vendor, undefined, "   "), "orders@vendor.test");
  assertEquals(
    resolveVendorRecipient({ orders_email: null, contact_info: { email: "info@vendor.test" } }, undefined, null),
    "info@vendor.test",
  );
});

Deno.test("readStudioOrdersEmail reads the override through get_studio_vendor_accounts as the caller", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const read = await readStudioOrdersEmail(
    fakeCallerClient(
      { data: [{ orders_email_override: "jane@vendor.test", archived_at: null }], error: null },
      calls,
    ),
    "studio-1",
    "vendor-1",
  );
  assertEquals(read, { ok: true, email: "jane@vendor.test" });
  assertEquals(calls, [
    { fn: "get_studio_vendor_accounts", args: { p_org: "studio-1", p_vendor_id: "vendor-1" } },
  ]);
});

Deno.test("readStudioOrdersEmail reads null for no studio, no account, an archived account or a blank override", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  // A personal project has no studio: no read at all.
  assertEquals(
    await readStudioOrdersEmail(fakeCallerClient({ data: [], error: null }, calls), null, "vendor-1"),
    { ok: true, email: null },
  );
  assertEquals(calls, []);
  for (const data of [
    [], // no account, or the caller is not a member (the RPC returns no rows)
    null,
    [{ orders_email_override: null, archived_at: null }],
    [{ orders_email_override: "  ", archived_at: null }],
    [{ orders_email_override: "jane@vendor.test", archived_at: "2026-10-01T00:00:00Z" }],
  ]) {
    assertEquals(
      await readStudioOrdersEmail(fakeCallerClient({ data, error: null }), "studio-1", "vendor-1"),
      { ok: true, email: null },
    );
  }
});

Deno.test("readStudioOrdersEmail reports a failed read instead of guessing", async () => {
  assertEquals(
    await readStudioOrdersEmail(
      fakeCallerClient({ data: null, error: { message: "function does not exist" } }),
      "studio-1",
      "vendor-1",
    ),
    { ok: false, detail: "function does not exist" },
  );
});

// ─── buildFallbackSidemark ───────────────────────────────────────────────────

Deno.test("buildFallbackSidemark uses studio initials + client surname", () => {
  assertEquals(
    buildFallbackSidemark({
      studioName: "Middle West Studio",
      clientName: "Walker",
      projectName: "Walker Residence",
    }),
    "MWS-WALKER",
  );
});

Deno.test("buildFallbackSidemark falls back to the project name", () => {
  assertEquals(
    buildFallbackSidemark({ studioName: "Middle West Studio", projectName: "Chen Residence" }),
    "MWS-CHENRESI",
  );
});

Deno.test("buildFallbackSidemark omits empty segments entirely", () => {
  assertEquals(buildFallbackSidemark({ clientName: "Walker" }), "WALKER");
  assertEquals(buildFallbackSidemark({}), "");
});

// ─── display labels ──────────────────────────────────────────────────────────

Deno.test("paymentPatternLabel maps every pattern", () => {
  assertEquals(paymentPatternLabel("fifty_fifty"), "50% deposit, 50% balance");
  assertEquals(paymentPatternLabel("thirty_seventy"), "30% deposit, 70% balance");
  assertEquals(paymentPatternLabel("full_upfront"), "100% up front");
  assertEquals(paymentPatternLabel("net_30"), "Net 30");
  assertEquals(paymentPatternLabel("custom_milestones"), "Custom milestones");
  // Unknown values pass through rather than crashing the document.
  assertEquals(paymentPatternLabel("weird_future_pattern"), "weird_future_pattern");
});

Deno.test("paymentRowLabel prefers the explicit label, else capitalizes kind", () => {
  assertEquals(paymentRowLabel({ kind: "milestone", label: "On ship" }), "On ship");
  assertEquals(paymentRowLabel({ kind: "deposit", label: null }), "Deposit");
  assertEquals(paymentRowLabel({ kind: "balance", label: "  " }), "Balance");
});

// ─── checkPoTotalsCoherence — the W4-T4 send guard ───────────────────────────

Deno.test("checkPoTotalsCoherence passes a post-00186 PO (trade == total == schedule)", () => {
  // fifty_fifty over a 120_000 trade total: floor + remainder sums exactly.
  const result = checkPoTotalsCoherence(
    120_000,
    [{ amount_cents: 60_000 }, { amount_cents: 60_000 }],
    [
      { trade_price_cents: 40_000, unit_price_cents: 50_000, quantity: 1 },
      { trade_price_cents: 40_000, unit_price_cents: 50_000, quantity: 1 },
      { trade_price_cents: 40_000, unit_price_cents: 50_000, quantity: 1 },
    ],
  );
  assertEquals(result, {
    poTotalCents: 120_000,
    tradeTotalCents: 120_000,
    paymentsTotalCents: 120_000,
    coherent: true,
  });
});

Deno.test("checkPoTotalsCoherence flags a pre-00186 client-price PO", () => {
  // Legacy PO: total_cents AND the schedule were derived from the CLIENT
  // total (3 × 50_000) while the trade line table sums to 3 × 40_000 —
  // sending would print an incoherent schedule AND disclose the markup.
  // mode 'send' must 422 po_out_of_sync.
  const result = checkPoTotalsCoherence(
    150_000,
    [{ amount_cents: 75_000 }, { amount_cents: 75_000 }],
    [
      { trade_price_cents: 40_000, unit_price_cents: 50_000, quantity: 1 },
      { trade_price_cents: 40_000, unit_price_cents: 50_000, quantity: 1 },
      { trade_price_cents: 40_000, unit_price_cents: 50_000, quantity: 1 },
    ],
  );
  assertEquals(result.poTotalCents, 150_000);
  assertEquals(result.paymentsTotalCents, 150_000);
  assertEquals(result.tradeTotalCents, 120_000);
  assertEquals(result.coherent, false);
});

Deno.test("checkPoTotalsCoherence flags post-creation item re-pricing drift", () => {
  // The PO was coherent at creation (100_000), then a linked item's trade
  // price changed — the PDF would print 90_000 of lines under a 100_000
  // schedule. Both sums are compared against total_cents, so this trips
  // even though the schedule still matches the stored total.
  const result = checkPoTotalsCoherence(
    100_000,
    [{ amount_cents: 50_000 }, { amount_cents: 50_000 }],
    [{ trade_price_cents: 45_000, unit_price_cents: 55_000, quantity: 2 }], // 90_000
  );
  assertEquals(result.tradeTotalCents, 90_000);
  assertEquals(result.paymentsTotalCents, 100_000);
  assertEquals(result.coherent, false);
});

Deno.test("checkPoTotalsCoherence flags a schedule that drifted from total_cents", () => {
  // Lines still sum to total_cents but a payment row went missing — the
  // printed schedule wouldn't add up to the document total.
  const result = checkPoTotalsCoherence(
    120_000,
    [{ amount_cents: 60_000 }],
    [{ trade_price_cents: 40_000, unit_price_cents: 50_000, quantity: 3 }],
  );
  assertEquals(result.tradeTotalCents, 120_000);
  assertEquals(result.paymentsTotalCents, 60_000);
  assertEquals(result.coherent, false);
});

Deno.test("checkPoTotalsCoherence uses the COALESCE(trade, unit, 0) × qty line math", () => {
  // No trade price → unit price wins; null both → 0; quantity defaults to 1.
  const result = checkPoTotalsCoherence(
    110_000,
    [{ amount_cents: 110_000 }],
    [
      { trade_price_cents: null, unit_price_cents: 50_000, quantity: 2 }, // 100_000
      { trade_price_cents: 10_000, unit_price_cents: 99_999 },            // 10_000 (qty 1)
      { trade_price_cents: null, unit_price_cents: null, quantity: 5 },   // 0
    ],
  );
  assertEquals(result.tradeTotalCents, 110_000);
  assertEquals(result.coherent, true);
});

Deno.test("PO_OUT_OF_SYNC_DETAIL is the designer-facing recreate-or-mark-sent message", () => {
  // The portal renders this verbatim (poSendErrorMessage in
  // po-send-actions.tsx duplicates the string) — pin the copy so a
  // server-side edit can't silently desync the two.
  assertEquals(
    PO_OUT_OF_SYNC_DETAIL,
    "This PO's payment schedule no longer matches its item pricing — item prices " +
      "may have changed since creation, or the PO predates trade-cost totals. " +
      "Recreate the PO or mark it sent manually.",
  );
});

// ─── vendorSafeSpecNotes ─────────────────────────────────────────────────────

Deno.test("vendorSafeSpecNotes strips Internal: lines", () => {
  assertEquals(
    vendorSafeSpecNotes("COM fabric, 12 yd\nInternal: client haggled this down\nLead time 8wk"),
    "COM fabric, 12 yd\nLead time 8wk",
  );
});

Deno.test("vendorSafeSpecNotes returns null when nothing vendor-safe remains", () => {
  assertEquals(vendorSafeSpecNotes("Internal: margin is 38%"), null);
  assertEquals(vendorSafeSpecNotes("  "), null);
  assertEquals(vendorSafeSpecNotes(null), null);
  assertEquals(vendorSafeSpecNotes(undefined), null);
});

// ─── vendorConfigurationLines (P0-1 — "the PO finally says Walnut") ──────────

Deno.test("vendorConfigurationLines renders the full configured block from the fixture", () => {
  assertEquals(vendorConfigurationLines(configurationSpecFixture), [
    'Variant: 96" Bench Seat (VEN-SOFA-96-COM)',
    "Wood: Walnut",
    "Hardware Finish: Antique Brass",
    "Upholstery: Customer's Own Material",
    "Components: Left Arm (left) · Seat Module ×2",
    "Dims: 96 × 40 × 33 in",
    "COM: Belgian Linen 12 — Rogers & Goffigon, Cascade",
    "COM yardage: 14 yds, railroaded",
    "COM ship-to: Halden Receiving, 22 Mill Rd, High Point NC",
    "Sidemark: MWS-HARLOW",
    "Lead time provisional until COM fabric received",
    "Config ref: 9f2c1a77b0de",
  ]);
});

Deno.test("vendorConfigurationLines never leaks retail price, markup, or a Commercial line", () => {
  // The vendor document prints trade line amounts and nothing else about
  // money. The snapshot carries retailPriceCents (1240000) and per-selection
  // retail deltas — none of it may reach the page.
  const rendered = vendorConfigurationLines(configurationSpecFixture).join("\n");
  for (const banned of [
    "1240000",
    "12,400",
    "retail",
    "Retail",
    "markup",
    "Markup",
    "margin",
    "Margin",
    "Commercial",
    "868000",
    "$",
  ]) {
    assert(
      !rendered.includes(banned),
      `vendor spec block leaked "${banned}":\n${rendered}`,
    );
  }
});

Deno.test("vendorConfigurationLines prints every selection group, not just the first four", () => {
  const lines = vendorConfigurationLines({
    configuration_snapshot: {
      productName: "Wide Bed",
      selections: [
        { groupName: "Wood", valueLabel: "Walnut" },
        { groupName: "Size", valueLabel: "King" },
        { groupName: "Hardware", valueLabel: "Brass" },
        { groupName: "Nailhead", valueLabel: "None" },
        { groupName: "Leg", valueLabel: "Tapered" },
        { groupName: "Piping", valueLabel: "Self" },
      ],
    },
  });
  assertEquals(lines, [
    "Wood: Walnut",
    "Size: King",
    "Hardware: Brass",
    "Nailhead: None",
    "Leg: Tapered",
    "Piping: Self",
  ]);
});

Deno.test("vendorConfigurationLines falls back to codes and omits an unmatched variant", () => {
  const lines = vendorConfigurationLines({
    configuration_snapshot: {
      productName: "Plain Lamp",
      variant: null,
      selections: [{ groupCode: "shade", valueCode: "linen-drum" }],
      components: [],
      dimensions: {},
    },
  });
  assertEquals(lines, ["shade: linen-drum"]);
});

Deno.test("vendorConfigurationLines reads a camelCase envelope and an array embed", () => {
  const camel = {
    configurationSnapshot: { selections: [{ groupName: "Wood", valueLabel: "Oak" }] },
    configurationSnapshotHash: "abcdef0123456789",
  };
  assertEquals(vendorConfigurationLines(camel), [
    "Wood: Oak",
    "Config ref: abcdef012345",
  ]);
  // PostgREST returns an object for a UNIQUE-FK embed; tolerate the array
  // form so a query-shape change can't silently blank the spec block.
  assertEquals(vendorConfigurationLines([camel]), [
    "Wood: Oak",
    "Config ref: abcdef012345",
  ]);
});

Deno.test("vendorConfigurationLines emits COM lines only for the parts present, always the provisional warning", () => {
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {
        selections: [],
        comDetails: { fabricName: "Mohair 4", railroaded: true },
      },
    }),
    [
      "COM: Mohair 4",
      "COM yardage: railroaded",
      "Lead time provisional until COM fabric received",
    ],
  );
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {
        selections: [],
        comDetails: { yardage: 8 },
      },
    }),
    ["COM yardage: 8 yds", "Lead time provisional until COM fabric received"],
  );
});

Deno.test("vendorConfigurationLines falls back to flat spec fields when the snapshot is empty", () => {
  assertEquals(
    vendorConfigurationLines({
      configuration_id: null,
      configuration_snapshot: {},
      configuration_snapshot_hash: null,
      sku: "ACME-114",
      material: "White Oak",
      finish: "Oiled",
      color_fabric: "Flax",
      selected_dimensions: { width: 72, depth: 36, height: 30, unit: "in" },
    }),
    [
      "SKU: ACME-114",
      "Material: White Oak",
      "Finish: Oiled",
      "Color/Fabric: Flax",
      "Dims: 72 × 36 × 30 in",
    ],
  );
});

// ─── C-06: spec → product master fallback ───────────────────────────────────

const PRODUCT_MASTER = {
  sku: "LIB-SOFA-88",
  finish: "Cerused Oak",
  materials: ["White Oak", "Linen"],
  colors: ["Natural"],
  dimensions: { width: 88, depth: 38, height: 32, unit: "in" },
};

Deno.test("vendorConfigurationLines falls back to the product master when the placed spec row is empty", () => {
  // Placement inserts the spec row with only (ffe_item_id, routing_source).
  const emptySpec = {
    configuration_id: null,
    configuration_snapshot: {},
    configuration_snapshot_hash: null,
    sku: null,
    material: null,
    finish: null,
    color_fabric: null,
    selected_dimensions: {},
  };
  // materials holds two options, so no Material line; colors holds one.
  assertEquals(vendorConfigurationLines(emptySpec, PRODUCT_MASTER), [
    "SKU: LIB-SOFA-88",
    "Finish: Cerused Oak",
    "Color/Fabric: Natural",
    "Dims: 88 × 38 × 32 in",
  ]);
  // No spec row at all still resolves from the product.
  assertEquals(vendorConfigurationLines(null, PRODUCT_MASTER)[0], "SKU: LIB-SOFA-88");
});

Deno.test("vendorConfigurationLines resolves each field spec first, product second", () => {
  assertEquals(
    vendorConfigurationLines(
      {
        configuration_snapshot: {},
        sku: "  ",
        finish: "Ebonized",
        selected_dimensions: { width: 90, depth: 40, height: 30, unit: "in" },
      },
      PRODUCT_MASTER,
    ),
    [
      "SKU: LIB-SOFA-88",
      "Finish: Ebonized",
      "Color/Fabric: Natural",
      "Dims: 90 × 40 × 30 in",
    ],
  );
});

Deno.test("vendorConfigurationLines prints a product list value only when it holds exactly one", () => {
  // Single value: printed as the choice.
  assertEquals(
    vendorConfigurationLines(
      { configuration_snapshot: {} },
      { materials: ["Jute"], colors: [" Natural "] },
    ),
    ["Material: Jute", "Color/Fabric: Natural"],
  );
  // Several options: nothing, never "Ivory, Sand, Sage".
  assertEquals(
    vendorConfigurationLines(
      { configuration_snapshot: {} },
      { materials: ["Wool", "Cotton"], colors: ["Ivory", "Sand", "Sage"] },
    ),
    [],
  );
  // A blank entry does not count as a second option.
  assertEquals(
    vendorConfigurationLines({ configuration_snapshot: {} }, { colors: ["Sand", "  "] }),
    ["Color/Fabric: Sand"],
  );
  // A specified value still wins over a multi-value product list.
  assertEquals(
    vendorConfigurationLines(
      { configuration_snapshot: {}, color_fabric: "Sage" },
      { colors: ["Ivory", "Sand", "Sage"] },
    ),
    ["Color/Fabric: Sage"],
  );
});

Deno.test("vendorConfigurationLines honours N/A declarations before spec and product", () => {
  const declared = (reason: string) => ({ na: true, reason, declared_at: "2026-10-01T00:00:00Z" });
  // Contract keys (colorFabric, dimensions): a declared field never falls back.
  assertEquals(
    vendorConfigurationLines(
      {
        configuration_snapshot: {},
        sku: "SPEC-SKU",
        finish: "Ebonized",
        na_declarations: {
          sku: declared("Custom piece"),
          finish: declared("Unfinished"),
          colorFabric: declared("COM"),
          dimensions: declared("Made to measure"),
        },
      },
      { ...PRODUCT_MASTER, materials: ["White Oak"] },
    ),
    ["Material: White Oak"],
  );
  // Column-name keys work too; a declaration without a reason is not N/A.
  assertEquals(
    vendorConfigurationLines(
      {
        configuration_snapshot: {},
        na_declarations: {
          color_fabric: declared("COM"),
          material: { na: true, reason: "  " },
        },
      },
      { materials: ["White Oak"], colors: ["Natural"] },
    ),
    ["Material: White Oak"],
  );
});

Deno.test("vendorConfigurationLines keeps the configuration snapshot ahead of the product master", () => {
  const configured = vendorConfigurationLines(configurationSpecFixture, PRODUCT_MASTER);
  assertEquals(configured, vendorConfigurationLines(configurationSpecFixture));
  assert(configured.every((line) => !line.includes("LIB-SOFA-88")));
  assert(configured.every((line) => !line.includes("Cerused Oak")));
});

Deno.test("vendorConfigurationLines keeps the product dimension allowlist (PRIV-4)", () => {
  assertEquals(
    vendorConfigurationLines(
      { configuration_snapshot: {} },
      { dimensions: { diameter: 40, tradePrice: 900, unit: "in" } },
    ),
    ["Dims: diameter 40 in"],
  );
});

// ─── C-02: ship-to (R-PB3) ───────────────────────────────────────────────────

Deno.test("resolvePoShipTo refuses send with no ship-to", () => {
  for (const empty of [null, undefined, "", "   "]) {
    assertEquals(resolvePoShipTo(empty, "send"), {
      ok: false,
      error: "ship_to_required",
      detail: SHIP_TO_REQUIRED_DETAIL,
    });
  }
});

Deno.test("resolvePoShipTo still renders preview and mark_sent, marked not set", () => {
  for (const mode of ["preview", "mark_sent"] as const) {
    assertEquals(resolvePoShipTo(null, mode), {
      ok: true,
      shipTo: null,
      printed: SHIP_TO_NOT_SET_LABEL,
    });
  }
  assertEquals(SHIP_TO_NOT_SET_LABEL, "Ship-to not set");
});

Deno.test("resolvePoShipTo prints an explicit ship-to in every mode", () => {
  for (const mode of ["preview", "send", "mark_sent"] as const) {
    assertEquals(resolvePoShipTo("  Receiving, 22 Mill Rd  ", mode), {
      ok: true,
      shipTo: "Receiving, 22 Mill Rd",
      printed: "Receiving, 22 Mill Rd",
    });
  }
});

// ─── C-07: send access, as the caller ────────────────────────────────────────

/**
 * Stands in for the caller-scoped client: answers can_send_purchase_order the
 * way 00690 does for the given caller (owner / co-member true, outsider false).
 */
function fakeCallerClient(
  answer: { data: unknown; error: unknown },
  calls: Array<{ fn: string; args: Record<string, unknown> }> = [],
): CallerRpcClient {
  return {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(answer);
    },
  };
}

Deno.test("callerMaySendPurchaseOrder allows the owner and a co-member", async () => {
  for (const who of ["owner", "co-member"]) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const allowed = await callerMaySendPurchaseOrder(
      fakeCallerClient({ data: true, error: null }, calls),
      "po-1",
    );
    assertEquals(allowed, true, who);
    assertEquals(calls, [{ fn: "can_send_purchase_order", args: { p_po_id: "po-1" } }]);
  }
});

Deno.test("callerMaySendPurchaseOrder refuses an outsider, a missing PO, and a failed check", async () => {
  for (const answer of [
    { data: false, error: null }, // outsider, or no such PO
    { data: null, error: { message: "permission denied" } },
    { data: true, error: { message: "half-broken response" } },
    { data: "true", error: null },
  ]) {
    assertEquals(await callerMaySendPurchaseOrder(fakeCallerClient(answer), "po-1"), false);
  }
});

Deno.test("parsePoSendBody never carries a body-supplied user id", () => {
  const result = parsePoSendBody({
    purchaseOrderId: "po-1",
    designerId: "someone-else",
    userId: "someone-else",
  });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(Object.keys(result.payload).sort(), [
      "ccDesigner",
      "message",
      "mode",
      "purchaseOrderId",
      "recipientEmail",
    ]);
  }
});

Deno.test("vendorConfigurationLines tolerates unknown dimension keys", () => {
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      selected_dimensions: { diameter: 42, seatHeight: 18, unit: "in" },
    }),
    ["Dims: diameter 42 · seatHeight 18 in"],
  );
  // Width-only is not a W×D×H triple — degrade rather than print "72 ×  × ".
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      selected_dimensions: { width: 72, unit: "in" },
    }),
    ["Dims: width 72 in"],
  );
});

Deno.test("vendorConfigurationLines drops dimension keys outside the allowlist (PRIV-4)", () => {
  // A stray/adversarial key in the jsonb blob (e.g. injected via a capture
  // payload) must never ride onto the vendor PDF next to the trade amounts.
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      selected_dimensions: {
        diameter: 42,
        internalContact: "kody@patina.internal",
        vendorCostCents: 45000,
        notABlessedKey: "smuggled",
        unit: "in",
      },
    }),
    ["Dims: diameter 42 in"],
  );
  // Every key adversarial, nothing left to print at all.
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      selected_dimensions: { secretNote: "do not ship", internalSku: "X-1" },
    }),
    [],
  );
});

Deno.test("vendorConfigurationLines drops dimension values carrying forbidden money vocabulary (PRIV-4)", () => {
  // Defence in depth: even an allowlisted key must not carry a smuggled
  // value referencing trade/markup/margin/retail/price.
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      selected_dimensions: {
        clearance: "18 trade-only",
        weight: 40,
        unit: "in",
      },
    }),
    ["Dims: weight 40 in"],
  );
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      selected_dimensions: { seatHeight: "retail markup 20%" },
    }),
    [],
  );
  // Forbidden substring inside the unit itself is dropped, not appended.
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      selected_dimensions: { diameter: 42, unit: "in (margin)" },
    }),
    ["Dims: diameter 42"],
  );
  // Forbidden substring inside a width/depth/height triple falls the whole
  // triple back to the per-key path rather than printing the tainted value.
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      selected_dimensions: {
        width: 72,
        depth: "36 margin",
        height: 30,
        unit: "in",
      },
    }),
    ["Dims: width 72 · height 30 in"],
  );
});

Deno.test("vendorConfigurationLines returns [] when there is nothing vendor-safe to say", () => {
  assertEquals(vendorConfigurationLines(null), []);
  assertEquals(vendorConfigurationLines(undefined), []);
  assertEquals(vendorConfigurationLines([]), []);
  assertEquals(vendorConfigurationLines({ configuration_snapshot: {} }), []);
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      sku: "   ",
      selected_dimensions: null,
    }),
    [],
  );
});

// ─── buildSchedulePoProposal — R109, a fact proposes ─────────────────────────

Deno.test("buildSchedulePoProposal targets the thread phase on a first send", () => {
  assertEquals(
    buildSchedulePoProposal({
      projectId: "11111111-1111-4111-8111-111111111111",
      purchaseOrderId: "22222222-2222-4222-8222-222222222222",
      targetPhaseId: "33333333-3333-4333-8333-333333333333",
      sentAt: "2026-08-13T17:04:11.123Z",
    }),
    {
      project_id: "11111111-1111-4111-8111-111111111111",
      source_event: "po-sent",
      source_ref: "22222222-2222-4222-8222-222222222222",
      target_phase_id: "33333333-3333-4333-8333-333333333333",
      proposed_anchor_date: "2026-08-13",
      conflicts_with_committed: false,
      disclosed_context: null,
    },
  );
});

Deno.test("buildSchedulePoProposal reports a contradiction against a committed anchor", () => {
  const row = buildSchedulePoProposal({
    projectId: "11111111-1111-4111-8111-111111111111",
    purchaseOrderId: "22222222-2222-4222-8222-222222222222",
    targetPhaseId: "33333333-3333-4333-8333-333333333333",
    targetAnchorDate: "2026-07-01",
    sentAt: "2026-08-13T00:00:00.000Z",
  });
  assert(row !== null);
  assertEquals(row.conflicts_with_committed, true);
  assertEquals(row.disclosed_context, { committedAnchorDate: "2026-07-01" });
});

Deno.test("buildSchedulePoProposal agrees with a committed anchor on the same day", () => {
  const row = buildSchedulePoProposal({
    projectId: "11111111-1111-4111-8111-111111111111",
    purchaseOrderId: "22222222-2222-4222-8222-222222222222",
    targetPhaseId: "33333333-3333-4333-8333-333333333333",
    targetAnchorDate: "2026-08-13",
    sentAt: "2026-08-13T09:00:00.000Z",
  });
  assert(row !== null);
  assertEquals(row.conflicts_with_committed, false);
  assertEquals(row.disclosed_context, null);
});

Deno.test("buildSchedulePoProposal files against the project when no thread phase exists", () => {
  const row = buildSchedulePoProposal({
    projectId: "11111111-1111-4111-8111-111111111111",
    purchaseOrderId: "22222222-2222-4222-8222-222222222222",
    targetPhaseId: null,
    sentAt: "2026-08-13T00:00:00.000Z",
  });
  assert(row !== null);
  assertEquals(row.target_phase_id, null);
  assertEquals(row.disclosed_context, { note: PO_SENT_NO_THREAD_PHASE_NOTE });
});

Deno.test("buildSchedulePoProposal returns null without a project or a usable stamp", () => {
  assertEquals(
    buildSchedulePoProposal({
      projectId: null,
      purchaseOrderId: "22222222-2222-4222-8222-222222222222",
      targetPhaseId: "33333333-3333-4333-8333-333333333333",
      sentAt: "2026-08-13T00:00:00.000Z",
    }),
    null,
  );
  assertEquals(
    buildSchedulePoProposal({
      projectId: "11111111-1111-4111-8111-111111111111",
      purchaseOrderId: "22222222-2222-4222-8222-222222222222",
      targetPhaseId: "33333333-3333-4333-8333-333333333333",
      sentAt: "not-a-timestamp",
    }),
    null,
  );
});
