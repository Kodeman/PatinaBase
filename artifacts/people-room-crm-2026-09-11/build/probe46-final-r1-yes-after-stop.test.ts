// Adversarial probe, W1a final review round 1. NOT a shipped test.
// Does a bare "YES" lift a standing recorded STOP for a studio that did not
// receive it, now that R-AS/R-AW froze the seats?
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound, type InboundParams } from "../../../supabase/functions/sms-inbound/pipeline.ts";
import { sendPartySms } from "../../../supabase/functions/_shared/sms.ts";
import { createFakeSupabase } from "../../../supabase/functions/_tests/fake-supabase.ts";

const TO = "+15559990000";
const NO_POSTHOG = () => undefined;
function params(p: Partial<InboundParams> & { From: string; Body: string; MessageSid: string }): InboundParams {
  return { To: TO, NumMedia: "0", ...p } as InboundParams;
}

Deno.test("PROBE: a bare YES lifts a standing recorded STOP for every studio whose frozen seat says pending", async () => {
  const fake = createFakeSupabase({
    projects: [
      { id: "projA", name: "Alpha job", designer_id: "dzA", studio_id: "org-alpha" },
      { id: "projB", name: "Beta job", designer_id: "dzB", studio_id: "org-beta" },
    ],
    profiles: [{ id: "dzA", full_name: "Dana" }, { id: "dzB", full_name: "Bo" }],
    email_templates: [
      { slug: "sms_optin_confirm", is_active: true, html_content: "set {{party_first_name}}" },
    ],
    // Two studios each invited this number. Both seats are frozen at `pending`
    // (what useAddProjectParty's INSERT writes), and nothing can move them.
    project_parties: [
      { id: "pA", phone_e164: "+15551119999", project_id: "projA", party_kind: "sub",
        sms_consent_status: "pending", sms_consent_source: "verbal",
        sms_consent_evidence: "said yes on site", sms_consent_recorded_at: "2026-01-01T00:00:00Z",
        sms_consent_disclosure_version: "field-sms-v1", display_name: "Ray Sub" },
      { id: "pB", phone_e164: "+15551119999", project_id: "projB", party_kind: "sub",
        sms_consent_status: "pending", sms_consent_source: "verbal",
        sms_consent_evidence: "said yes on site", sms_consent_recorded_at: "2026-01-01T00:00:00Z",
        sms_consent_disclosure_version: "field-sms-v1", display_name: "Ray Sub" },
    ],
    studio_channel_consent: [
      { organization_id: "org-alpha", channel_kind: "sms", channel_value: "+15551119999",
        status: "pending", refusal_unanswered: false },
      { organization_id: "org-beta", channel_kind: "sms", channel_value: "+15551119999",
        status: "pending", refusal_unanswered: false },
    ],
  });

  // 1. The recipient replies STOP. Every studio's record is refused.
  const stop = await processInbound(
    params({ From: "+15551119999", Body: "STOP", MessageSid: "SMprobestop" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(stop.disposition, "opted_out");
  const after = () => Object.fromEntries(
    (fake._data.studio_channel_consent as Array<Record<string, unknown>>)
      .map((c) => [c.organization_id, `${c.status}/${c.refusal_unanswered}`]),
  );
  console.log("PROBE 1 after STOP:", after());
  const seats = () => (fake._data.project_parties as Array<Record<string, unknown>>)
    .map((p) => `${p.id}=${p.sms_consent_status}`).join(" ");
  console.log("PROBE 2 frozen seats after STOP:", seats());

  // 2. The recipient later texts a bare YES. It is not START.
  const yes = await processInbound(
    params({ From: "+15551119999", Body: "YES", MessageSid: "SMprobeyes" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  console.log("PROBE 3 YES disposition:", yes.disposition);
  console.log("PROBE 4 after YES:", after());

  // 3. …and a send now goes out.
  const res = await sendPartySms(
    fake as never,
    { partyId: "pA", projectId: "projA", body: "Hello from the studio" },
    {
      getEnv: (k) => ({
        TWILIO_FROM_NUMBER: TO,
        SMS_CONVERSATION_NUMBER: TO,
        TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "tok",
        SMS_DEV_MODE: "dry_run", FIELD_TZ: "UTC",
      } as Record<string, string>)[k],
      now: new Date("2026-03-02T15:00:00Z"),
    },
  );
  console.log("PROBE 5 sendPartySms after the YES:", JSON.stringify(res));
  assert(true);
});

Deno.test("PROBE: studio A's STOP is lifted by a YES that answers studio B's brand-new invite", async () => {
  const fake = createFakeSupabase({
    projects: [
      { id: "projA", name: "Alpha job", designer_id: "dzA", studio_id: "org-alpha" },
      { id: "projB", name: "Beta job", designer_id: "dzB", studio_id: "org-beta" },
    ],
    profiles: [{ id: "dzA", full_name: "Dana" }, { id: "dzB", full_name: "Bo" }],
    email_templates: [{ slug: "sms_optin_confirm", is_active: true, html_content: "set" }],
    project_parties: [
      // A invited months ago; the recipient replied STOP. A's RECORD is refused
      // and A never invited again — but the seat is frozen at `pending` for ever.
      { id: "pA", phone_e164: "+15551116666", project_id: "projA", party_kind: "sub",
        sms_consent_status: "pending", sms_consent_source: "verbal",
        sms_consent_evidence: "said yes on site", sms_consent_recorded_at: "2026-01-01T00:00:00Z",
        sms_consent_disclosure_version: "field-sms-v1", display_name: "Ray Sub" },
      // B invites today.
      { id: "pB", phone_e164: "+15551116666", project_id: "projB", party_kind: "sub",
        sms_consent_status: "pending", sms_consent_source: "verbal",
        sms_consent_evidence: "said yes on site", sms_consent_recorded_at: "2026-09-01T00:00:00Z",
        sms_consent_disclosure_version: "field-sms-v1", display_name: "Ray Sub" },
    ],
    studio_channel_consent: [
      { organization_id: "org-alpha", channel_kind: "sms", channel_value: "+15551116666",
        status: "opted_out", refusal_unanswered: true,
        opt_out_at: "2026-02-01T00:00:00Z", opt_out_source: "inbound_sms",
        opt_out_evidence: "Inbound STOP" },
      { organization_id: "org-beta", channel_kind: "sms", channel_value: "+15551116666",
        status: "pending", refusal_unanswered: false },
    ],
  });
  const yes = await processInbound(
    params({ From: "+15551116666", Body: "Y", MessageSid: "SMprobeyes2" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  const after = Object.fromEntries(
    (fake._data.studio_channel_consent as Array<Record<string, unknown>>)
      .map((c) => [c.organization_id, `${c.status}/unanswered=${c.refusal_unanswered}/opt_out_at=${c.opt_out_at}`]),
  );
  console.log("PROBE X-STUDIO 'Y' disposition:", yes.disposition);
  console.log("PROBE X-STUDIO records after:", after);
});
