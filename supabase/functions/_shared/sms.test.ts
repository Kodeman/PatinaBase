// Deno test for the shared sendPartySms path.
// Run: deno test --no-check -A supabase/functions/_shared/sms.test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { flushDeferredMessages, isQuietHours, sendPartySms } from "./sms.ts";
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
    sms_consent_source: "verbal",
    sms_consent_evidence: "Recorded during the project kickoff meeting",
    sms_consent_recorded_at: "2026-07-08T18:00:00Z",
    sms_consent_disclosure_version: "field-sms-v1",
  };
}

Deno.test("dry_run writes a row and never calls Twilio", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
  });
  let fetchCalls = 0;
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "dry_run",
        TWILIO_FROM_NUMBER: "+15550000000",
      }),
      fetchImpl: (() => {
        fetchCalls++;
        return Promise.reject("nope");
      }) as unknown as typeof fetch,
      now: new Date("2026-07-08T18:00:00Z"), // ~1pm Chicago — not quiet
    },
  );
  assert(res.sent, "should report sent");
  assertEquals(fetchCalls, 0, "Twilio must not be called in dry_run");
  const msgs = fake._data.sms_messages ?? [];
  assertEquals(msgs.length, 1);
  assertEquals((msgs[0] as { twilio_status: string }).twilio_status, "dry_run");
  assert(
    String((msgs[0] as { twilio_sid: string }).twilio_sid).startsWith("dev-"),
  );
});

Deno.test("consent gate blocks not_asked and opted_out", async () => {
  for (
    const [consent, reason] of [["not_asked", "not_consented"], [
      "opted_out",
      "opted_out",
    ]]
  ) {
    const fake = createFakeSupabase({
      project_parties: [party("p1", consent)],
    });
    const res = await sendPartySms(
      fake as never,
      { partyId: "p1", body: "hello" },
      {
        getEnv: envOf({ SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+1" }),
        now: new Date("2026-07-08T18:00:00Z"),
      },
    );
    assert(!res.sent, `${consent} must not send`);
    assertEquals(res.reason, reason);
    assertEquals(
      (fake._data.sms_messages ?? []).length,
      0,
      "no row on a blocked send",
    );
  }
});

Deno.test("sms_optin_invite is allowed to a pending party", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "pending")],
  });
  const res = await sendPartySms(
    fake as never,
    {
      partyId: "p1",
      templateKey: "sms_optin_invite",
      body: "Reply YES for updates",
    },
    {
      getEnv: envOf({ SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+1" }),
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(res.sent, "invite should reach a pending party");
});

Deno.test("quiet hours defer stores the body without sending", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
  });
  let fetchCalls = 0;
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "after hours" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "off",
        TWILIO_FROM_NUMBER: "+1",
        TWILIO_ACCOUNT_SID: "AC",
        TWILIO_AUTH_TOKEN: "tok",
      }),
      fetchImpl: (() => {
        fetchCalls++;
        return Promise.reject("nope");
      }) as unknown as typeof fetch,
      now: new Date("2026-07-08T09:00:00Z"), // ~4am Chicago — quiet
    },
  );
  assert(res.deferred, "should defer off-hours");
  assert(!res.sent);
  assertEquals(fetchCalls, 0);
  const msgs = fake._data.sms_messages ?? [];
  assertEquals(
    (msgs[0] as { twilio_status: string }).twilio_status,
    "deferred",
  );
  assertEquals((msgs[0] as { body: string }).body, "after hours");
});

