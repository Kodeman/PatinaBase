// Deno test for the shared sendPartySms path.
// Run: deno test --no-check -A supabase/functions/_shared/sms.test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  flushDeferredMessages,
  isQuietHours,
  resolveProjectOrg,
  sendPartySms,
} from "./sms.ts";
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

Deno.test("with no studio record at all the send is refused — not_asked is a refusal (R-AW)", async () => {
  const fake = createFakeSupabase({
    project_parties: [
      party("p1", "granted"),
      { ...party("p2", "opted_out"), project_id: "proj2" },
    ],
    projects: [
      { id: "proj1", studio_id: "org-alpha" },
      { id: "proj2", studio_id: "org-alpha" },
    ],
    // studio_channel_consent deliberately empty — the backfill has not run.
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "a number this studio holds no record for must not be texted");
  assertEquals(res.reason, "opted_out");
});

// ── R-AW's own rule, stated positively: a missing record is a refusal ───────
//
// This is the leg the ruling closes. Before it, a pair with no record fell
// through to the party row, and a pre-fold seat reading `granted` carried the
// send — the one path by which a frozen column could still AUTHORISE a text.
// 00594's fold folded every seat into a record inside the same migration and
// the freeze stopped the seats carrying news, so "no record" means "this studio
// never asked", and nobody may text somebody nobody asked.
Deno.test("no record refuses even a seat frozen at granted (R-AW)", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    // studio_channel_consent deliberately empty.
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "a frozen granted seat may not authorise a send on its own");
  assertEquals(res.reason, "opted_out");
  assertEquals((fake._data.sms_messages ?? []).length, 0, "no row on a blocked send");
});

// …and a record the FOLD minted at `not_asked` says the same thing as none.
Deno.test("a not_asked record refuses, exactly as no record does (R-AW)", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "not_asked",
      refusal_unanswered: false,
    }],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "not_asked is the absence of a consent, and it refuses");
  assertEquals(res.reason, "opted_out");
});

