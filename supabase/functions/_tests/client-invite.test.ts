/**
 * P21/P22 — the phone identity, and the consent record behind it.
 *
 * WHAT THIS FILE CAN REACH. `client-invite/index.ts` calls `Deno.serve` at
 * module scope, so importing it would bind a port; the decisions this ticket
 * added to it are taken in `client-invite/lib.ts`, which imports nothing and is
 * tested directly here. The write side — that `create_client_link` mints a
 * 64-hex token, stores only its sha256, and that `resolve_client_link` answers
 * for its own invitation and refuses an expired, revoked or superseded one — is
 * proved against a real Postgres in
 * `supabase/tests/field/client_phone_identity_test.sql`, because those are
 * properties of the SQL, not of any caller's stub.
 *
 * The consent case at the bottom is the other half: the SQL suite proves what
 * `record_channel_invite(..., 'kickoff_checkbox', ...)` WRITES, and this proves
 * that what it writes is what `channelConsentDecision` READS.
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  CLIENT_LINK_ACTIONS,
  RESEND_COOLDOWN_MS,
  resendCooldownRemainingMs,
  resolveIdentity,
} from "../client-invite/lib.ts";
import { channelConsentDecision } from "../_shared/sms.ts";
import { createFakeSupabase } from "./fake-supabase.ts";

// ── The identity (P21) ──────────────────────────────────────────────────────

Deno.test("an email letter resolves exactly as it always has", () => {
  const verdict = resolveIdentity({ email: "  Dave@Okonkwo.net " });
  assertEquals(verdict, {
    ok: true,
    identity: "email",
    email: "dave@okonkwo.net",
    phone: null,
  });
});

Deno.test("a letter with no identity at all is refused, not guessed", () => {
  assertEquals(resolveIdentity({}), { ok: false, error: "email_required" });
  assertEquals(resolveIdentity({ email: "   " }), { ok: false, error: "email_required" });
  assertEquals(resolveIdentity({ kind: "phone" }), { ok: false, error: "phone_required" });
});

Deno.test("kind 'phone' names the IDENTITY, and takes no email with it", () => {
  const verdict = resolveIdentity({
    kind: "phone",
    phone: " (608) 555-0143 ",
    // An email arriving alongside must not turn this into an email letter: the
    // caller has said which identity this is, and a phone letter mails nothing.
    email: "dave@okonkwo.net",
  });
  assertEquals(verdict, {
    ok: true,
    identity: "phone",
    email: null,
    phone: "(608) 555-0143",
  });
});

Deno.test("the phone is handed on unnormalized, because one thing normalizes it", () => {
  // normalize_client_invitation_phone (00650) is that one thing. A second
  // reading here is how the number on the letter and the number on the consent
  // record come to disagree.
  const verdict = resolveIdentity({ kind: "phone", phone: "608.555.0143" });
  assert(verdict.ok);
  assertEquals(verdict.phone, "608.555.0143");
});

Deno.test("a capability is minted for every answering action at once", () => {
  // Hash-at-rest means a link cannot be re-scoped later: re-minting invalidates
  // the one already in her phone. So the actions SQ-17 will need are named now.
  assertEquals(CLIENT_LINK_ACTIONS, ["open_letter", "approve_selection", "select_window"]);
});

// ── The resend floor (P21) ──────────────────────────────────────────────────

Deno.test("a phone letter rides the same hourly floor as an email one", () => {
  const now = Date.UTC(2026, 8, 19, 12, 0, 0);
  // A phone letter never stamps `last_sent_at` (nothing is mailed), so the
  // floor reads `sent_at` — the same function, the same hour, either way.
  const halfAnHourAgo = new Date(now - 30 * 60 * 1000).toISOString();
  assertEquals(resendCooldownRemainingMs(halfAnHourAgo, now), 30 * 60 * 1000);
  assertEquals(resendCooldownRemainingMs(new Date(now - RESEND_COOLDOWN_MS).toISOString(), now), 0);
  assertEquals(resendCooldownRemainingMs(null, now), 0);
});

// ── The consent record (P22) ────────────────────────────────────────────────

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const PHONE = "+16085550143";

/** The row `record_channel_invite(..., 'kickoff_checkbox', ...)` leaves behind,
 *  column for column, as asserted against a real Postgres in case 8 of
 *  supabase/tests/field/client_phone_identity_test.sql. */
const KICKOFF_RECORD = {
  id: "33333333-3333-4333-8333-333333333333",
  organization_id: ORG,
  channel_kind: "sms",
  channel_value: PHONE,
  status: "pending",
  source: "kickoff_checkbox",
  disclosure_version: "field-sms-v1",
  recorded_by: "44444444-4444-4444-8444-444444444444",
  recorded_at: "2026-09-19T12:00:00.000Z",
  updated_at: "2026-09-19T12:00:00.000Z",
  refusal_unanswered: false,
  origin_project_id: PROJECT,
};

function seeded(records: Record<string, unknown>[]) {
  return createFakeSupabase({
    projects: [{ id: PROJECT, studio_id: ORG, designer_id: null }],
    studio_channel_consent: records as never,
  });
}

Deno.test("a kickoff tick satisfies the shape channelConsentDecision reads", async () => {
  // eslint-disable-next-line
  const decision = await channelConsentDecision(
    seeded([KICKOFF_RECORD]) as never,
    PHONE,
    PROJECT,
  );
  // The record ANSWERED — this is the whole point. A kickoff consent that did
  // not satisfy the reader would come back `recordPresent: false`, which R-AW
  // reads as `not_asked` and refuses outright.
  assertEquals(decision.recordPresent, true);
  assertEquals(decision.organizationId, ORG);
  // `pending` is the double opt-in's first half: the invite gate owns it, and
  // it is NOT a refusal.
  assertEquals(decision.verdict, "unknown");
  // The evidence half the invite gate carries forward, unchanged from what the
  // kickoff box wrote.
  assertEquals(decision.recordSource, "kickoff_checkbox");
  assertEquals(decision.recordedBy, KICKOFF_RECORD.recorded_by);
  assertEquals(decision.recordGeneration, KICKOFF_RECORD.recorded_at);
});

Deno.test("no record at all still refuses — the tick is what makes the difference", async () => {
  const decision = await channelConsentDecision(seeded([]) as never, PHONE, PROJECT);
  assertEquals(decision.recordPresent, false);
  assertEquals(decision.verdict, "refuse");
});

Deno.test("a refusal she has not answered outranks the kickoff tick", async () => {
  const decision = await channelConsentDecision(
    seeded([{ ...KICKOFF_RECORD, refusal_unanswered: true }]) as never,
    PHONE,
    PROJECT,
  );
  assertEquals(decision.verdict, "refuse");
  assertEquals(decision.recordPresent, true);
});