Deno.test("caller-owned sensitive outbox never persists a raw guest URL", async () => {
  const raw = "Open https://client.patina.cloud/field/sr_SECRET_RAW_TOKEN";
  const audit = "Patina Site Request private link [redacted]";
  const quietFake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
  });
  const deferred = await sendPartySms(
    quietFake as never,
    {
      partyId: "p1",
      body: raw,
      auditBody: audit,
      deferToCaller: true,
      siteRequestDispatchOutboxId: "77777777-7777-4777-8777-777777777777",
    },
    {
      getEnv: envOf({ SMS_DEV_MODE: "off", TWILIO_FROM_NUMBER: "+1" }),
      now: new Date("2026-07-08T09:00:00Z"),
    },
  );
  assert(deferred.deferred);
  assertEquals((quietFake._data.sms_messages ?? []).length, 0);

  const redirectFake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
  });
  let providerBody = "";
  const sent = await sendPartySms(
    redirectFake as never,
    {
      partyId: "p1",
      body: raw,
      auditBody: audit,
      deferToCaller: true,
      siteRequestDispatchOutboxId: "77777777-7777-4777-8777-777777777777",
    },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "redirect",
        SMS_DEV_REDIRECT_NUMBER: "+15550009999",
        TWILIO_FROM_NUMBER: "+15550000000",
        TWILIO_ACCOUNT_SID: "AC1",
        TWILIO_AUTH_TOKEN: "tok",
      }),
      fetchImpl: ((_url: string, init: { body: string }) => {
        providerBody = init.body;
        return Promise.resolve(
          new Response(JSON.stringify({ sid: "SM123", status: "queued" }), {
            status: 200,
          }),
        );
      }) as unknown as typeof fetch,
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(sent.sent);
  assert(
    providerBody.includes(encodeURIComponent(raw).replace(/%20/g, "+")) ||
      providerBody.includes("sr_SECRET_RAW_TOKEN"),
  );
  const logged = String(
    (redirectFake._data.sms_messages?.[0] as { body?: string })?.body ?? "",
  );
  assertEquals(logged, audit);
  assert(!logged.includes("sr_SECRET_RAW_TOKEN"));
  assertEquals(
    (redirectFake._data.sms_messages?.[0] as {
      site_request_dispatch_outbox_id?: string;
    })?.site_request_dispatch_outbox_id,
    "77777777-7777-4777-8777-777777777777",
  );
});

Deno.test("MG From + SMS_CONVERSATION_NUMBER keys the conversation on the physical number while Twilio still gets the MG SID", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
  });
  let capturedBody = "";
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hi there" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "off",
        TWILIO_FROM_NUMBER: "MG0123456789abcdef",
        SMS_CONVERSATION_NUMBER: "+15551230000",
        TWILIO_ACCOUNT_SID: "AC1",
        TWILIO_AUTH_TOKEN: "tok",
      }),
      fetchImpl: ((_url: string, init: { body: string }) => {
        capturedBody = init.body;
        return Promise.resolve(
          new Response(JSON.stringify({ sid: "SM123", status: "queued" }), {
            status: 200,
          }),
        );
      }) as unknown as typeof fetch,
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(res.sent);
  assert(
    capturedBody.includes("MessagingServiceSid=MG0123456789abcdef"),
    "MG SID → MessagingServiceSid",
  );
  assert(!capturedBody.includes("From=MG"), "must not send From=MG…");
  const conv = (fake._data.sms_conversations ?? [])[0] as {
    twilio_number: string;
  };
  assert(conv, "a conversation should exist");
  assertEquals(
    conv.twilio_number,
    "+15551230000",
    "conversation keyed on the physical number, not the MG SID",
  );
});

Deno.test("MG From without SMS_CONVERSATION_NUMBER refuses to send (would split the inbound thread)", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
  });
  let fetchCalls = 0;
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
      fetchImpl: (() => {
        fetchCalls++;
        return Promise.reject("must not call Twilio");
      }) as unknown as typeof fetch,
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(!res.sent);
  assertEquals(res.reason, "conversation_number_not_configured");
  assertEquals(fetchCalls, 0, "Twilio must not be called");
  assertEquals(
    (fake._data.sms_conversations ?? []).length,
    0,
    "no conversation created",
  );
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    0,
    "no message row inserted",
  );
});

Deno.test("MG-prefixed SMS_CONVERSATION_NUMBER is treated as unset and refuses to send", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
  });
  let fetchCalls = 0;
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hi there" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "off",
        TWILIO_FROM_NUMBER: "MG0123456789abcdef",
        SMS_CONVERSATION_NUMBER: "MG9999999999abcdef",
        TWILIO_ACCOUNT_SID: "AC1",
        TWILIO_AUTH_TOKEN: "tok",
      }),
      fetchImpl: (() => {
        fetchCalls++;
        return Promise.reject("must not call Twilio");
      }) as unknown as typeof fetch,
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(!res.sent);
  assertEquals(res.reason, "conversation_number_not_configured");
  assertEquals(fetchCalls, 0, "Twilio must not be called");
  assertEquals(
    (fake._data.sms_conversations ?? []).length,
    0,
    "no conversation created",
  );
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    0,
    "no message row inserted",
  );
});