// R-AW: and it is the RECORD's absence that refuses, not the seat's word.
// Whose seat it is no longer matters — neither studio's is read. R-AK's own
// rule (one studio's STOP is not another's fact) now lives entirely in the
// per-studio record, asserted two tests above.
Deno.test("with no studio record the send is refused whoever's seat carries the STOP", async () => {
  const fake = createFakeSupabase({
    project_parties: [
      party("p1", "granted"),
      { ...party("p2", "opted_out"), project_id: "proj2" },
    ],
    projects: [
      { id: "proj1", studio_id: "org-alpha" },
      { id: "proj2", studio_id: "org-beta" },
    ],
    // studio_channel_consent deliberately empty for both.
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "no record for Alpha means not_asked, and not_asked refuses");
  assertEquals(res.reason, "opted_out");
});

// The one place the reduction stays phone-global is the unattributable branch —
// no studio resolves at all — and since R-AW it asks the RECORDS, never the
// seats. A party-row STOP on the number no longer blocks there: the frozen
// seats carry no fact the records do not, and a studio-less project has no
// ledger to hold one. That fail-open is named in the W1a report §5.2/§8 and is
// a policy ruling owed, not something this function can close.
Deno.test("with no record and no resolvable studio, an opted-out party row no longer blocks (R-AW)", async () => {
  const fake = createFakeSupabase({
    project_parties: [
      party("p1", "granted"),
      { ...party("p2", "opted_out"), project_id: "proj2" },
    ],
    // proj1 carries neither studio_id nor designer_id.
    projects: [{ id: "proj1", studio_id: null, designer_id: null }],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(res.sent, "nothing on the RECORDS has refused, so the unattributable send stands");
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

// …and since R-AW the VERDICT no longer reads the seat at all: it answers
// "allow" here. What still refuses this send is sendPartySms's own surviving
// PR-x leg (`recipient.consent === "opted_out"`, off resolveRecipient) — the
// last frozen-column reader in the send path, W2's to retire (report §5.1b).
// The asymmetry is deliberate: an over-refusal is safe, an under-refusal is a
// 10DLC incident.
Deno.test("a granted record does not override an opted-out party row — sendPartySms's legacy leg, not the verdict", async () => {
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

// r6 M6-3: `status` is not the whole verdict. refusal_unanswered is the stored
// fact the WRITE door treats as load-bearing, and it was invisible here.
// record_channel_reconsent() used to move a record opted_out -> pending keeping
// opt_out_at and the flag, and the mirror then stamped `pending` onto every seat
// in the studio on that number — so the party-row backstop below was gone and
// the record read `pending`. Traced from that state the invite branch passed
// and a real SMS went to a number that had replied STOP, on a 10DLC campaign.
// Since r7 M7-2 reconsent() leaves the record at `opted_out`, but a service_role
// writer can still leave this shape, so the gate stays and is tested here.
Deno.test("an unanswered refusal refuses the send, whatever the status now says", async () => {
  const fake = createFakeSupabase({
    // A seat the mirror left at `pending` while the record still carries an
    // unanswered refusal — the shape reconsent() used to write, and one a
    // service_role writer can still produce.
    project_parties: [party("p1", "pending")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "pending",
      refusal_unanswered: true,
      opt_out_at: "2025-12-03T00:00:00Z",
    }],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "a refusal nobody has answered must still refuse");
  assertEquals(res.reason, "opted_out");
});

// …and the opt-in invite is not an exception to it. This is the send the trace
// actually reached: templateKey sms_optin_invite, a `pending` seat carrying
// fresh evidence over a refusal nobody answered.
Deno.test("the opt-in invite does not slip past an unanswered refusal", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "pending")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "pending",
      refusal_unanswered: true,
      opt_out_at: "2025-12-03T00:00:00Z",
    }],
  });
  const res = await sendPartySms(fake as never, {
    partyId: "p1",
    templateKey: "sms_optin_invite",
    body: "Reply YES for updates",
  }, { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS });
  assert(!res.sent, "the invite must not reach a number that replied STOP");
  assertEquals(res.reason, "opted_out");
  assertEquals((fake._data.sms_messages ?? []).length, 0, "no row on a blocked send");
});

// r7 M7-1: the same flag standing on a record that reads `granted` — which is
// exactly what backfill_channel_consent_from_parties() mints for a legacy seat
// whose stale sms_opt_out_at no later consent answered. `status` says granted,
// the refusal underneath it was never answered, and the send must refuse.
Deno.test("a granted record carrying an unanswered refusal still refuses", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "granted",
      refusal_unanswered: true,
      opt_out_at: "2025-12-03T00:00:00Z",
    }],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "a folded granted row over an unanswered refusal must refuse");
  assertEquals(res.reason, "opted_out");
});

// The gate does not over-refuse: an ordinary pending record with no refusal
// behind it still takes the invite, exactly as before.
Deno.test("a pending record with no refusal behind it still takes the invite", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "pending")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "pending",
      refusal_unanswered: false,
    }],
  });
  const res = await sendPartySms(fake as never, {
    partyId: "p1",
    templateKey: "sms_optin_invite",
    body: "Reply YES for updates",
  }, { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS });
  assert(res.sent, "an ordinary pending invite must still go");
});

// And the recipient's own answer reopens it: the inbound rail writes
// refusal_unanswered = (status === "opted_out"), so a START lowers the flag.
Deno.test("the recipient's own START reopens the door", async () => {
  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "granted",
      refusal_unanswered: false,
      opt_out_at: "2025-12-03T00:00:00Z",
      consented_at: "2026-06-01T00:00:00Z",
    }],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(res.sent, "an answered refusal is no longer a refusal");
});

