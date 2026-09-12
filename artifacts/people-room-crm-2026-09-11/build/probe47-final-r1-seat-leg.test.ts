// Adversarial probe, W1a final review round 1. NOT a shipped test.
// R-AW says the record is the only thing any gate consults. Does the SEND path
// obey it? Two shapes:
//   (a) record granted, frozen seat opted_out  → the room prints Texting
//   (b) record refuses, frozen seat granted    → correctly refused
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { sendPartySms, channelConsentVerdict } from "../../../supabase/functions/_shared/sms.ts";
import { createFakeSupabase } from "../../../supabase/functions/_tests/fake-supabase.ts";

const TO = "+15559990000";
const ENV = (k: string) => ({
  TWILIO_FROM_NUMBER: TO, SMS_CONVERSATION_NUMBER: TO,
  TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "tok",
  SMS_DEV_MODE: "dry_run", FIELD_TZ: "UTC",
} as Record<string, string>)[k];

function seed(seat: string, record: Record<string, unknown> | null) {
  return createFakeSupabase({
    projects: [{ id: "projA", name: "Alpha", designer_id: "dzA", studio_id: "org-alpha" }],
    profiles: [{ id: "dzA", full_name: "Dana" }],
    email_templates: [],
    project_parties: [{
      id: "pA", phone_e164: "+15551118888", project_id: "projA", party_kind: "sub",
      sms_consent_status: seat, display_name: "Ray Sub",
      sms_consent_source: "verbal", sms_consent_evidence: "on site",
      sms_consent_recorded_at: "2026-01-01T00:00:00Z",
      sms_consent_disclosure_version: "field-sms-v1",
    }],
    studio_channel_consent: record ? [record] : [],
  });
}

Deno.test("PROBE (a): record=granted, frozen seat=opted_out — the record says send, sendPartySms refuses", async () => {
  const fake = seed("opted_out", {
    organization_id: "org-alpha", channel_kind: "sms", channel_value: "+15551118888",
    status: "granted", refusal_unanswered: false,
  });
  const v = await channelConsentVerdict(fake as never, "+15551118888", "projA");
  const res = await sendPartySms(fake as never, { partyId: "pA", projectId: "projA", body: "hi" },
    { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
  console.log("PROBE a verdict =", v, "| sendPartySms =", JSON.stringify(res));
  assertEquals(v, "allow");
});

Deno.test("PROBE (b): record=opted_out, frozen seat=granted — refused (the direction that matters)", async () => {
  const fake = seed("granted", {
    organization_id: "org-alpha", channel_kind: "sms", channel_value: "+15551118888",
    status: "opted_out", refusal_unanswered: true,
  });
  const v = await channelConsentVerdict(fake as never, "+15551118888", "projA");
  const res = await sendPartySms(fake as never, { partyId: "pA", projectId: "projA", body: "hi" },
    { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
  console.log("PROBE b verdict =", v, "| sendPartySms =", JSON.stringify(res));
  assertEquals(v, "refuse");
  assertEquals(res.sent, false);
});

Deno.test("PROBE (c): NO record at all, frozen seat=granted, studio-less project — the fail-open", async () => {
  const fake = createFakeSupabase({
    projects: [{ id: "projX", name: "No studio", designer_id: "dzX", studio_id: null }],
    profiles: [{ id: "dzX", full_name: "Solo" }],
    organization_members: [],
    email_templates: [],
    project_parties: [{
      id: "pX", phone_e164: "+15551117777", project_id: "projX", party_kind: "sub",
      sms_consent_status: "granted", display_name: "Solo Sub",
    }],
    studio_channel_consent: [],
  });
  const v = await channelConsentVerdict(fake as never, "+15551117777", "projX");
  const res = await sendPartySms(fake as never, { partyId: "pX", projectId: "projX", body: "hi" },
    { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") });
  console.log("PROBE c verdict =", v, "| sendPartySms =", JSON.stringify(res));
});