// ── flushDeferredMessages hardening ─────────────────────────────────────────
function flushEnv(extra: Record<string, string> = {}) {
  return envOf({
    SMS_DEV_MODE: "off",
    TWILIO_FROM_NUMBER: "+15550000000",
    TWILIO_ACCOUNT_SID: "AC1",
    TWILIO_AUTH_TOKEN: "tok",
    ...extra,
  });
}

Deno.test("flush: an opted-out recipient is suppressed and never sent", async () => {
  const now = new Date("2026-07-08T18:00:00Z"); // ~1pm Chicago — not quiet
  const fake = createFakeSupabase({
    sms_conversations: [
      { id: "conv1", twilio_number: "+15550000000", phone_e164: "+15551230001" },
    ],
    sms_messages: [
      {
        id: "m1",
        direction: "outbound",
        twilio_status: "deferred",
        body: "hello",
        conversation_id: "conv1",
        party_id: "p1",
        template_key: "sms_daily_digest",
        created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      },
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551230001", sms_consent_status: "opted_out" },
    ],
  });
  let fetchCalls = 0;
  const result = await flushDeferredMessages(fake as never, {
    getEnv: flushEnv(),
    fetchImpl: (() => {
      fetchCalls++;
      return Promise.reject("must not call Twilio");
    }) as unknown as typeof fetch,
    now,
  });
  assertEquals(result.flushed, 0);
  assertEquals(result.suppressed, 1);
  assertEquals(fetchCalls, 0);
  const row = (fake._data.sms_messages ?? [])[0] as {
    twilio_status: string;
    error_message: string;
  };
  assertEquals(row.twilio_status, "suppressed");
  assertEquals(row.error_message, "opted_out");
});

Deno.test("flush: a deferred sms_optin_invite with no project_parties rows on the phone is suppressed as not_invitable", async () => {
  const now = new Date("2026-07-08T18:00:00Z"); // ~1pm Chicago — not quiet
  const fake = createFakeSupabase({
    sms_conversations: [
      { id: "conv1", twilio_number: "+15550000000", phone_e164: "+15551239999" },
    ],
    sms_messages: [
      {
        id: "m1",
        direction: "outbound",
        twilio_status: "deferred",
        body: "Reply YES for updates",
        conversation_id: "conv1",
        party_id: null,
        template_key: "sms_optin_invite",
        created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      },
    ],
    project_parties: [],
  });
  let fetchCalls = 0;
  const result = await flushDeferredMessages(fake as never, {
    getEnv: flushEnv(),
    fetchImpl: (() => {
      fetchCalls++;
      return Promise.reject("must not call Twilio");
    }) as unknown as typeof fetch,
    now,
  });
  assertEquals(result.flushed, 0);
  assertEquals(result.suppressed, 1);
  assertEquals(fetchCalls, 0);
  const row = (fake._data.sms_messages ?? [])[0] as {
    twilio_status: string;
    error_message: string;
  };
  assertEquals(row.twilio_status, "suppressed");
  assertEquals(row.error_message, "not_invitable");
});

Deno.test("flush: a row older than 24h expires without sending", async () => {
  const now = new Date("2026-07-08T18:00:00Z");
  const fake = createFakeSupabase({
    sms_conversations: [
      { id: "conv1", twilio_number: "+15550000000", phone_e164: "+15551230002" },
    ],
    sms_messages: [
      {
        id: "m1",
        direction: "outbound",
        twilio_status: "deferred",
        body: "hello",
        conversation_id: "conv1",
        party_id: "p1",
        template_key: "sms_daily_digest",
        created_at: new Date(now.getTime() - 25 * 60 * 60 * 1000)
          .toISOString(),
      },
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551230002", sms_consent_status: "granted" },
    ],
  });
  let fetchCalls = 0;
  const result = await flushDeferredMessages(fake as never, {
    getEnv: flushEnv(),
    fetchImpl: (() => {
      fetchCalls++;
      return Promise.reject("must not call Twilio");
    }) as unknown as typeof fetch,
    now,
  });
  assertEquals(result.flushed, 0);
  assertEquals(result.expired, 1);
  assertEquals(fetchCalls, 0);
  const row = (fake._data.sms_messages ?? [])[0] as {
    twilio_status: string;
    error_message: string;
  };
  assertEquals(row.twilio_status, "expired");
  assertEquals(row.error_message, "deferred_expired");
});