// M7: sms.ts resolves the org the same way 00594 does — studio_id, then the
// designer's primary studio — so the gate and the table cannot disagree about
// which studio a NULL-studio_id project belongs to.
//
// r5 M5-1 / R-AM: over the TABLES, never through the _primary_studio_for RPC,
// which is revoked from every PostgREST role (00483) and answers the rail with
// 42501. The rows below are the real query shape — organization_members joined
// to organizations — so a stubbed RPC can no longer hide that.
Deno.test("a NULL-studio_id project resolves its org from organization_members", async () => {
  const fake = createFakeSupabase(
    {
      project_parties: [party("p1", "granted")],
      projects: [{ id: "proj1", studio_id: null, designer_id: "dz1" }],
      organization_members: [
        // A non-studio org the designer also belongs to, first in the array —
        // the org type filter, not the row order, is what picks the studio.
        {
          user_id: "dz1",
          organization_id: "org-vendor",
          role: "owner",
          status: "active",
          joined_at: "2024-01-01T00:00:00Z",
        },
        {
          user_id: "dz1",
          organization_id: "org-alpha",
          role: "member",
          status: "active",
          joined_at: "2025-01-01T00:00:00Z",
        },
      ],
      organizations: [
        { id: "org-vendor", type: "vendor" },
        { id: "org-alpha", type: "design_studio" },
      ],
      studio_channel_consent: [{
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551230001",
        status: "opted_out",
      }],
    },
  );
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(!res.sent, "the studio's STOP must reach a project with no studio_id");
  assertEquals(res.reason, "opted_out");
});

// r5 M5-1 / R-AM: the ranking is 00315's own — owner first, then the earliest
// joined_at — read off organization_members, and a non-studio org is not a
// candidate however early it was joined.
Deno.test("the primary studio is the owner-role design_studio, read off the tables", async () => {
  const fake = createFakeSupabase({
    projects: [{ id: "proj1", studio_id: null, designer_id: "dz1" }],
    organization_members: [
      {
        user_id: "dz1",
        organization_id: "org-early",
        role: "member",
        status: "active",
        joined_at: "2023-01-01T00:00:00Z",
      },
      {
        user_id: "dz1",
        organization_id: "org-owned",
        role: "owner",
        status: "active",
        joined_at: "2026-01-01T00:00:00Z",
      },
      {
        user_id: "dz1",
        organization_id: "org-left",
        role: "owner",
        status: "removed",
        joined_at: "2022-01-01T00:00:00Z",
      },
    ],
    organizations: [
      { id: "org-early", type: "design_studio" },
      { id: "org-owned", type: "design_studio" },
      { id: "org-left", type: "design_studio" },
    ],
  });
  assertEquals(await resolveProjectOrg(fake as never, "proj1"), {
    org: "org-owned",
    failed: false,
  });
});

// …and a resolve that FAILED is not a project with no studio. The RPC this
// used to call (_primary_studio_for) is revoked from every PostgREST role
// (00483), so the 42501 came back as a silent null org and the gate then read
// another tenant's rows. Now it is a logged refusal.
Deno.test("a failed org resolve refuses the send instead of reading as no studio", async () => {
  const denied = { message: "permission denied for table projects" };
  const failing = {
    select: () => failing,
    eq: () => failing,
    in: () => failing,
    maybeSingle: () => Promise.resolve({ data: null, error: denied }),
    then: (cb: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: denied }).then(cb),
  };

  assertEquals(
    await resolveProjectOrg({ from: () => failing } as never, "proj1"),
    { org: null, failed: true },
  );

  const fake = createFakeSupabase({
    project_parties: [party("p1", "granted")],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
  });
  const blindToProjects = {
    ...fake,
    from: (table: string) =>
      table === "projects" ? failing : fake.from(table),
  };
  const res = await sendPartySms(
    blindToProjects as never,
    { partyId: "p1", body: "hello" },
    { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS },
  );
  assert(!res.sent, "an unresolvable studio must not send on a granted seat");
  assertEquals(res.reason, "opted_out");
});

// ── R-AW: a `granted` record IS self-certifying ─────────────────────────────
//
// r2 review B-3 scanned this studio's own party rows for a refusal before
// honouring its record, because the two ledgers could drift. They cannot any
// more: 00594's fold folded every seat into a record inside the same migration
// (opted_out winning per org) and the freeze stopped the seats carrying news,
// so a sibling seat reading `opted_out` with a `granted` record beside it means
// the refusal was folded and then ANSWERED — by the recipient's own START, the
// only thing that lowers refusal_unanswered. Re-deriving a verdict from the
// frozen copy could only contradict the live one.
Deno.test("a granted record carries the send, and a sibling seat's frozen STOP does not second-guess it", async () => {
  const fake = createFakeSupabase({
    project_parties: [
      party("p1", "not_asked"), // the new seat, proj1 / org-alpha
      { ...party("p2", "opted_out"), project_id: "proj2" }, // also org-alpha
    ],
    projects: [
      { id: "proj1", studio_id: "org-alpha" },
      { id: "proj2", studio_id: "org-alpha" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "granted", // stale: written before the STOP reached the rows
    }],
  });
  const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
    getEnv: envOf(CONSENT_ENV),
    now: OPEN_HOURS,
  });
  assert(res.sent, "the record is the consent; a frozen sibling seat is not a verdict");
});

