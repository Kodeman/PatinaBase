import { channelConsentVerdict, sendPartySms } from "/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/supabase/functions/_shared/sms.ts";
import { createFakeSupabase } from "/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/supabase/functions/_tests/fake-supabase.ts";
const TO = "+15559990000";
const ENV = (k: string) => ({
  TWILIO_FROM_NUMBER: TO, SMS_CONVERSATION_NUMBER: TO,
  TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "tok",
  SMS_DEV_MODE: "dry_run", FIELD_TZ: "UTC",
} as Record<string, string>)[k];

Deno.test("the studio-less INVITE fail-open, exactly", async () => {
  const mk = (rec: Record<string, unknown>[]) => createFakeSupabase({
    projects: [{ id: "projX", name: "No studio", designer_id: "dzX", studio_id: null }],
    profiles: [{ id: "dzX", full_name: "Solo" }],
    organization_members: [],
    organizations: [],
    email_templates: [],
    project_parties: [{
      id: "pX", phone_e164: "+15551117777", project_id: "projX", party_kind: "sub",
      display_name: "Solo Sub", sms_consent_status: "pending",
      sms_consent_source: "verbal", sms_consent_evidence: "asked on site",
      sms_consent_recorded_at: "2026-01-01T00:00:00Z",
      sms_consent_disclosure_version: "field-sms-v1",
    }],
    studio_channel_consent: rec,
  });
  // (1) nothing on the number anywhere
  let f = mk([]);
  console.log("S1 verdict =", await channelConsentVerdict(f as never, "+15551117777", "projX"),
    "invite =", JSON.stringify(await sendPartySms(f as never,
      { partyId: "pX", projectId: "projX", templateKey: "sms_optin_invite", body: "invite" },
      { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") })));
  // (2) ANOTHER studio holds a recorded refusal on the same number
  f = mk([{ organization_id: "org-other", channel_kind: "sms",
            channel_value: "+15551117777", status: "opted_out", refusal_unanswered: true }]);
  console.log("S2 verdict =", await channelConsentVerdict(f as never, "+15551117777", "projX"),
    "invite =", JSON.stringify(await sendPartySms(f as never,
      { partyId: "pX", projectId: "projX", templateKey: "sms_optin_invite", body: "invite" },
      { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") })));
  // (3) the seat carries NO evidence
  const g = createFakeSupabase({
    projects: [{ id: "projX", name: "No studio", designer_id: "dzX", studio_id: null }],
    organization_members: [], organizations: [], email_templates: [],
    project_parties: [{ id: "pX", phone_e164: "+15551117777", project_id: "projX",
      party_kind: "sub", display_name: "Solo Sub", sms_consent_status: "pending" }],
    studio_channel_consent: [],
  });
  console.log("S3 (seat has no evidence) invite =", JSON.stringify(await sendPartySms(g as never,
      { partyId: "pX", projectId: "projX", templateKey: "sms_optin_invite", body: "invite" },
      { getEnv: ENV, now: new Date("2026-03-02T15:00:00Z") })));
});
