// Deno test for the quote-request-send pure helpers (Wave 0B).
// Run: deno test supabase/functions/quote-request-send/index.test.ts
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve.
// Network-touching behavior (auth, Resend) is exercised by the local
// `supabase functions serve` smoke flow, not here. Mirrors po-send/index.test.ts.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type CallerRpcClient,
  callerIsStudioComember,
  parseQuoteRequestSendBody,
  quoteRequestStudioOwner,
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

// ─── C-07: send access, as the caller ────────────────────────────────────────

Deno.test("quoteRequestStudioOwner is always the drafter, never the linked project's owner", () => {
  // A row as loaded may still carry a project embed; the anchor ignores it.
  const linked = { designer_id: "drafter", project: { designer_id: "owner" } };
  assertEquals(quoteRequestStudioOwner(linked), "drafter");
  assertEquals(quoteRequestStudioOwner({ designer_id: "drafter" }), "drafter");
});

/**
 * Models is_studio_comember for one caller: true only for an owner id the
 * caller shares a studio with (or is).
 */
function comemberOf(...owners: string[]): CallerRpcClient {
  return {
    rpc(_fn, args) {
      return Promise.resolve({ data: owners.includes(String(args.p_owner)), error: null });
    },
  };
}

Deno.test("RFQ send: a co-member of the drafter is allowed; a co-member of only the project owner is refused", async () => {
  // Drafted by D on a project owned by O; D and O share no studio.
  const request = { designer_id: "D", project: { designer_id: "O" } };
  const anchor = quoteRequestStudioOwner(request);
  assertEquals(await callerIsStudioComember(comemberOf("D"), anchor), true, "drafter / drafter co-member");
  assertEquals(await callerIsStudioComember(comemberOf("O"), anchor), false, "project-owner-only co-member");
});

/**
 * Stands in for the caller-scoped client: answers is_studio_comember the way
 * 00556 does for the given caller (owner / co-member true, outsider false).
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

Deno.test("callerIsStudioComember allows the owner and a co-member", async () => {
  for (const who of ["owner", "co-member"]) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const allowed = await callerIsStudioComember(
      fakeCallerClient({ data: true, error: null }, calls),
      "owner-id",
    );
    assertEquals(allowed, true, who);
    assertEquals(calls, [{ fn: "is_studio_comember", args: { p_owner: "owner-id" } }]);
  }
});

Deno.test("callerIsStudioComember refuses an outsider and a failed check", async () => {
  for (const answer of [
    { data: false, error: null },
    { data: null, error: { message: "permission denied" } },
    { data: true, error: { message: "half-broken response" } },
    { data: "true", error: null },
  ]) {
    assertEquals(await callerIsStudioComember(fakeCallerClient(answer), "owner-id"), false);
  }
});