// …and no seat of any studio blocks it, which is R-AK holding by construction
// now rather than by a scope on a scan: the only ledger read is this studio's
// own record.
Deno.test("another studio's opted-out party row does not block this studio's granted record", async () => {
  const fake = createFakeSupabase({
    project_parties: [
      party("p1", "not_asked"), // proj1 / org-alpha
      { ...party("p2", "opted_out"), project_id: "proj2" }, // proj2 / org-beta
    ],
    projects: [
      { id: "proj1", studio_id: "org-alpha" },
      { id: "proj2", studio_id: "org-beta" },
    ],
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
  assert(res.sent, "Beta's STOP must not silence Alpha (G-3)");
});

// (The stale-record party-row scan this file used to test at NULL-studio_id
// projects is gone with R-AW. The resolver itself is still covered — "a
// NULL-studio_id project resolves its org from organization_members" above.)

// ── r3 R-AH: the flush is a send path, and reads the SAME primary gate ──────
//
// flushDeferredMessages is called on the field-daily cron and is where
// sendPartySms parks an off-hours send. Before this it re-checked consent with
// the party-row reduction alone, so the two send paths answered one question
// two ways.

Deno.test("flush: the studio's granted record carries a deferred send the party row would refuse", async () => {
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
    // F-11: the seat was created today and has not caught up with the record.
    project_parties: [
      { id: "p1", phone_e164: "+15551230001", project_id: "proj1", sms_consent_status: "not_asked" },
    ],
    projects: [{ id: "proj1", studio_id: "org-alpha" }],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "granted",
    }],
  });
  const result = await flushDeferredMessages(fake as never, {
    getEnv: envOf({ SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+15550000000" }),
    now,
  });
  assertEquals(result.flushed, 1, "the studio's own grant must survive quiet hours");
  assertEquals(result.suppressed, 0);
});

Deno.test("flush: the studio's opted-out record suppresses a deferred send the party rows would allow", async () => {
  const now = new Date("2026-07-08T18:00:00Z");
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
    // The owning studio's own seat is gone (G-10 hard-deletes on roster
    // remove); another studio's granted row is all the reduction can see.
    project_parties: [
      { id: "p1", phone_e164: "+15551230001", project_id: "proj1", sms_consent_status: "granted" },
      { id: "p2", phone_e164: "+15551230001", project_id: "proj2", sms_consent_status: "granted" },
    ],
    projects: [
      { id: "proj1", studio_id: "org-alpha" },
      { id: "proj2", studio_id: "org-beta" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "opted_out",
    }],
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

// ── r3r2 BLOCKING: the flush's SECOND gate is the deferred party's own row ──
//
// The fail-closed legacy check reduced across every party row sharing the
// phone number, unscoped to the deferred row's own party. Two studios on one
// number (a shared vendor, a GC working for both, a recycled number) then
// answered for each other, in both directions.

Deno.test("flush: an unrelated studio's opted-out row does not suppress the owning studio's own granted send", async () => {
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
      // The studio that owns the deferred send: granted, on its own books.
      { id: "p1", phone_e164: "+15551230001", project_id: "proj1", sms_consent_status: "granted" },
      // An unrelated studio's STOP on the same number.
      { id: "p2", phone_e164: "+15551230001", project_id: "proj2", sms_consent_status: "opted_out" },
    ],
    projects: [
      { id: "proj1", studio_id: "org-alpha" },
      { id: "proj2", studio_id: "org-beta" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "granted",
    }],
  });
  const result = await flushDeferredMessages(fake as never, {
    getEnv: envOf({ SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+15550000000" }),
    now,
  });
  assertEquals(result.flushed, 1, "another studio's STOP is not this studio's fact");
  assertEquals(result.suppressed, 0);
});

Deno.test("flush: an unrelated studio's granted row does not carry a send for a studio that never asked", async () => {
  const now = new Date("2026-07-08T18:00:00Z");
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
      // org-alpha never asked, and holds no consent record either.
      { id: "p1", phone_e164: "+15551230001", project_id: "proj1", sms_consent_status: "not_asked" },
      // org-beta's own, legitimate grant, for its own job.
      { id: "p2", phone_e164: "+15551230001", project_id: "proj2", sms_consent_status: "granted" },
    ],
    projects: [
      { id: "proj1", studio_id: "org-alpha" },
      { id: "proj2", studio_id: "org-beta" },
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
  assertEquals(result.flushed, 0, "another studio's grant may not authorise this send");
  assertEquals(result.suppressed, 1);
  assertEquals(fetchCalls, 0);
  const row = (fake._data.sms_messages ?? [])[0] as {
    twilio_status: string;
    error_message: string;
  };
  assertEquals(row.twilio_status, "suppressed");
  // R-AW: Alpha holds no record, so the primary gate refuses outright rather
  // than falling through to the legacy leg's "not_consented".
  assertEquals(row.error_message, "opted_out");
});

Deno.test("flush: with no party on the deferred row the phone-global reduction still refuses a STOP", async () => {
  const now = new Date("2026-07-08T18:00:00Z");
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
        party_id: null,
        template_key: "sms_daily_digest",
        created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      },
    ],
    project_parties: [
      { id: "p2", phone_e164: "+15551230001", project_id: "proj2", sms_consent_status: "opted_out" },
    ],
    projects: [{ id: "proj2", studio_id: "org-beta" }],
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
  assertEquals(result.flushed, 0, "an unattributable send must not outrun a STOP");
  assertEquals(result.suppressed, 1);
  assertEquals(fetchCalls, 0);
});

