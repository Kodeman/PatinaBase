// Adversarial probe, W1a final review round 2. NOT a shipped test.
// The brief's send-gate checks, plus the one the SQL probe can only half-prove:
// the consent-invite the site-request rail enqueues for a studio holding NO
// record (probe53 A5) — can it ever leave?
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { channelConsentVerdict, sendPartySms } from "../../../supabase/functions/_shared/sms.ts";
import { createFakeSupabase } from "../../../supabase/functions/_tests/fake-supabase.ts";

const TO = "+15559990000";
const ENV = (k: string) => ({
  TWILIO_FROM_NUMBER: TO, SMS_CONVERSATION_NUMBER: TO,
  TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "tok",
  SMS_DEV_MODE: "dry_run", FIELD_TZ: "UTC",
} as Record<string, string>)[k];

function seed(seat: string, record: Record<string, unknown> | null, evidenced = true) {
  return createFakeSupabase({
    projects: [{ id: "projA", name: "Alpha", designer_id: "dzA", studio_id: "org-alpha" }],
    profiles: [{ id: "dzA", full_name: "Dana" }],
    organizations: [{ id: "org-alpha", type: "design_studio" }],
    email_templates: [],
    project_parties: [{
      id: "pA", phone_e164: "+15551118888", project_id: "projA", party_kind: "sub",
      sms_consent_status: seat, display_name: "Ray Sub",
      sms_consent_source: evidenced ? "verbal" : null,
      sms_consent_evidence: evidenced ? "on site" : null,
      sms_consent_recorded_at: evidenced ? "2026-01-01T00:00:00Z" : null,
      sms_consent_disclosure_version: evidenced ? "field-sms-v1" : null,
    }],
    studio_channel_consent: record ? [record] : [],
  });
}
const REC = (status: string, unanswered = false) => ({
  organization_id: "org-alpha", channel_kind: "sms",
  channel_value: "+15551118888", status, refusal_unanswered: unanswered,
});

Deno.test("P1 no record at all refuses an ordinary send AND the opt-in invite", async () => {
  for (const seat of ["not_asked", "pending", "granted", "opted_out"]) {
    const f = seed(seat, null);
    const v = await channelConsentVerdict(f as never, "+15551118888", "projA");
    const ordinary = await sendPartySms(f as never,
      { partyId: "pA", projectId: "projA", body: "hi" }, { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
    const invite = await sendPartySms(f as never,
      { partyId: "pA", projectId: "projA", templateKey: "sms_optin_invite", body: "invite" },
      { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
    console.log(`P1 seat=${seat} verdict=${v} ordinary=${JSON.stringify(ordinary)} invite=${JSON.stringify(invite)}`);
    assertEquals(v, "refuse");
    assertEquals(ordinary.sent, false);
    assertEquals(invite.sent, false);
  }
});

Deno.test("P2 an opted_out record refuses everything, invite included", async () => {
  const f = seed("granted", REC("opted_out", true));
  const v = await channelConsentVerdict(f as never, "+15551118888", "projA");
  const invite = await sendPartySms(f as never,
    { partyId: "pA", projectId: "projA", templateKey: "sms_optin_invite", body: "invite" },
    { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
  console.log("P2 verdict =", v, "invite =", JSON.stringify(invite));
  assertEquals(v, "refuse"); assertEquals(invite.sent, false);
});

Deno.test("P3 a granted record carrying an unanswered refusal refuses", async () => {
  const f = seed("granted", REC("granted", true));
  const v = await channelConsentVerdict(f as never, "+15551118888", "projA");
  const r = await sendPartySms(f as never, { partyId: "pA", projectId: "projA", body: "hi" },
    { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
  console.log("P3 verdict =", v, "send =", JSON.stringify(r));
  assertEquals(v, "refuse"); assertEquals(r.sent, false);
});

Deno.test("P4 a pending record is the invite in flight, and only the invite", async () => {
  const f = seed("pending", REC("pending"));
  const v = await channelConsentVerdict(f as never, "+15551118888", "projA");
  const ordinary = await sendPartySms(f as never, { partyId: "pA", projectId: "projA", body: "hi" },
    { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
  const invite = await sendPartySms(f as never,
    { partyId: "pA", projectId: "projA", templateKey: "sms_optin_invite", body: "invite" },
    { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
  console.log("P4 verdict =", v, "ordinary =", JSON.stringify(ordinary), "invite =", JSON.stringify(invite));
  assertEquals(v, "unknown"); assertEquals(ordinary.sent, false);
});

Deno.test("P5 a granted record sends, whatever the frozen seat says", async () => {
  const f = seed("opted_out", REC("granted"));
  const v = await channelConsentVerdict(f as never, "+15551118888", "projA");
  const r = await sendPartySms(f as never, { partyId: "pA", projectId: "projA", body: "hi" },
    { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
  console.log("P5 verdict =", v, "send =", JSON.stringify(r));
  assertEquals(v, "allow");
});

Deno.test("P6 a read that ERRORS refuses (R-AM)", async () => {
  const f = createFakeSupabase({
    projects: [{ id: "projA", name: "Alpha", designer_id: "dzA", studio_id: "org-alpha" }],
    project_parties: [{ id: "pA", phone_e164: "+15551118888", project_id: "projA" }],
    studio_channel_consent: [],
  }, { errorOn: { studio_channel_consent: { message: "boom" } } });
  const v = await channelConsentVerdict(f as never, "+15551118888", "projA");
  console.log("P6 verdict on a failed record read =", v);
  assertEquals(v, "refuse");
});