Deno.test("flush: a Twilio send failure marks the row failed with the error, single attempt", async () => {
  const now = new Date("2026-07-08T18:00:00Z");
  const fake = createFakeSupabase({
    sms_conversations: [
      { id: "conv1", twilio_number: "+15550000000", phone_e164: "+15551230003" },
    ],
    sms_messages: [
      {
        id: "m1",
        direction: "outbound",
        twilio_status: "deferred",
        body: "hello",
        conversation_id: "conv1",
        party_id: "p1",
        template_key: "sms_daily_digest",
        created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      },
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551230003", sms_consent_status: "granted" },
    ],
  });
  let fetchCalls = 0;
  const result = await flushDeferredMessages(fake as never, {
    getEnv: flushEnv(),
    fetchImpl: (() => {
      fetchCalls++;
      return Promise.resolve(new Response("boom", { status: 500 }));
    }) as unknown as typeof fetch,
    now,
  });
  assertEquals(result.flushed, 0);
  assertEquals(fetchCalls, 1, "a single attempt — no retry accumulation");
  const row = (fake._data.sms_messages ?? [])[0] as {
    twilio_status: string;
    error_message: string;
  };
  assertEquals(row.twilio_status, "failed");
  assert(row.error_message.includes("Twilio 500"));
});

Deno.test("isQuietHours brackets the 8am–8pm window", () => {
  // 09:00 UTC is 04:00 America/Chicago (CDT) — quiet.
  assert(isQuietHours(new Date("2026-07-08T09:00:00Z"), "America/Chicago"));
  // 18:00 UTC is 13:00 Chicago — open.
  assert(!isQuietHours(new Date("2026-07-08T18:00:00Z"), "America/Chicago"));
});

// ── the studio-scoped consent gate (migration 00594) ────────────────────────

const CONSENT_ENV = {
  SMS_DEV_MODE: "dry_run",
  TWILIO_FROM_NUMBER: "+15550000000",
};
const OPEN_HOURS = new Date("2026-07-08T18:00:00Z"); // ~1pm Chicago

Deno.test("the studio's consent record blocks a send the party row would allow", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "opted_out",
    }],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "an opted-out studio record must block the send");
  assertEquals(res.reason, "opted_out");
  assertEquals((fake._data.sms_messages ?? []).length, 0, "no row on a blocked send");
});

Deno.test("another studio's opt-out does not block this studio's send", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [
      // Alpha owns this job and said yes; Beta holds the same number and got a
      // STOP. Before 00594 the phone-global reduction silenced Alpha too.
      {
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551230001",
        status: "granted",
      },
      {
        organization_id: "org-beta",
        channel_kind: "sms",
        channel_value: "+15551230001",
        status: "opted_out",
      },
    ],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(res.sent, "the owning studio's grant should carry the send");
});

Deno.test("with no studio record, an opted-out sibling party row still blocks (fail closed)", async () => {
  const fake = createFakeSupabase({
    project_parties: [
      party("p1", "granted"),
      { ...party("p2", "opted_out"), project_id: "proj2" },
    ],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    // studio_channel_consent deliberately empty — the backfill has not run.
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "an unbacked-filled number with a STOP anywhere must fail closed");
  assertEquals(res.reason, "opted_out");
});

// ── r1 review fixes ─────────────────────────────────────────────────────────

// M5: the studio-scoped record must be able to AUTHORISE, not only refuse.
// F-11: the studio recorded Dana's grant in 2025; the seat created today for
// the same number starts not_asked, because the mirror fires on a consent
// write, never on a party-row insert.
Deno.test("the studio's granted record carries a send the party row would refuse", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "not_asked")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "granted",
    }],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(res.sent, "the studio's own grant must authorise the send");
});

// …but never over an opt-out, from either ledger.
Deno.test("a granted record does not override an opted-out party row", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "opted_out")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "granted",
    }],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent);
  assertEquals(res.reason, "opted_out");
});

// M7: sms.ts resolves the org the same way 00594 does — studio_id, then the
// designer's primary studio — so the gate and the table cannot disagree about
// which studio a NULL-studio_id project belongs to.
Deno.test("a NULL-studio_id project resolves its org through _primary_studio_for", async () => {
  const fake = createFakeSupabase(
    {
      project_parties: [party("p1", "granted")],
      projects: [{ id: "proj1", studio_id: null, designer_id: "dz1" }],
      studio_channel_consent: [{
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551230001",
        status: "opted_out",
      }],
    },
    { _primary_studio_for: (args) => ({ data: args.p_user === "dz1" ? "org-alpha" : null, error: null }) },
  );
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "the studio's STOP must reach a project with no studio_id");
  assertEquals(res.reason, "opted_out");
});
