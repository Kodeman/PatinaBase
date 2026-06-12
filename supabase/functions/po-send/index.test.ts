// Deno test for the po-send pure helpers (Wave 4, W4-T3).
// Run: deno test supabase/functions/po-send/index.test.ts
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve.
// Network-touching behavior (auth, storage, Resend) is exercised by the
// local `supabase functions serve` smoke flow, not here.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildFallbackSidemark,
  parsePoSendBody,
  paymentPatternLabel,
  paymentRowLabel,
  resolveVendorRecipient,
  vendorSafeSpecNotes,
} from "./lib.ts";

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