// ── r7 R7-M2 under R-AW: the last phone-global branch is a RECORD scan ──────
//
// When no studio resolves for a send there is nothing to scope to, so the scan
// across the number is the only line left between an unattributable send and a
// STOP. It used to reduce over project_parties; R-AW makes it a scan of the
// consent records, and R-AM still governs it — a read that errored is not a
// read that found nothing. The party-row version of this test is gone with the
// leg it covered; the record version is directly below.

function unattributableSeed() {
  return {
    // A seat whose project has no studio_id and no designer — nothing resolves.
    project_parties: [{ ...party("p1", "granted"), project_id: null }],
  };
}

// ── R-AS: the unattributable branch reads the RECORDS first ────────────────
//
// The inbound STOP used to write project_parties phone-globally, and that write
// was this branch's backstop. Since R-AS the rail writes the record only and
// the legacy columns are frozen, so the phone-global question has to be asked
// of the records: any studio's recorded refusal on this number refuses a send
// that belongs to no studio at all.
Deno.test("an unattributable send is refused by another studio's RECORDED stop", async () => {
  const fake = createFakeSupabase({
    ...unattributableSeed(),
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "opted_out",
      refusal_unanswered: true,
    }],
  });
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello" },
    { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS },
  );
  assert(!res.sent, "a send with no studio must not outrun a recorded STOP");
  assertEquals(res.reason, "opted_out");
});

// …and a failed read of THAT scan refuses too, like its four siblings (R-AM).
Deno.test("an unattributable send whose record scan fails is refused, not allowed", async () => {
  const fake = createFakeSupabase(unattributableSeed());
  const denied = {
    ...fake,
    from: (table: string) =>
      table === "studio_channel_consent"
        ? {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: { message: "denied" } }),
            }),
          }),
        }
        : fake.from(table),
  };
  const res = await sendPartySms(
    denied as never,
    { partyId: "p1", body: "hello" },
    { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS },
  );
  assert(!res.sent, "a record scan we could not read is not a scan that found nothing");
  assertEquals(res.reason, "opted_out");
});

// The control: the same send, same shape, with the read working — otherwise the
// assertion above would pass for the wrong reason.
Deno.test("the unattributable send still goes when the phone-global scan reads clean", async () => {
  const fake = createFakeSupabase(unattributableSeed());
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello" },
    { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS },
  );
  assert(res.sent, "nothing on this number has refused, so the send stands");
});
