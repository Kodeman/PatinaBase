// Deno test for the quote-request-send pure helpers (Wave 0B).
// Run: deno test supabase/functions/quote-request-send/index.test.ts
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve.
// Network-touching behavior (auth, Resend) is exercised by the local
// `supabase functions serve` smoke flow, not here. Mirrors po-send/index.test.ts.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parseQuoteRequestSendBody,
  resolveVendorRecipient,
} from "./lib.ts";

// ─── parseQuoteRequestSendBody — payload validation ──────────────────────────

Deno.test("parseQuoteRequestSendBody rejects non-object bodies", () => {
  for (const bad of [null, undefined, 42, "req-1", ["req-1"]]) {
    const result = parseQuoteRequestSendBody(bad);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_body");
  }
});

Deno.test("parseQuoteRequestSendBody requires quoteRequestId", () => {
  for (const body of [{}, { quoteRequestId: "" }, { quoteRequestId: "   " }, { quoteRequestId: 7 }]) {
    const result = parseQuoteRequestSendBody(body);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "quoteRequestId_required");
  }
});

Deno.test("parseQuoteRequestSendBody rejects unknown modes (and mark_sent — not a mode here)", () => {
  for (const mode of ["emailify", "mark_sent"]) {
    const result = parseQuoteRequestSendBody({ quoteRequestId: "req-1", mode });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_mode");
  }
});

Deno.test("parseQuoteRequestSendBody defaults mode to send", () => {
  const result = parseQuoteRequestSendBody({ quoteRequestId: "req-1" });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.payload.mode, "send");
    assertEquals(result.payload.recipientEmail, undefined);
  }
});

Deno.test("parseQuoteRequestSendBody accepts preview and send", () => {
  for (const mode of ["preview", "send"] as const) {
    const result = parseQuoteRequestSendBody({ quoteRequestId: "req-1", mode });
    assertEquals(result.ok, true);
    if (result.ok) assertEquals(result.payload.mode, mode);
  }
});

Deno.test("parseQuoteRequestSendBody trims id + carries the override recipient", () => {
  const result = parseQuoteRequestSendBody({
    quoteRequestId: " req-1 ",
    mode: "send",
    recipientEmail: " orders@vendor.test ",
  });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.payload, {
      quoteRequestId: "req-1",
      mode: "send",
      recipientEmail: "orders@vendor.test",
    });
  }
});

Deno.test("parseQuoteRequestSendBody rejects a malformed recipientEmail override", () => {
  for (const recipientEmail of ["", "   ", "not-an-email", 42]) {
    const result = parseQuoteRequestSendBody({ quoteRequestId: "req-1", recipientEmail });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_recipient");
  }
});

// ─── resolveVendorRecipient — the shared orders_email → contact_info chain ────

Deno.test("resolveVendorRecipient prefers the explicit override", () => {
  assertEquals(
    resolveVendorRecipient(
      { orders_email: "orders@vendor.test", contact_info: { email: "info@vendor.test" } },
      "override@vendor.test",
    ),
    "override@vendor.test",
  );
});

Deno.test("resolveVendorRecipient falls back to orders_email then contact_info", () => {
  assertEquals(
    resolveVendorRecipient({ orders_email: " orders@vendor.test ", contact_info: { email: "info@vendor.test" } }),
    "orders@vendor.test",
  );
  assertEquals(
    resolveVendorRecipient({ orders_email: null, contact_info: { email: "info@vendor.test" } }),
    "info@vendor.test",
  );
  // Blank orders_email falls through.
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
