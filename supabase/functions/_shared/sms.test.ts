// Deno test for the shared sendPartySms path.
// Run: deno test --no-check -A supabase/functions/_shared/sms.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isQuietHours, sendPartySms } from "./sms.ts";
import { createFakeSupabase } from "../_tests/fake-supabase.ts";

function envOf(map: Record<string, string>) {
  return (k: string) => map[k];
}

function party(id: string, consent: string) {
  return {
    id,
    phone_e164: "+15551230001",
    project_id: "proj1",
    display_name: "Sal Sub",
    sms_consent_status: consent,
  };
}

Deno.test("dry_run writes a row and never calls Twilio", async () => {
  const fake = createFakeSupabase({ project_parties: [party("p1", "granted")] });
  let fetchCalls = 0;
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello" },
    {
      getEnv: envOf({ SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+15550000000" }),
      fetchImpl: (() => { fetchCalls++; return Promise.reject("nope"); }) as unknown as typeof fetch,
      now: new Date("2026-07-08T18:00:00Z"), // ~1pm Chicago — not quiet
    },
  );
  assert(res.sent, "should report sent");
  assertEquals(fetchCalls, 0, "Twilio must not be called in dry_run");
  const msgs = fake._data.sms_messages ?? [];
  assertEquals(msgs.length, 1);
  assertEquals((msgs[0] as { twilio_status: string }).twilio_status, "dry_run");
  assert(String((msgs[0] as { twilio_sid: string }).twilio_sid).startsWith("dev-"));
});

Deno.test("consent gate blocks not_asked and opted_out", async () => {
  for (const [consent, reason] of [["not_asked", "not_consented"], ["opted_out", "opted_out"]]) {
    const fake = createFakeSupabase({ project_parties: [party("p1", consent)] });
    const res = await sendPartySms(
      fake as never,
      { partyId: "p1", body: "hello" },
      { getEnv: envOf({ SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+1" }), now: new Date("2026-07-08T18:00:00Z") },
    );
    assert(!res.sent, `${consent} must not send`);
    assertEquals(res.reason, reason);
    assertEquals((fake._data.sms_messages ?? []).length, 0, "no row on a blocked send");
  }
});

Deno.test("sms_optin_invite is allowed to a pending party", async () => {
  const fake = createFakeSupabase({ project_parties: [party("p1", "pending")] });
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", templateKey: "sms_optin_invite", body: "Reply YES for updates" },
    { getEnv: envOf({ SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+1" }), now: new Date("2026-07-08T18:00:00Z") },
  );
  assert(res.sent, "invite should reach a pending party");
});

Deno.test("quiet hours defer stores the body without sending", async () => {
  const fake = createFakeSupabase({ project_parties: [party("p1", "granted")] });
  let fetchCalls = 0;
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "after hours" },
    {
      getEnv: envOf({ SMS_DEV_MODE: "off", TWILIO_FROM_NUMBER: "+1", TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "tok" }),
      fetchImpl: (() => { fetchCalls++; return Promise.reject("nope"); }) as unknown as typeof fetch,
      now: new Date("2026-07-08T09:00:00Z"), // ~4am Chicago — quiet
    },
  );
  assert(res.deferred, "should defer off-hours");
  assert(!res.sent);
  assertEquals(fetchCalls, 0);
  const msgs = fake._data.sms_messages ?? [];
  assertEquals((msgs[0] as { twilio_status: string }).twilio_status, "deferred");
  assertEquals((msgs[0] as { body: string }).body, "after hours");
});

Deno.test("a Messaging Service SID (MG…) is sent as MessagingServiceSid", async () => {
  const fake = createFakeSupabase({ project_parties: [party("p1", "granted")] });
  let capturedBody = "";
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hi there" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "off",
        TWILIO_FROM_NUMBER: "MG0123456789abcdef",
        TWILIO_ACCOUNT_SID: "AC1",
        TWILIO_AUTH_TOKEN: "tok",
      }),
      fetchImpl: ((_url: string, init: { body: string }) => {
        capturedBody = init.body;
        return Promise.resolve(new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 200 }));
      }) as unknown as typeof fetch,
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(res.sent);
  assert(capturedBody.includes("MessagingServiceSid=MG0123456789abcdef"), "MG SID → MessagingServiceSid");
  assert(!capturedBody.includes("From=MG"), "must not send From=MG…");
});

Deno.test("isQuietHours brackets the 8am–8pm window", () => {
  // 09:00 UTC is 04:00 America/Chicago (CDT) — quiet.
  assert(isQuietHours(new Date("2026-07-08T09:00:00Z"), "America/Chicago"));
  // 18:00 UTC is 13:00 Chicago — open.
  assert(!isQuietHours(new Date("2026-07-08T18:00:00Z"), "America/Chicago"));
});
