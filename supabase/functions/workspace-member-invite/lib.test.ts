// Deno test for the workspace-member-invite response contract.
// Run: deno test supabase/functions/workspace-member-invite/lib.test.ts
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  HANDOFF_NOTE_MAX_LENGTH,
  type InviteEmailOutcome,
  inviteEmailOutcome,
  isInvitableOrgStatus,
  normalizeHandoffNote,
  resolveInviteActor,
  TEMPLATE_MISSING_OUTCOME,
} from "./lib.ts";

Deno.test("a delivered send reports email_status 'sent' with no email_error", () => {
  const outcome = inviteEmailOutcome({ success: true });
  assertEquals(outcome, { email_status: "sent" } as InviteEmailOutcome);
  assertEquals("email_error" in outcome, false);
});

Deno.test("a suppressed recipient reports 'suppressed', not a failure", () => {
  const outcome = inviteEmailOutcome({
    success: false,
    suppressed: true,
    error: "email_suppressed",
  });
  assertEquals(outcome, { email_status: "suppressed" } as InviteEmailOutcome);
  assertEquals("email_error" in outcome, false);
});

Deno.test("a rate-capped send is suppression, not failure", () => {
  assertEquals(
    inviteEmailOutcome({
      success: false,
      suppressed: true,
      error: "global_rate_cap (8/hr)",
    }),
    { email_status: "suppressed" } as InviteEmailOutcome,
  );
});

Deno.test("a provider failure reports 'failed' with email_error 'send_failed'", () => {
  assertEquals(
    inviteEmailOutcome({ success: false, error: "Resend API 500: boom" }),
    { email_status: "failed", email_error: "send_failed" },
  );
});

Deno.test("a missing branded template reports 'failed' with 'template_missing'", () => {
  assertEquals(TEMPLATE_MISSING_OUTCOME, {
    email_status: "failed",
    email_error: "template_missing",
  });
});

Deno.test("every outcome spreads into the invite body without shadowing it", () => {
  const base = {
    userId: "u1",
    email: "teammate@example.com",
    status: "invited",
    organizationId: "o1",
    teammateType: "designer",
    memberRole: "member",
  };
  for (
    const outcome of [
      inviteEmailOutcome({ success: true }),
      inviteEmailOutcome({ success: false, suppressed: true }),
      inviteEmailOutcome({ success: false, error: "boom" }),
      TEMPLATE_MISSING_OUTCOME,
    ]
  ) {
    const body = { ...base, ...outcome } as Record<string, unknown>;
    assertEquals(body.status, "invited");
    assertEquals(body.userId, "u1");
    assertEquals(
      ["sent", "suppressed", "failed"].includes(body.email_status as string),
      true,
    );
    assertEquals(
      body.email_status === "failed",
      typeof body.email_error === "string",
    );
  }
});

// ── Actor resolution + org-status gate (00556 platform-admin bypass) ────────

Deno.test("an active owner/admin membership resolves to 'org_admin'", () => {
  assertEquals(
    resolveInviteActor({
      membership: { role: "owner", status: "active" },
      isPlatformAdmin: false,
    }),
    "org_admin",
  );
});

Deno.test("a platform admin with no membership resolves to 'platform_admin'", () => {
  assertEquals(
    resolveInviteActor({ membership: null, isPlatformAdmin: true }),
    "platform_admin",
  );
});

Deno.test("a caller who is both is attributed to the studio, not the platform", () => {
  assertEquals(
    resolveInviteActor({
      membership: { role: "admin", status: "active" },
      isPlatformAdmin: true,
    }),
    "org_admin",
  );
});

Deno.test("neither membership nor admin role resolves to null (403)", () => {
  assertEquals(
    resolveInviteActor({ membership: null, isPlatformAdmin: false }),
    null,
  );
});

// ── Handoff note (L8) ────────────────────────────────────────────────────

Deno.test("a trimmed handoff note within the cap is kept", () => {
  assertEquals(
    normalizeHandoffNote("  start with the Olsen lake house  "),
    "start with the Olsen lake house",
  );
});

Deno.test("empty or whitespace-only input normalizes to undefined, not a NULL-out write", () => {
  assertEquals(normalizeHandoffNote(undefined), undefined);
  assertEquals(normalizeHandoffNote(""), undefined);
  assertEquals(normalizeHandoffNote("   "), undefined);
});

Deno.test("a note exactly at the cap is kept; one over is rejected", () => {
  const atCap = "x".repeat(HANDOFF_NOTE_MAX_LENGTH);
  const overCap = "x".repeat(HANDOFF_NOTE_MAX_LENGTH + 1);
  assertEquals(normalizeHandoffNote(atCap), atCap);
  assertEquals(normalizeHandoffNote(overCap), null);
});

Deno.test("leading/trailing whitespace doesn't count toward the cap", () => {
  const padded = `  ${"x".repeat(HANDOFF_NOTE_MAX_LENGTH)}  `;
  assertEquals(normalizeHandoffNote(padded), "x".repeat(HANDOFF_NOTE_MAX_LENGTH));
});

Deno.test("only an active organization is invitable", () => {
  assertEquals(isInvitableOrgStatus("active"), true);
  for (
    const status of [
      "suspended",
      "deactivated",
      "pending_approval",
      "",
      null,
      undefined,
    ]
  ) {
    assertEquals(isInvitableOrgStatus(status), false);
  }
});
