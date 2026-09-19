// Deno test for the shared sendPartySms path.
// Run: deno test --no-check -A supabase/functions/_shared/sms.test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  CLIENT_CAPABILITY_ACTIONS,
  CLIENT_SMS_TEMPLATES,
  flushDeferredMessages,
  isClientSmsTemplate,
  isQuietHours,
  localDayInTimezone,
  localMinutesInTimezone,
  resolveProjectOrg,
  sendClientSms,
  sendPartySms,
} from "./sms.ts";
import { CLIENT_LINK_ACTIONS } from "../client-invite/lib.ts";
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

// THE RECORD IS THE ONLY CONSENT (R-AY, final-run MAJOR-1/MAJOR-2). A send
// needs the studio's own `granted` record for the number; the seat word beside
// it in these fixtures decides nothing, in either direction. So every baseline
// fixture below carries the project's studio pointer and that record — before
// this pass a frozen `granted` seat was enough on its own.
const ORG_ALPHA_PROJECTS = [{ id: "proj1", studio_id: "org-alpha" }];
function grant(phone = "+15551230001") {
  return {
    organization_id: "org-alpha",
    channel_kind: "sms",
    channel_value: phone,
    status: "granted",
  };
}

// THE INVITE'S EVIDENCE IS THE RECORD'S (00646, SQ-92 F1). record_channel_invite
// / record_channel_consent stamp these on studio_channel_consent; the gate
// reads `source` and `recorded_by` off exactly that row. Until 00646 it read
// the seat's frozen sms_consent_* columns, which 00594's
// refuse_legacy_consent_write_trg means nothing can fill.
const RECORD_EVIDENCE = {
  source: "verbal",
  evidence: "Said yes at the kickoff walkthrough",
  recorded_at: "2026-07-08T17:00:00Z",
  disclosure_version: "field-sms-v1",
  recorded_by: "member-1",
};

/** A seat as Phase 1 actually finds one: all EIGHT frozen columns NULL. */
function frozenSeat(id: string) {
  return {
    id,
    phone_e164: "+15551230001",
    project_id: "proj1",
    display_name: "Sal Sub",
    sms_consent_status: null,
    sms_consented_at: null,
    sms_opt_out_at: null,
    sms_consent_source: null,
    sms_consent_evidence: null,
    sms_consent_recorded_at: null,
    sms_consent_recorded_by: null,
    sms_consent_disclosure_version: null,
  };
}

Deno.test("dry_run writes a row and never calls Twilio", async () => {
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
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

Deno.test("the consent gate blocks a record at not_asked and one at opted_out", async () => {
  // Both words are the RECORD's now (R-AY): the gate reads
  // studio_channel_consent and refuses everything that is not a standing
  // grant, which is why both come back with the one refusal reason. The seat
  // beside them is left at `granted` on purpose — it is read by nothing.
  for (const status of ["not_asked", "opted_out"]) {
    const fake = createFakeSupabase({
      project_parties: [party("p1", "granted")],
      projects: ORG_ALPHA_PROJECTS,
      studio_channel_consent: [{ ...grant(), status }],
    });
    const res = await sendPartySms(
      fake as never,
      { partyId: "p1", body: "hello" },
      {
        getEnv: envOf({ SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+1" }),
        now: new Date("2026-07-08T18:00:00Z"),
      },
    );
    assert(!res.sent, `a record at ${status} must not send`);
    assertEquals(res.reason, "opted_out");
    assertEquals(
      (fake._data.sms_messages ?? []).length,
      0,
      "no row on a blocked send",
    );
  }
});

Deno.test("sms_optin_invite is allowed to a pending party", async () => {
  // `pending` is the RECORD's word (contract S2): the studio asked, and the
  // recipient has not answered. That is the one door the invite may use.
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [{
      ...grant(),
      ...RECORD_EVIDENCE,
      status: "pending",
    }],
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
  assertEquals(res.status, "sent");
});

Deno.test("the invite is refused where NO record has asked anything (S2)", async () => {
  // The gap 00640 closes. A project with no resolvable studio answers
  // `unknown` whenever nothing on the number has refused — and before this the
  // invite gate could not tell that apart from a studio's own `pending`, so the
  // one send allowed past a non-granted record could reach a number no studio
  // had ever asked. `unknown` with no record behind it is `not_asked`, and
  // `not_asked` refuses.
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
  assert(!res.sent, "an invite needs a record that asked");
  assertEquals(res.reason, "not_consented");
  assertEquals(res.status, "failed");
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    0,
    "a refused invite writes no row",
  );
});

Deno.test("quiet hours defer stores the body without sending", async () => {
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
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
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
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
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
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
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
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
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
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
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
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
    // The refusal is the RECORD's; the seat is left reading `granted` to prove
    // the flush no longer asks it (R-AY, final-run MAJOR-1).
    project_parties: [
      {
        id: "p1",
        phone_e164: "+15551230001",
        project_id: "proj1",
        sms_consent_status: "granted",
      },
    ],
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [{ ...grant(), status: "opted_out" }],
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

// A deferred INVITE with no seat and no record: the `not_invitable` leg that
// suppressed it read the frozen seat reduction and is deleted (R-AY, final-run
// MAJOR-1), so what decides it now is the record scan on the unattributable
// branch — a recorded refusal anywhere on the number suppresses it, and with
// nothing recorded at all the double-opt-in invite still goes. That last
// fail-open is the studio-less-project policy question named in the W1a report
// §5.2/§8, and it is no longer a frozen column's decision either way.
Deno.test("flush: a deferred sms_optin_invite on a number some studio has RECORDED a stop for is suppressed", async () => {
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
    studio_channel_consent: [{
      organization_id: "org-beta",
      channel_kind: "sms",
      channel_value: "+15551239999",
      status: "opted_out",
      refusal_unanswered: true,
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
      {
        id: "p1",
        phone_e164: "+15551230003",
        project_id: "proj1",
        sms_consent_status: "granted",
      },
    ],
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant("+15551230003")],
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

// The unattributable branch — no studio resolves at all — asks the RECORDS and
// never the seats (R-AW), and since final-run MAJOR-2 it also refuses an
// ordinary send uniformly. It used to hand the decision to
// `recipient.consent`: a frozen `granted` seat sent, a frozen `not_asked` seat
// on the same population did not, which is a frozen column deciding a live
// text. With that leg gone, `unknown` is not a grant, so no ordinary message
// leaves for a project no studio owns — whatever either seat says.
Deno.test("with no record and no resolvable studio, NO seat word authorises the send (final-run MAJOR-2)", async () => {
  for (const seat of ["granted", "not_asked"]) {
    const fake = createFakeSupabase({
      project_parties: [
        party("p1", seat),
        { ...party("p2", "opted_out"), project_id: "proj2" },
      ],
      // proj1 carries neither studio_id nor designer_id.
      projects: [{ id: "proj1", studio_id: null, designer_id: null }],
    });
    const res = await sendPartySms(fake as never, { partyId: "p1", body: "hello" }, {
      getEnv: envOf(CONSENT_ENV),
      now: OPEN_HOURS,
    });
    assert(!res.sent, `a seat frozen at ${seat} may not carry an unattributable send`);
    assertEquals(res.reason, "not_consented");
  }
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

// …and THE RECORD CARRIES IT OVER A FROZEN REFUSAL (R-AY, final-run MAJOR-1).
// This is the design's own recovery path — the fold records the seat's
// refusal, the studio reconsents as evidence, the recipient replies START — and
// until this pass sendPartySms's surviving PR-x leg refused every send on it
// while the Call Sheet row, the Call Sheet vitals, the Directory row and
// field_activity_summary all printed "Texting" off the same record. One ledger,
// one answer: the seat is read by nothing.
Deno.test("a granted record carries the send over a seat frozen at opted_out (R-AY)", async () => {
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
  assert(res.sent, "the studio's own standing grant is the consent");
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
      ...RECORD_EVIDENCE,
    }],
  });
  const res = await sendPartySms(fake as never, {
    partyId: "p1",
    templateKey: "sms_optin_invite",
    body: "Reply YES for updates",
  }, { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS });
  assert(res.sent, "an ordinary pending invite must still go");
});

// ── the invite's evidence gate reads the RECORD (00646, SQ-92 F1) ───────────
//
// The defect this closes: the gate read the seat's sms_consent_source /
// evidence / recorded_at / disclosure_version, and 00594's
// refuse_legacy_consent_write_trg refuses every write to them
// (consent_legacy_column_frozen). So on any stack past 00594 — which is every
// stack Phase 1 can run on — a seat carries NULLs there and the gate refused
// EVERY invite, including the one resend_party_invite spends its
// once-per-challenge allowance on.
Deno.test("the invite stands on the RECORD's evidence, not the frozen seat", async () => {
  const fake = createFakeSupabase({
    // All eight frozen columns NULL — the only shape 00594 permits.
    project_parties: [frozenSeat("p1")],
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [{
      ...grant(),
      ...RECORD_EVIDENCE,
      status: "pending",
      refusal_unanswered: false,
    }],
  });
  const res = await sendPartySms(fake as never, {
    partyId: "p1",
    templateKey: "sms_optin_invite",
    body: "Reply YES for updates",
  }, { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS });
  assert(res.sent, "a record carrying source + recorded_by opens the invite");
  assertEquals(res.status, "sent");
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    1,
    "the send proceeded: the invite row was written",
  );
});

// …and it is still a gate. A record nobody signed does not open the invite:
// `recorded_by` is WHO wrote the consent down, and an unattributed record is
// exactly what the token has always meant.
Deno.test("a record with no recorded_by is refused consent_evidence_required", async () => {
  for (
    const missing of [
      { recorded_by: null },
      { source: null },
    ]
  ) {
    const fake = createFakeSupabase({
      project_parties: [frozenSeat("p1")],
      projects: ORG_ALPHA_PROJECTS,
      studio_channel_consent: [{
        ...grant(),
        ...RECORD_EVIDENCE,
        status: "pending",
        refusal_unanswered: false,
        ...missing,
      }],
    });
    const res = await sendPartySms(fake as never, {
      partyId: "p1",
      templateKey: "sms_optin_invite",
      body: "Reply YES for updates",
    }, { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS });
    assert(!res.sent, `a record missing ${Object.keys(missing)[0]} must refuse`);
    assertEquals(res.reason, "consent_evidence_required");
    assertEquals(res.status, "failed");
    assertEquals(
      (fake._data.sms_messages ?? []).length,
      0,
      "a refused invite writes no row",
    );
  }
});

// And the seat can no longer refuse what the record grants, either: the four
// columns the old gate read are NULL above, and a seat carrying the OLD
// pre-freeze evidence cannot stand in for a record that has none.
Deno.test("a pre-fold seat's own evidence cannot open the invite", async () => {
  const fake = createFakeSupabase({
    // party() carries source / evidence / recorded_at / disclosure_version —
    // the exact four the retired gate accepted.
    project_parties: [party("p1", "pending")],
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [{
      ...grant(),
      status: "pending",
      refusal_unanswered: false,
      recorded_at: "2026-07-08T17:00:00Z",
    }],
  });
  const res = await sendPartySms(fake as never, {
    partyId: "p1",
    templateKey: "sms_optin_invite",
    body: "Reply YES for updates",
  }, { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS });
  assert(!res.sent, "the seat's frozen evidence decides nothing");
  assertEquals(res.reason, "consent_evidence_required");
});

// And the columns: no read on the whole invite send asks for a frozen
// sms_consent_* column any more, and the consent record's read is the one that
// carries the evidence — the gate opens no query of its own for it.
Deno.test("the invite send reads no frozen sms_consent_ column", async () => {
  const fake = createFakeSupabase({
    project_parties: [frozenSeat("p1")],
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [{
      ...grant(),
      ...RECORD_EVIDENCE,
      status: "pending",
      refusal_unanswered: false,
    }],
  });
  const selects: Array<{ table: string; cols: string }> = [];
  const from = fake.from.bind(fake);
  (fake as unknown as { from: (t: string) => unknown }).from = (
    table: string,
  ) => {
    const query = from(table) as { select: (cols?: string) => unknown };
    const select = query.select.bind(query);
    query.select = (cols?: string) => {
      selects.push({ table, cols: cols ?? "*" });
      return select(cols);
    };
    return query;
  };
  const res = await sendPartySms(fake as never, {
    partyId: "p1",
    templateKey: "sms_optin_invite",
    body: "Reply YES for updates",
  }, { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS });
  assert(res.sent);
  assertEquals(
    selects.filter((s) => s.cols.includes("sms_consent_")),
    [],
    "no read on the invite path may ask for a frozen column",
  );
  const record = selects.find((s) => s.table === "studio_channel_consent");
  assert(record, "the consent record is read");
  assert(
    record.cols.includes("source") && record.cols.includes("recorded_by"),
    `the ONE record read carries the evidence: ${record.cols}`,
  );
  assertEquals(
    selects.filter((s) => s.table === "studio_channel_consent").length,
    1,
    "…and the gate opens no second read of it",
  );
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

// The control: the same send, same shape, with the read working. Since
// final-run MAJOR-2 it is refused too — `unknown` is not a grant and no seat
// gets to say otherwise — so the two refusals are told apart by their REASON:
// a scan that could not be read is an `opted_out`, a scan that read clean is a
// `not_consented`. Without that the assertion above would pass for the wrong
// reason.
Deno.test("the unattributable send with a clean scan is refused as not_consented, not as an opt-out", async () => {
  const fake = createFakeSupabase(unattributableSeed());
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello" },
    { getEnv: envOf(CONSENT_ENV), now: OPEN_HOURS },
  );
  assert(!res.sent, "no record grants this number, so nothing ordinary goes out");
  assertEquals(res.reason, "not_consented");
});

// ── CR3-9 · the studio's own rule is a send gate ─────────────────────────────
// C7: "the rule outranks the designation". Until this pass the whole rail gated
// on the consent record alone — `grep -rl channels_forbidden
// supabase/functions/` returned nothing — so a person carrying BOTH a recorded
// grant and a "Never text" rule was sendable from every surface and cron.

Deno.test("a 'never text' rule on the person's card refuses a send the record grants", async () => {
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [{ ...party("p1", "granted"), studio_contact_id: "card-1" }],
    studio_contact_rules: [
      {
        subject_type: "person",
        subject_id: "card-1",
        channels_forbidden: ["sms"],
      },
    ],
  });
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "dry_run",
        TWILIO_FROM_NUMBER: "+15550000000",
      }),
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(!res.sent, "the studio wrote down that this person is never texted");
  assertEquals(res.reason, "contact_rule_forbids_sms");
  assertEquals((fake._data.sms_messages ?? []).length, 0);
});

Deno.test("the rule binds the opt-in invite too — 'never text' is not 'never text except once'", async () => {
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [{ ...grant(), status: "pending" }],
    project_parties: [{ ...party("p1", "pending"), studio_contact_id: "card-1" }],
    studio_contact_rules: [
      {
        subject_type: "engagement",
        subject_id: "p1",
        channels_forbidden: ["sms"],
      },
    ],
  });
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello", templateKey: "sms_optin_invite" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "dry_run",
        TWILIO_FROM_NUMBER: "+15550000000",
      }),
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(!res.sent);
  assertEquals(res.reason, "contact_rule_forbids_sms");
});

Deno.test("a rule that bars only email leaves the text rail open", async () => {
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [{ ...party("p1", "granted"), studio_contact_id: "card-1" }],
    studio_contact_rules: [
      {
        subject_type: "person",
        subject_id: "card-1",
        channels_forbidden: ["email"],
      },
    ],
  });
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "dry_run",
        TWILIO_FROM_NUMBER: "+15550000000",
      }),
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(res.sent, "Dana Kowalski's rule bars the email, not the text");
});

Deno.test("a rule read that FAILS refuses the send rather than falling through", async () => {
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [{ ...party("p1", "granted"), studio_contact_id: "card-1" }],
  });
  const denied = {
    ...fake,
    from: (table: string) =>
      table === "studio_contact_rules"
        ? {
          select: () => ({
            in: () =>
              Promise.resolve({ data: null, error: { message: "denied" } }),
          }),
        }
        : fake.from(table),
  };
  const res = await sendPartySms(
    denied as never,
    { partyId: "p1", body: "hello" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "dry_run",
        TWILIO_FROM_NUMBER: "+15550000000",
      }),
      now: new Date("2026-07-08T18:00:00Z"),
    },
  );
  assert(!res.sent, "a rule that cannot be read is not a rule that is absent");
  assertEquals(res.reason, "contact_rule_forbids_sms");
});

// ── E13 on the flush path (W4 r3 MAJOR-5) ───────────────────────────────────
// field-daily/core.ts:193 calls flushDeferredMessages on every run, so a digest
// deferred past 8pm by quiet hours — the normal shape of the field rail — is
// the rail's MOST ordinary send. It wrote no touch, so the card's derived
// "Last touch" showed the previous contact: the room saying the studio has not
// reached someone it reached this morning.

Deno.test("flush: every flushed row writes one out touch, and a skipped or suppressed one writes none", async () => {
  const now = new Date("2026-07-08T18:00:00Z"); // ~1pm Chicago — not quiet
  const deferred = (
    id: string,
    partyId: string | null,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    direction: "outbound",
    twilio_status: "deferred",
    body: "hello",
    conversation_id: "conv1",
    party_id: partyId,
    template_key: "sms_daily_digest",
    created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    ...extra,
  });
  const touches: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase({
    sms_conversations: [
      { id: "conv1", twilio_number: "+15550000000", phone_e164: "+15551230001" },
      { id: "conv2", twilio_number: "+15550000000", phone_e164: "+15551230002" },
      { id: "conv3", twilio_number: "+15550000000", phone_e164: "+15551230003" },
    ],
    sms_messages: [
      deferred("m1", "p1"),                       // flushes
      deferred("m2", "p2", { conversation_id: "conv2" }), // suppressed: refused
      // A phone-only INVITE: it goes (the invite gate owns `pending`/no
      // record), and it names no seat, so there is no subject to file a touch
      // against — exactly sendPartySms's own rule.
      deferred("m3", null, {
        conversation_id: "conv3",
        template_key: "sms_optin_invite",
      }),
      // Stale beyond the 24h TTL: expired, never sent.
      deferred("m4", "p1", {
        created_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      }),
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551230001", project_id: "proj1" },
      { id: "p2", phone_e164: "+15551230002", project_id: "proj1" },
    ],
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [
      {
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551230001",
        status: "granted",
      },
      {
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551230002",
        status: "opted_out",
      },
    ],
  }, {
    record_touch: (args) => {
      touches.push(args);
      return { data: "touch-1", error: null };
    },
  });

  const result = await flushDeferredMessages(fake as never, {
    getEnv: envOf({
      SMS_DEV_MODE: "dry_run",
      TWILIO_FROM_NUMBER: "+15550000000",
    }),
    now,
  });

  assertEquals(result.flushed, 2);
  assertEquals(result.suppressed, 1);
  assertEquals(result.expired, 1);

  // ONE touch, for the ONE flushed row that names a seat. The phone-only row
  // has no subject to file against; the refused and expired rows never went.
  assertEquals(touches.length, 1);
  assertEquals(touches[0].p_subject_type, "engagement");
  assertEquals(touches[0].p_subject_id, "p1");
  assertEquals(touches[0].p_channel_kind, "sms");
  assertEquals(touches[0].p_direction, "out");
  assertEquals(touches[0].p_actor_ref, "sms-dispatch-flush");
  assertEquals(touches[0].p_message_ref, "m1");
  assertEquals(touches[0].p_occurred_at, now.toISOString());
});

Deno.test("flush: a touch the database refuses never fails the send", async () => {
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
      { id: "p1", phone_e164: "+15551230001", project_id: "proj1" },
    ],
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "granted",
    }],
  }, {
    record_touch: () => ({ data: null, error: { message: "denied" } }),
  });

  const result = await flushDeferredMessages(fake as never, {
    getEnv: envOf({
      SMS_DEV_MODE: "dry_run",
      TWILIO_FROM_NUMBER: "+15550000000",
    }),
    now,
  });
  // A record of the send, never a gate on it.
  assertEquals(result.flushed, 1);
  assertEquals(
    ((fake._data.sms_messages ?? [])[0] as { twilio_status: string })
      .twilio_status,
    "dry_run",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 00640 — the gate order, the link at dispatch, and the send claim
// (contract S5/S6/S7). Everything below this line is new with this migration.
// ═══════════════════════════════════════════════════════════════════════════

const FIELD_TOKEN = "aXb9-Kq2Zt7Rm4Ns1Pv6Cw8Dy0Ef3Gh5";

/** A fake whose create_field_link RPC mints once and counts how often. */
function linkWorld(extra: Record<string, unknown[]> = {}) {
  const mints: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase({
    projects: [{
      id: "proj1",
      studio_id: "org-alpha",
      designer_id: "u-designer",
      name: "Lindqvist",
    }],
    organizations: [{
      id: "org-alpha",
      name: "Field & Form",
      type: "design_studio",
    }],
    organization_members: [{
      organization_id: "org-alpha",
      user_id: "u-designer",
      status: "active",
    }],
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
    email_templates: [{
      slug: "field_digest",
      is_active: true,
      html_content:
        "{{studio_name}}: today on {{project_name}}. Open {{link}} " +
        "Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
    }],
    ...(extra as Record<string, Array<Record<string, unknown>>>),
  }, {
    create_field_link: (args) => {
      mints.push(args);
      return { data: [{ id: "link-1", token: FIELD_TOKEN }], error: null };
    },
  });
  return { fake, mints };
}

const QUIET = new Date("2026-07-08T09:00:00Z"); // ~4am Chicago
const OPEN = new Date("2026-07-08T18:00:00Z"); // ~1pm Chicago

Deno.test("GATE 1: suppression refuses ahead of a granted consent record", async () => {
  // The carrier's and the recipient's own STOP, as the provider recorded it.
  // It outranks every ledger, so it is asked FIRST: a studio that records a
  // fresh invite after a STOP cannot text that number (contract S2/S5).
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  }, {
    sms_is_suppressed: () => ({ data: true, error: null }),
  });
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "dry_run",
        TWILIO_FROM_NUMBER: "+15550000000",
      }),
      now: OPEN,
    },
  );
  assert(!res.sent, "a suppressed pair must not be texted");
  assertEquals(res.reason, "suppressed");
  assertEquals(res.status, "failed");
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    0,
    "a refused send writes no row",
  );
});

Deno.test("GATE 1: an unreadable suppression ledger refuses, it does not fall through", async () => {
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  }, {
    sms_is_suppressed: () => ({ data: null, error: { message: "denied" } }),
  });
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "hello" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "dry_run",
        TWILIO_FROM_NUMBER: "+15550000000",
      }),
      now: OPEN,
    },
  );
  assert(!res.sent, "not knowing is not permission");
  assertEquals(res.reason, "suppression_unreadable");
});

Deno.test("GATE 3: FIELD_LINE_PHASE decides whether a new automation may send", async () => {
  // A browser flag cannot gate a cron, a trigger or an edge function, so the
  // phase gate is a server env (contract S7). Phase 0 — everything that shipped
  // before The Field Line — never asks.
  const base = {
    SMS_DEV_MODE: "dry_run",
    TWILIO_FROM_NUMBER: "+15550000000",
  };
  const offFake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  });
  const off = await sendPartySms(
    offFake as never,
    { partyId: "p1", body: "hello", automationPhase: 1 },
    { getEnv: envOf(base), now: OPEN },
  );
  assert(!off.sent, "phase 1 must not send while the server says 0");
  assertEquals(off.reason, "field_line_phase_off");
  assertEquals((offFake._data.sms_messages ?? []).length, 0);

  const onFake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  });
  const on = await sendPartySms(
    onFake as never,
    { partyId: "p1", body: "hello", automationPhase: 1 },
    { getEnv: envOf({ ...base, FIELD_LINE_PHASE: "1" }), now: OPEN },
  );
  assert(on.sent, "the server turned the phase on");

  const legacyFake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  });
  const legacy = await sendPartySms(
    legacyFake as never,
    { partyId: "p1", body: "hello" },
    { getEnv: envOf(base), now: OPEN },
  );
  assert(legacy.sent, "a phase-0 send never asks the gate");
});

Deno.test("S6: a quiet-hours defer MINTS NOTHING and stores a recipe, not a token", async () => {
  // The defect this closes: resolveBody minted the link BEFORE the quiet-hours
  // gate, so an 8pm digest minted a token, deferred, and the trade woke to a
  // URL that had been alive since the night before — while the mint itself
  // revoked the link they were already using.
  const { fake, mints } = linkWorld();
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", templateKey: "field_digest" },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "off",
        TWILIO_FROM_NUMBER: "+15550000000",
        TWILIO_ACCOUNT_SID: "AC",
        TWILIO_AUTH_TOKEN: "tok",
      }),
      fetchImpl: (() => Promise.reject("must not send")) as unknown as
        typeof fetch,
      now: QUIET,
    },
  );
  assert(res.deferred, "off-hours stores, it does not send");
  assertEquals(res.status, "deferred");
  assertEquals(mints.length, 0, "NOTHING is minted at defer time");
  // Due at the next moment inside the window, not "now + N hours".
  assertEquals(res.dueAt, "2026-07-08T13:00:00.000Z");

  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(row.twilio_status, "deferred");
  const stored = String(row.body);
  assert(
    stored.includes("[link at send]"),
    `the preview names the link without being one: ${stored}`,
  );
  assert(!stored.includes(FIELD_TOKEN), "no token is stored at rest");
  const recipe = row.recipe as Record<string, unknown>;
  assertEquals(recipe.template_key, "field_digest");
  assertEquals(recipe.link_kind, "field");
  assertEquals(recipe.party_id, "p1");
  assert(
    !JSON.stringify(recipe).includes(FIELD_TOKEN),
    "the recipe carries what to say, never the credential that says it",
  );
});

Deno.test("S6: the flush renders FRESH from the recipe and mints at the send", async () => {
  const { fake, mints } = linkWorld();
  await sendPartySms(
    fake as never,
    { partyId: "p1", templateKey: "field_digest" },
    {
      getEnv: envOf({ SMS_DEV_MODE: "off", TWILIO_FROM_NUMBER: "+15550000000" }),
      now: QUIET,
    },
  );
  const previewBody = String(
    (fake._data.sms_messages ?? [])[0] as Record<string, unknown>,
  );
  assert(previewBody !== "", "deferred row exists");

  let wireBody = "";
  const result = await flushDeferredMessages(fake as never, {
    getEnv: envOf({
      SMS_DEV_MODE: "off",
      TWILIO_FROM_NUMBER: "+15550000000",
      TWILIO_ACCOUNT_SID: "AC",
      TWILIO_AUTH_TOKEN: "tok",
      SMS_CONVERSATION_NUMBER: "+15550000000",
    }),
    fetchImpl: ((_url: string, init: RequestInit) => {
      wireBody = new URLSearchParams(String(init.body)).get("Body") ?? "";
      return Promise.resolve(
        new Response(JSON.stringify({ sid: "SM1", status: "queued" }), {
          status: 201,
        }),
      );
    }) as unknown as typeof fetch,
    now: OPEN,
  });

  assertEquals(result.flushed, 1);
  assertEquals(mints.length, 1, "minted once, at the moment it actually went");
  // What went on the wire is the real thing…
  assert(
    wireBody.includes(`/field/${FIELD_TOKEN}`),
    `the flush must send a live link: ${wireBody}`,
  );
  assert(
    !wireBody.includes("[link at send]"),
    "the stored PREVIEW must never reach the recipient",
  );
  assert(wireBody.includes("Field & Form"), "studio name first (contract S8)");
  assert(
    wireBody.includes("Msg&data rates may apply. Reply HELP for help, STOP to opt out."),
    "every outbound body ends with the compliance line (contract S8)",
  );
  // …and what the thread keeps is not.
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(row.twilio_status, "queued");
  assertEquals(row.twilio_sid, "SM1");
  assert(
    String(row.body).includes("/field/[redacted]"),
    `the stored row is redacted: ${row.body}`,
  );
  assert(!String(row.body).includes(FIELD_TOKEN), "no token at rest");
});

Deno.test("S6: no raw token reaches a log line", async () => {
  const { fake } = linkWorld();
  const lines: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => lines.push(a.map(String).join(" "));
  try {
    await sendPartySms(
      fake as never,
      { partyId: "p1", templateKey: "field_digest" },
      {
        getEnv: envOf({
          SMS_DEV_MODE: "dry_run",
          TWILIO_FROM_NUMBER: "+15550000000",
        }),
        now: OPEN,
      },
    );
  } finally {
    console.log = realLog;
    console.error = realError;
  }
  assert(
    !lines.some((l) => l.includes(FIELD_TOKEN)),
    `a token reached a log line: ${lines.join(" | ")}`,
  );
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assert(!String(row.body).includes(FIELD_TOKEN), "nor the stored row");
});

Deno.test("S5: one logical send — the second writer loses the claim", async () => {
  // createFakeSupabase has no unique indexes and belongs to another ticket this
  // wave, so the claim is enforced here by the same rule 00640's partial index
  // states: (party_id, coalesce(template_key,''), dedupe_key) is unique among
  // outbound rows whose status has not released the claim.
  const released = new Set([
    "failed",
    "undelivered",
    "canceled",
    "expired",
    "suppressed",
  ]);
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  });
  const from = fake.from.bind(fake);
  const claimed = new Proxy(fake, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const builder = from(table);
        if (table !== "sms_messages") return builder;
        const insert = builder.insert.bind(builder);
        // deno-lint-ignore no-explicit-any
        (builder as any).insert = (payload: unknown) => {
          const row = payload as Record<string, unknown>;
          const held = (target._data.sms_messages ?? []).some((r) =>
            r.direction === "outbound" && row.party_id != null &&
            r.party_id === row.party_id &&
            (r.template_key ?? "") === (row.template_key ?? "") &&
            row.dedupe_key != null && r.dedupe_key === row.dedupe_key &&
            !released.has(String(r.twilio_status ?? "claimed"))
          );
          if (!held) return insert(payload);
          const answer = {
            data: null,
            error: {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "sms_messages_send_claim_uniq"',
            },
          };
          // deno-lint-ignore no-explicit-any
          const dup: any = {
            select: () => dup,
            single: () => Promise.resolve(answer),
            maybeSingle: () => Promise.resolve(answer),
            // deno-lint-ignore no-explicit-any
            then: (f: any, r: any) => Promise.resolve(answer).then(f, r),
          };
          return dup;
        };
        return builder;
      };
    },
  });

  const deps = {
    getEnv: envOf({
      SMS_DEV_MODE: "dry_run",
      TWILIO_FROM_NUMBER: "+15550000000",
    }),
    now: OPEN,
  };
  const first = await sendPartySms(
    claimed as never,
    { partyId: "p1", body: "on my way", dedupeKey: "arrival:2026-07-08" },
    deps,
  );
  assert(first.sent, "the first writer sends");

  const second = await sendPartySms(
    claimed as never,
    { partyId: "p1", body: "on my way", dedupeKey: "arrival:2026-07-08" },
    deps,
  );
  assert(!second.sent, "the second writer does not send a second text");
  assertEquals(second.reason, "duplicate_send_claim");
  assertEquals(second.status, "queued", "losing the claim is not an error");
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    1,
    "one logical send, one row",
  );

  // A DIFFERENT logical send is untouched by the claim.
  const other = await sendPartySms(
    claimed as never,
    { partyId: "p1", body: "running late", dedupeKey: "delay:2026-07-08" },
    deps,
  );
  assert(other.sent, "a different send has its own claim");
  assertEquals((fake._data.sms_messages ?? []).length, 2);
});

Deno.test("S5: one word for what happened — sent, queued, failed", async () => {
  const world = () =>
    createFakeSupabase({
      projects: ORG_ALPHA_PROJECTS,
      studio_channel_consent: [grant()],
      project_parties: [party("p1", "granted")],
    });
  const live = {
    SMS_DEV_MODE: "off",
    TWILIO_FROM_NUMBER: "+15550000000",
    TWILIO_ACCOUNT_SID: "AC",
    TWILIO_AUTH_TOKEN: "tok",
  };

  // A dev dry run has no carrier to wait for: it is gone.
  const dry = await sendPartySms(world() as never, {
    partyId: "p1",
    body: "hi",
  }, {
    getEnv: envOf({ ...live, SMS_DEV_MODE: "dry_run" }),
    now: OPEN,
  });
  assertEquals(dry.status, "sent");

  // A provider ACCEPT is 'queued'. It is not delivery and it is never "read".
  const accepted = await sendPartySms(world() as never, {
    partyId: "p1",
    body: "hi",
  }, {
    getEnv: envOf(live),
    fetchImpl: (() =>
      Promise.resolve(
        new Response(JSON.stringify({ sid: "SM9", status: "queued" }), {
          status: 201,
        }),
      )) as unknown as typeof fetch,
    now: OPEN,
  });
  assertEquals(accepted.status, "queued");
  assertEquals(accepted.sent, true, "the booleans keep their old meaning");

  // A provider refusal carries Twilio's own code.
  const failFake = world();
  const refused = await sendPartySms(failFake as never, {
    partyId: "p1",
    body: "hi",
  }, {
    getEnv: envOf(live),
    fetchImpl: (() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: 21610, message: "unsubscribed" }), {
          status: 400,
        }),
      )) as unknown as typeof fetch,
    now: OPEN,
  });
  assertEquals(refused.status, "failed");
  assertEquals(refused.provider_code, "21610");
  const row = (failFake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(row.twilio_status, "failed");
  assertEquals(row.error_code, "21610");
});

Deno.test("S6: a defer that could only store the wrong words refuses instead", async () => {
  // A raw body the audit copy replaces has no recipe to render from, so the
  // flush would put the redacted PREVIEW on the wire at 8am. The caller that
  // owns its own outbox (deferToCaller) is unaffected — it re-sends the real
  // body itself — and that is the path site-request-dispatch uses.
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  });
  const res = await sendPartySms(
    fake as never,
    {
      partyId: "p1",
      body: "Open https://client.patina.cloud/field/sr_SECRET_RAW_TOKEN",
      auditBody: "Patina Site Request private link [redacted]",
    },
    {
      getEnv: envOf({ SMS_DEV_MODE: "off", TWILIO_FROM_NUMBER: "+15550000000" }),
      now: QUIET,
    },
  );
  assert(!res.sent && !res.deferred, "it is refused, not stored");
  assertEquals(res.reason, "defer_requires_recipe");
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    0,
    "and nothing is written that a flush could send",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SQ-37 R1–R5 — what the durable outbox owes a message it has not sent yet.
// Each of these is a reproduced defect: a deferred row two flushes both sent,
// a bearer token that survived in the recipe, a phase gate that stopped
// binding once the row was stored, an accepted send nothing could name, and a
// 202 for a row that was never written.
// ═══════════════════════════════════════════════════════════════════════════

/** A live Twilio configuration, so the provider leg is actually exercised. */
const LIVE_TWILIO = {
  SMS_DEV_MODE: "off",
  TWILIO_FROM_NUMBER: "+15550000000",
  TWILIO_ACCOUNT_SID: "AC",
  TWILIO_AUTH_TOKEN: "tok",
  SMS_CONVERSATION_NUMBER: "+15550000000",
};

/** A 64-hex field token: the shape the portal actually hands out. */
const RAW_BEARER = "a".repeat(64);

function mustNotSend(): typeof fetch {
  return (() =>
    Promise.reject(
      new Error("the provider must not be called"),
    )) as unknown as typeof fetch;
}

/** Defer one digest for `p1`, and hand back the row it wrote. */
async function deferDigest(
  fake: ReturnType<typeof linkWorld>["fake"],
  input: Record<string, unknown> = {},
  envExtra: Record<string, string> = {},
) {
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", templateKey: "field_digest", ...input },
    {
      getEnv: envOf({ ...LIVE_TWILIO, ...envExtra }),
      fetchImpl: mustNotSend(),
      now: QUIET,
    },
  );
  assert(res.deferred, `quiet hours must store it: ${JSON.stringify(res)}`);
  return (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
}

Deno.test("R1: two concurrent flushes of one deferred row make exactly ONE wire call", async () => {
  // The SELECT that opens the flush is not a claim. The field-daily cron and a
  // manual run — or two overlapping ticks — both read the same 'deferred' row,
  // and before this both of them texted the trade.
  const { fake, mints } = linkWorld();
  await deferDigest(fake, { dedupeKey: "digest:2026-07-08" });

  const wires: string[] = [];
  const deps = {
    getEnv: envOf(LIVE_TWILIO),
    fetchImpl: ((_url: string, init: RequestInit) => {
      wires.push(new URLSearchParams(String(init.body)).get("Body") ?? "");
      return Promise.resolve(
        new Response(
          JSON.stringify({ sid: `SM${wires.length}`, status: "queued" }),
          { status: 201 },
        ),
      );
    }) as unknown as typeof fetch,
    now: OPEN,
  };
  const [first, second] = await Promise.all([
    flushDeferredMessages(fake as never, deps),
    flushDeferredMessages(fake as never, deps),
  ]);

  assertEquals(wires.length, 1, "one deferred row must have one provider attempt");
  assertEquals(
    first.flushed + second.flushed,
    1,
    "exactly one flush owns the send",
  );
  assertEquals(mints.length, 1, "and exactly one link is minted for it");
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    1,
    "no second row is written either",
  );
});

Deno.test("R2: a caller's own raw link never survives in the stored recipe", async () => {
  // The recipe is read back by a cron hours later. A `link` var — the caller's
  // or anything else carrying a token — is a bearer credential at rest, which
  // is the whole reason the stored body is a redacted preview.
  const { fake } = linkWorld();
  const row = await deferDigest(fake, {
    vars: { link: `https://client.patina.cloud/field/${RAW_BEARER}`, foo: "bar" },
  });

  const recipeJson = JSON.stringify(row.recipe);
  assert(
    !/[0-9a-f]{64}/.test(recipeJson),
    `a raw token survived in the recipe: ${recipeJson}`,
  );
  assert(
    !recipeJson.includes("/field/"),
    `a field URL survived in the recipe: ${recipeJson}`,
  );
  const recipe = row.recipe as Record<string, unknown>;
  const params = recipe.params as Record<string, unknown>;
  assertEquals(params.link, undefined, "`link` is never a stored param");
  assertEquals(params.foo, "bar", "and the rest of the params are kept");
  assertEquals(
    recipe.link_kind,
    "field",
    "the row still says a link belongs here — the flush mints it fresh",
  );
  assert(
    !/[0-9a-f]{64}/.test(JSON.stringify(fake._data.sms_messages ?? [])),
    "and no token is anywhere on the row",
  );
});

Deno.test("R3: a phase turned off while the row waited stops the flush", async () => {
  // FIELD_LINE_PHASE is a SERVER gate and the server that flushes is not the
  // server that deferred. Turning the phase back down is how this rail is
  // turned off; a row stored while phase 1 was live must not go out from a
  // server that is back at phase 0.
  const { fake, mints } = linkWorld();
  const row = await deferDigest(
    fake,
    { automationPhase: 1 },
    { FIELD_LINE_PHASE: "1" }, // the phase WAS live when the row was stored
  );
  assertEquals(
    (row.recipe as Record<string, unknown>).automation_phase,
    1,
    "the declared phase travels with the row",
  );

  const out = await flushDeferredMessages(fake as never, {
    getEnv: envOf({ ...LIVE_TWILIO, FIELD_LINE_PHASE: "0" }),
    fetchImpl: mustNotSend(),
    now: OPEN,
  });
  assertEquals(out.flushed, 0, "nothing goes out");
  assertEquals(mints.length, 0, "and nothing is minted for it");
  assertEquals(row.twilio_status, "deferred", "the row keeps its place in the queue");
  assertEquals(row.error_message, "field_line_phase_off", "and says why it stayed");

  // The phase comes back up inside the window and the same row goes.
  const resumed = await flushDeferredMessages(fake as never, {
    getEnv: envOf({ ...LIVE_TWILIO, FIELD_LINE_PHASE: "1" }),
    fetchImpl: (() =>
      Promise.resolve(
        new Response(JSON.stringify({ sid: "SM1", status: "queued" }), {
          status: 201,
        }),
      )) as unknown as typeof fetch,
    now: OPEN,
  });
  assertEquals(resumed.flushed, 1);
});

Deno.test("R3: a 'never text' rule written after the defer still stops the send", async () => {
  // The rule the studio entered last night is not answered by a message
  // composed the evening before it.
  const { fake, mints } = linkWorld();
  const row = await deferDigest(fake);
  fake._data.studio_contact_rules = [{
    subject_type: "engagement",
    subject_id: "p1",
    channels_forbidden: ["sms"],
  }];

  const out = await flushDeferredMessages(fake as never, {
    getEnv: envOf(LIVE_TWILIO),
    fetchImpl: mustNotSend(),
    now: OPEN,
  });
  assertEquals(out.flushed, 0);
  assertEquals(out.suppressed, 1);
  assertEquals(mints.length, 0, "a refused send mints nothing");
  assertEquals(row.twilio_status, "suppressed");
  assertEquals(row.error_message, "contact_rule_forbids_sms");
});

Deno.test("R4: an accepted send whose id cannot be recorded FAILS, it never reads queued", async () => {
  // The provider has it. Writing the sid is what makes it findable — the status
  // callback matches on twilio_sid and sms_reconcile_accepted_send() looks it up
  // by twilio_sid — so a row with a NULL sid is a text nobody can settle.
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  });
  let sidWrites = 0;
  const realFrom = fake.from.bind(fake);
  // deno-lint-ignore no-explicit-any
  (fake as any).from = (table: string) => {
    const builder = realFrom(table);
    if (table !== "sms_messages") return builder;
    const update = builder.update.bind(builder);
    // deno-lint-ignore no-explicit-any
    (builder as any).update = (payload: any) => {
      if (payload && payload.twilio_sid) {
        sidWrites++;
        // deno-lint-ignore no-explicit-any
        const failed: any = {
          eq: () => failed,
          in: () => failed,
          select: () => failed,
          // deno-lint-ignore no-explicit-any
          then: (f: any, r: any) =>
            Promise.resolve({
              data: null,
              error: { code: "08006", message: "connection failure" },
            }).then(f, r),
        };
        return failed;
      }
      return update(payload);
    };
    return builder;
  };

  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "on my way", dedupeKey: "arrival:1" },
    {
      getEnv: envOf(LIVE_TWILIO),
      fetchImpl: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ sid: "SM9", status: "queued" }), {
            status: 201,
          }),
        )) as unknown as typeof fetch,
      now: OPEN,
    },
  );

  assertEquals(sidWrites, 2, "written once, retried once");
  assertEquals(res.sent, false);
  assertEquals(res.status, "failed");
  assertEquals(res.reason, "sid_unrecorded");
  assertEquals(res.twilioSid, "SM9", "the caller is told which message it was");
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(
    row.twilio_status,
    "claimed",
    "a failed sid write must not advance the durable claim to queued",
  );
  assertEquals(row.needs_review, true, "it is put in front of a human");
  assertEquals(row.error_code, "sid_unrecorded");
});

Deno.test("R4: a delivery callback that lands mid-flight is never walked back", async () => {
  // Twilio accepted it and the status callback beat our own settle. 'delivered'
  // is newer than 'queued' and the acceptance must not overwrite it.
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  });
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", body: "on my way" },
    {
      getEnv: envOf(LIVE_TWILIO),
      fetchImpl: (() => {
        const row = (fake._data.sms_messages ?? [])[0] as
          | Record<string, unknown>
          | undefined;
        if (row) row.twilio_status = "delivered";
        return Promise.resolve(
          new Response(JSON.stringify({ sid: "SM9", status: "queued" }), {
            status: 201,
          }),
        );
      }) as unknown as typeof fetch,
      now: OPEN,
    },
  );
  assertEquals(res.status, "queued", "the provider said it accepted it");
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(
    row.twilio_status,
    "delivered",
    "and the row keeps the newer delivery the callback recorded",
  );
  assertEquals(row.twilio_sid, "SM9", "the provider id still lands");
});

Deno.test("R5: a deferred row that did not write is not reported as deferred", async () => {
  // 'deferred' is a promise that a row exists and a later flush will read it.
  // Answering it for a row that was never written is a text the caller believes
  // is coming and nothing will ever send.
  const { fake } = linkWorld();
  const realFrom = fake.from.bind(fake);
  const answer = {
    data: null,
    error: { code: "08006", message: "connection failure" },
  };
  // deno-lint-ignore no-explicit-any
  (fake as any).from = (table: string) => {
    const builder = realFrom(table);
    if (table !== "sms_messages") return builder;
    // deno-lint-ignore no-explicit-any
    (builder as any).insert = () => {
      // deno-lint-ignore no-explicit-any
      const failed: any = {
        select: () => failed,
        single: () => Promise.resolve(answer),
        maybeSingle: () => Promise.resolve(answer),
        // deno-lint-ignore no-explicit-any
        then: (f: any, r: any) => Promise.resolve(answer).then(f, r),
      };
      return failed;
    };
    return builder;
  };

  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", templateKey: "field_digest" },
    { getEnv: envOf(LIVE_TWILIO), fetchImpl: mustNotSend(), now: QUIET },
  );
  assertEquals(res.deferred, false);
  assertEquals(res.status, "failed");
  assertEquals(res.reason, "defer_failed");
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    0,
    "and there is no row for a flush to find",
  );
});

// ── SQ-43 R1: a claim nobody comes back for ─────────────────────────────────
/** A flush's deps with a recording wire. */
function wireDeps(wires: string[], now: Date) {
  return {
    getEnv: envOf(LIVE_TWILIO),
    fetchImpl: ((_url: string, init: RequestInit) => {
      wires.push(new URLSearchParams(String(init.body)).get("Body") ?? "");
      return Promise.resolve(
        new Response(
          JSON.stringify({ sid: `SM${wires.length}`, status: "queued" }),
          { status: 201 },
        ),
      );
    }) as unknown as typeof fetch,
    now,
  };
}

Deno.test("R1: a crash before the provider call hands the claim back, and the text still goes — once", async () => {
  // The claim is taken before anything irreversible, which is right; what was
  // missing is the other half. A worker that died between taking it and
  // reaching the provider left the row reading 'claimed' with no provider id,
  // and the flush's own SELECT — 'deferred' only — never looked at it again.
  // The text was never sent and nothing in the rail said so.
  const { fake, mints } = linkWorld();
  await deferDigest(fake, { dedupeKey: "digest:2026-07-08" });

  const realRpc = fake.rpc.bind(fake);
  let crash = true;
  // deno-lint-ignore no-explicit-any
  (fake as any).rpc = (name: string, args: Record<string, unknown>) => {
    if (name === "create_field_link" && crash) {
      crash = false;
      throw new Error("synthetic pre-wire termination");
    }
    return realRpc(name, args);
  };

  const wires: string[] = [];
  const first = await flushDeferredMessages(
    fake as never,
    wireDeps(wires, OPEN),
  );
  assertEquals(wires.length, 0, "nothing reached the provider");
  assertEquals(first.flushed, 0);

  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(
    row.twilio_status,
    "deferred",
    "the abandoned claim is handed back, not held for good",
  );
  assertEquals(row.claimed_at, null, "and the claim stamp is cleared with it");
  assert(
    String(row.error_message).startsWith("claim_released:"),
    `the row says why it was released: ${row.error_message}`,
  );

  const second = await flushDeferredMessages(
    fake as never,
    wireDeps(wires, new Date(OPEN.getTime() + 16 * 60 * 1000)),
  );
  assertEquals(second.flushed, 1, "the next flush sends what was never sent");
  assertEquals(wires.length, 1, "exactly one provider call, in total");
  assertEquals(mints.length, 1, "and exactly one link minted for it");
  assertEquals((fake._data.sms_messages ?? []).length, 1);
  assertEquals(row.twilio_status, "queued");
});

Deno.test("R1: a claim abandoned with no release at all comes back after the TTL — and a live one is left alone", async () => {
  // The release above is best effort: a process killed outright writes nothing.
  // So the flush also takes back a claim that has simply timed out. The line is
  // the claim TTL, and it matters in both directions — a claim taken a minute
  // ago belongs to a sender that is still working, and taking it would be the
  // duplicate text the claim exists to prevent.
  const { fake } = linkWorld();
  await deferDigest(fake, { dedupeKey: "digest:2026-07-08" });
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;

  row.twilio_status = "claimed";
  row.claimed_at = new Date(OPEN.getTime() - 5 * 60 * 1000).toISOString();
  const wires: string[] = [];
  const fresh = await flushDeferredMessages(
    fake as never,
    wireDeps(wires, OPEN),
  );
  assertEquals(fresh.flushed, 0);
  assertEquals(wires.length, 0, "a five-minute-old claim is somebody's send");
  assertEquals(row.twilio_status, "claimed");

  row.claimed_at = new Date(OPEN.getTime() - 20 * 60 * 1000).toISOString();
  const stale = await flushDeferredMessages(
    fake as never,
    wireDeps(wires, OPEN),
  );
  assertEquals(stale.flushed, 1, "a twenty-minute-old claim is abandoned");
  assertEquals(wires.length, 1);
  assertEquals(row.twilio_status, "queued");
});

Deno.test("R1: two flushes racing over one abandoned claim still make ONE wire call", async () => {
  // Re-claiming is the same conditional update the first claim is, filtered on
  // the stale stamp that was read: of two flushes that both see one timed-out
  // claim, exactly one takes it.
  const { fake, mints } = linkWorld();
  await deferDigest(fake, { dedupeKey: "digest:2026-07-08" });
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  row.twilio_status = "claimed";
  row.claimed_at = new Date(OPEN.getTime() - 20 * 60 * 1000).toISOString();

  const wires: string[] = [];
  const deps = wireDeps(wires, OPEN);
  const [a, b] = await Promise.all([
    flushDeferredMessages(fake as never, deps),
    flushDeferredMessages(fake as never, deps),
  ]);
  assertEquals(wires.length, 1, "one abandoned row, one provider attempt");
  assertEquals(a.flushed + b.flushed, 1, "exactly one flush owns the resume");
  assertEquals(mints.length, 1);
});

Deno.test("R1: an abandoned claim with nothing to render from is never re-sent from its stored words", async () => {
  // A row with no recipe can only be re-sent verbatim, and a stored body is
  // trustworthy AS a body only where the defer path vetted it as one. A claim
  // sendPartySms took stores the caller's AUDIT copy — the redacted preview
  // that must never reach a recipient (contract S6, evidence case 12). Those
  // are left for the sweep to fail honestly, not guessed at here.
  const { fake } = linkWorld();
  const sentWires: string[] = [];
  await sendPartySms(
    fake as never,
    {
      partyId: "p1",
      body: "Open the private link we sent you.",
      auditBody: "Patina Site Request private link [redacted]",
    },
    wireDeps(sentWires, OPEN),
  );
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(row.recipe, null, "a literal body stores no recipe");
  assertEquals(row.body, "Patina Site Request private link [redacted]");
  // …and now that send is the one that died: its claim stands, unreported.
  row.twilio_status = "claimed";
  row.twilio_sid = null;
  row.claimed_at = new Date(OPEN.getTime() - 20 * 60 * 1000).toISOString();

  const wires: string[] = [];
  const res = await flushDeferredMessages(fake as never, wireDeps(wires, OPEN));
  assertEquals(wires.length, 0, "the audit copy never reaches the wire");
  assertEquals(res.flushed, 0);
  assertEquals(row.twilio_status, "claimed");
});

// ── SQ-43 R2: the credential with no URL around it ──────────────────────────
Deno.test("R2: a caller's audit copy never persists a bare bearer token", async () => {
  // The redaction watched one door — `/field/<token>` — and the token walks
  // through the other one on its own. A caller that names it ("Token: <hex>")
  // wrote a live bearer credential into sms_messages.body, the table 00283
  // exists to keep tokens out of.
  const { fake } = linkWorld();
  const row = await deferDigest(fake, {
    auditBody: `Token: ${RAW_BEARER}`,
    vars: { link: `https://client.patina.cloud/field/${RAW_BEARER}` },
  });
  assertEquals(row.body, "Token: [redacted]");
  const stored = JSON.stringify(fake._data.sms_messages ?? []);
  assert(
    !/[0-9a-f]{64}/i.test(stored),
    `no 64-hex run survives anywhere on the row: ${stored}`,
  );
  assert(!stored.includes("/field/"), `and no field URL either: ${stored}`);
});

Deno.test("R2: an audit copy naming the field URL is still redacted", async () => {
  const { fake } = linkWorld();
  const row = await deferDigest(fake, {
    auditBody: `Open https://client.patina.cloud/field/${RAW_BEARER}`,
  });
  assertEquals(row.body, "Open https://client.patina.cloud/field/[redacted]");
  assert(
    !JSON.stringify(fake._data.sms_messages ?? []).includes(RAW_BEARER),
    "the token is gone from the row",
  );
});

Deno.test("R2: delimiter-bounded bearer tokens never persist in audit copy", async () => {
  const auditBodies = [
    `_${RAW_BEARER}_`,
    `${RAW_BEARER}?x=1`,
    `(${RAW_BEARER})`,
    `Token:\n${RAW_BEARER}`,
  ];
  const wireText = `Open https://client.patina.cloud/field/${RAW_BEARER}`;

  for (const auditBody of auditBodies) {
    const { fake: deferredFake } = linkWorld();
    const deferredRow = await deferDigest(deferredFake, {
      auditBody,
      vars: { link: `https://client.patina.cloud/field/${RAW_BEARER}` },
    });
    const deferredStored = String(deferredRow.body ?? "");
    const deferredAuditLog = JSON.stringify(deferredFake._data.sms_messages ?? []);
    for (const text of [deferredStored, deferredAuditLog]) {
      assert(!/[0-9a-f]{64}/i.test(text), `no bearer token persists: ${text}`);
      assert(!text.includes("/field/"), `no field URL persists: ${text}`);
    }

    const { fake } = linkWorld();
    const wires: string[] = [];
    const row = await sendPartySms(
      fake as never,
      { partyId: "p1", body: wireText, auditBody },
      wireDeps(wires, OPEN),
    );
    assert(row.sent);
    assertEquals(wires, [wireText], "the live wire body stays unchanged");
    const storedBody = String((fake._data.sms_messages ?? [])[0]?.body ?? "");
    const auditLogText = JSON.stringify(fake._data.sms_messages ?? []);
    for (const text of [storedBody, auditLogText]) {
      assert(!/[0-9a-f]{64}/i.test(text), `no bearer token persists: ${text}`);
      assert(!text.includes("/field/"), `no field URL persists: ${text}`);
    }
  }
});

// ── The trade rail's pacing: GATE 4 (dead end) and GATE 5 (budget) ──────────

/** Every cadence/dead-end question this send asked, in order. */
function pacedWorld(
  answers: {
    budget?: Array<Record<string, unknown> | null>;
    gate?: Array<Record<string, unknown> | null>;
    budgetError?: unknown;
  } = {},
) {
  const asked: Array<{ rpc: string; args: Record<string, unknown> }> = [];
  const budget = [...(answers.budget ?? [])];
  const gate = [...(answers.gate ?? [])];
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
  }, {
    sms_claim_party_budget: (args: Record<string, unknown>) => {
      asked.push({ rpc: "sms_claim_party_budget", args });
      return {
        data: budget.length ? budget.shift() ?? null : { claimed: true },
        error: answers.budgetError ?? null,
      };
    },
    sms_party_prompt_gate: (args: Record<string, unknown>) => {
      asked.push({ rpc: "sms_party_prompt_gate", args });
      return {
        data: gate.length ? gate.shift() ?? null : { allowed: true },
        error: null,
      };
    },
  });
  return { fake, asked };
}

const PACED_ENV = {
  SMS_DEV_MODE: "dry_run",
  TWILIO_FROM_NUMBER: "+15550000000",
  SMS_CONVERSATION_NUMBER: "+15550000000",
  FIELD_LINE_PHASE: "1",
};

/** A paced phase-1 event text for `p1`. */
function pacedSend(
  fake: ReturnType<typeof pacedWorld>["fake"],
  now: Date,
  input: Record<string, unknown> = {},
) {
  return sendPartySms(
    fake as never,
    {
      partyId: "p1",
      body: "Studio A at the job site today.",
      automationPhase: 1,
      cadenceClass: "event",
      ...input,
    } as never,
    { getEnv: envOf(PACED_ENV), now, fetchImpl: mustNotSend() },
  );
}

Deno.test("P5: the day the counters reset is the ZONE's day, never UTC's", () => {
  // The cadence is "so many texts a DAY", and a day in America/Chicago is 23 or
  // 25 hours long twice a year. Read with a fixed offset, the fall-back night
  // hands a party a free extra text and the spring-forward night eats one.
  const TZ = "America/Chicago";

  // Fall back: 2:00 CDT becomes 1:00 CST on 2026-11-01. The local hour 1:30
  // happens TWICE, and both times it is still the same local day.
  assertEquals(localDayInTimezone(new Date("2026-11-01T05:30:00Z"), TZ), "2026-11-01");
  assertEquals(localMinutesInTimezone(new Date("2026-11-01T06:30:00Z"), TZ), 90);
  assertEquals(localDayInTimezone(new Date("2026-11-01T06:30:00Z"), TZ), "2026-11-01");
  assertEquals(localMinutesInTimezone(new Date("2026-11-01T07:30:00Z"), TZ), 90);
  assertEquals(localDayInTimezone(new Date("2026-11-01T07:30:00Z"), TZ), "2026-11-01");

  // And the reason a fixed offset cannot be used: 24 hours after 00:30 local on
  // the fall-back day is 23:30 local ON THE SAME DAY. A "+1 day" that adds
  // 86,400,000 ms would have reset this party's counters a day early.
  assertEquals(localDayInTimezone(new Date("2026-11-02T05:30:00Z"), TZ), "2026-11-01");
  assertEquals(localDayInTimezone(new Date("2026-11-02T06:30:00Z"), TZ), "2026-11-02");

  // Spring forward: 2:00 CST becomes 3:00 CDT on 2026-03-08. 23:30 the evening
  // before is still the 7th, and the local clock skips 02:00–02:59 entirely.
  assertEquals(localDayInTimezone(new Date("2026-03-08T05:30:00Z"), TZ), "2026-03-07");
  assertEquals(localMinutesInTimezone(new Date("2026-03-08T05:30:00Z"), TZ), 23 * 60 + 30);
  assertEquals(localDayInTimezone(new Date("2026-03-08T08:30:00Z"), TZ), "2026-03-08");
  assertEquals(localMinutesInTimezone(new Date("2026-03-08T08:30:00Z"), TZ), 3 * 60 + 30);
});

Deno.test("GATE 5: an over-budget event text is FOLDED into the next digest", async () => {
  // Not dropped and not refused: stored, with the reason on the row, due after
  // the local day turns over — which is when the party's counters reset and the
  // flush can spend the slot (contract P5/S5).
  const { fake, asked } = pacedWorld({
    budget: [{ claimed: false, reason: "budget", local_day: "2026-07-08" }],
  });
  const res = await pacedSend(fake, OPEN, { dedupeKey: "card:2026-07-08" });

  assert(!res.sent, "an over-budget text does not go out now");
  assertEquals(res.status, "deferred");
  assertEquals(res.reason, "budget");
  assertEquals(
    asked.map((a) => a.rpc),
    ["sms_party_prompt_gate", "sms_claim_party_budget"],
    "the dead-end gate is asked before a slot is spent",
  );
  const claim = asked[1].args;
  assertEquals(claim.p_local_day, "2026-07-08", "the CALLER's local day");
  assertEquals(claim.p_class, "event");
  assertEquals(claim.p_party_id, "p1");
  assertEquals(claim.p_project_id, "proj1");

  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(row.twilio_status, "deferred");
  assertEquals(row.error_message, "budget", "the row says why it waited");
  assertEquals(
    (row.recipe as { cadence_class?: string }).cadence_class,
    "event",
    "the flush needs the class to re-ask the budget",
  );
  // Tomorrow, in the named zone's send window: this hour tomorrow is already
  // inside it, so that is the moment it becomes eligible.
  assertEquals(String(res.dueAt).slice(0, 10), "2026-07-09");
  assertEquals(
    localMinutesInTimezone(new Date(String(res.dueAt)), "America/Chicago"),
    13 * 60,
  );
});

Deno.test("GATE 5: an unreadable budget SENDS — pacing is politeness, not consent", async () => {
  // A server one migration behind answers `null`; an unreachable one answers an
  // error. Either way the crew gets the text: suppression and consent are the
  // gates that mean "not allowed", and they were asked above this one.
  for (
    const answers of [
      { budget: [null] },
      { budget: [null], budgetError: { message: "function does not exist" } },
      { budget: [{ claimed: "no" } as unknown as Record<string, unknown>] },
    ]
  ) {
    const { fake, asked } = pacedWorld(answers);
    const res = await pacedSend(fake, OPEN);
    assert(res.sent, `an unanswerable budget must not silence the rail: ${JSON.stringify(answers)}`);
    assertEquals(asked.filter((a) => a.rpc === "sms_claim_party_budget").length, 1);
  }
});

Deno.test("GATE 4: a dead end pauses the rail and is handed off ONCE", async () => {
  // 00645 does the counting and the compare-and-set; what this asserts is that
  // the sender obeys both answers and writes NO ROW for either — a dead end is
  // not a message waiting to be sent, it is a phone call somebody has to make.
  const { fake, asked } = pacedWorld({
    gate: [
      {
        allowed: false,
        reason: "dead_end",
        handoff: true,
        unanswered: 2,
        paused_until: "2026-07-09T18:00:00.000Z",
        owner_user_id: "u-designer",
      },
      {
        allowed: false,
        reason: "paused",
        paused_until: "2026-07-09T18:00:00.000Z",
        owner_user_id: "u-designer",
      },
    ],
  });

  const second = await pacedSend(fake, OPEN, { dedupeKey: "ask-2" });
  assert(!second.sent);
  assertEquals(second.reason, "dead_end");
  assertEquals(second.dueAt, "2026-07-09T18:00:00.000Z", "the caller learns when the pause lifts");

  const third = await pacedSend(fake, OPEN, { dedupeKey: "ask-3" });
  assert(!third.sent);
  assertEquals(
    third.reason,
    "prompts_paused",
    "the pause the handoff wrote is what refuses every ask after it",
  );

  assertEquals(
    asked.filter((a) => a.rpc === "sms_claim_party_budget").length,
    0,
    "a refused ask never spends a slot",
  );
  assertEquals((fake._data.sms_messages ?? []).length, 0, "and stores nothing");
});

Deno.test("GATES 4+5: a send that declared no cadence class asks neither", async () => {
  // Receipts, invites, selection questions and every phase-0 automation are not
  // the trade rail's paced prompts. They were never gated before and are not now.
  const { fake, asked } = pacedWorld();
  const plain = await pacedSend(fake, OPEN, { cadenceClass: undefined });
  assert(plain.sent);

  const phaseZero = await pacedSend(fake, OPEN, {
    automationPhase: undefined,
    dedupeKey: "legacy",
  });
  assert(phaseZero.sent, "a phase-0 send is untouched");
  assertEquals(asked, [], "no cadence class, no questions");
});

Deno.test("GATE 5: the flush spends the slot, and hands the row back when it cannot", async () => {
  // Quiet hours stored this last night WITHOUT spending anything. The slot is
  // spent at dispatch, so the flush asks — and if the party is over budget
  // again this morning, the row goes back exactly as it came, still waiting.
  const asked: Array<Record<string, unknown>> = [];
  let claimed = false;
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
    email_templates: [{
      slug: "field_card",
      is_active: true,
      html_content:
        "{{studio_name}} at the job site today. " +
        "Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
    }],
  }, {
    sms_claim_party_budget: (args: Record<string, unknown>) => {
      asked.push(args);
      const answer = claimed ? { claimed: true } : { claimed: false, reason: "budget" };
      claimed = true;
      return { data: answer, error: null };
    },
  });

  const deferred = await sendPartySms(
    fake as never,
    {
      partyId: "p1",
      templateKey: "field_card",
      dedupeKey: "card:quiet",
      automationPhase: 1,
      cadenceClass: "event",
    } as never,
    { getEnv: envOf({ ...LIVE_TWILIO, FIELD_LINE_PHASE: "1" }), fetchImpl: mustNotSend(), now: QUIET },
  );
  assert(deferred.deferred, `quiet hours stores it: ${JSON.stringify(deferred)}`);
  assertEquals(asked.length, 0, "quiet hours spends NOTHING — the flush will");
  assertEquals(
    (fake._data.sms_messages ?? [])[0].error_message,
    null,
    "a row that waited for the morning carries no fold reason",
  );

  // First flush: the budget says no. The row is handed back, not failed.
  const wires: string[] = [];
  const openDeps = {
    ...wireDeps(wires, OPEN),
    getEnv: envOf({ ...LIVE_TWILIO, FIELD_LINE_PHASE: "1" }),
  };
  const refused = await flushDeferredMessages(fake as never, openDeps);
  assertEquals(refused.flushed, 0);
  assertEquals(wires.length, 0, "no wire call for a folded row");
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(row.twilio_status, "deferred", "still waiting");
  assertEquals(row.claimed_at, null, "and claimed by nobody");
  assertEquals(row.error_message, "budget");
  assertEquals(asked.length, 1, "the slot is asked for at DISPATCH");
  assertEquals(asked[0].p_local_day, "2026-07-08");
  assertEquals(asked[0].p_class, "event");

  // Second flush: the counters have room, so it goes — once.
  const sent = await flushDeferredMessages(fake as never, openDeps);
  assertEquals(sent.flushed, 1);
  assertEquals(wires.length, 1);
  assertEquals((fake._data.sms_messages ?? [])[0].twilio_status, "queued");
});

Deno.test("GATE 4: the flush re-asks the dead end — yesterday's fold never walks through today's pause", async () => {
  // A fold's whole point is that the text arrives TOMORROW, and the server that
  // flushes is not the run that deferred. By tomorrow the party may have gone
  // quiet on two prompts, had the thread handed to the project lead and had
  // prompts PAUSED. Re-asking the phase and the budget but not the dead end let
  // the fold out through the pause the handoff exists to enforce (SQ-95, LOW).
  const asked: Array<{ rpc: string; args: Record<string, unknown> }> = [];
  const gate: Array<Record<string, unknown>> = [
    // Day D, at the send: the party is answering fine, so the text only folds
    // because the budget is spent.
    { allowed: true },
    // Day D+1, at the flush: two asks went unanswered, and the pause the handoff
    // wrote is standing.
    {
      allowed: false,
      reason: "paused",
      paused_until: "2026-07-10T18:00:00.000Z",
      owner_user_id: "u-designer",
    },
  ];
  const budget: Array<Record<string, unknown>> = [{ claimed: false, reason: "budget" }];
  const fake = createFakeSupabase({
    projects: ORG_ALPHA_PROJECTS,
    studio_channel_consent: [grant()],
    project_parties: [party("p1", "granted")],
    email_templates: [{
      slug: "field_card",
      is_active: true,
      html_content: "{{studio_name}} at the job site today. " +
        "Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
    }],
  }, {
    sms_party_prompt_gate: (args: Record<string, unknown>) => {
      asked.push({ rpc: "sms_party_prompt_gate", args });
      return { data: gate.shift() ?? { allowed: true }, error: null };
    },
    sms_claim_party_budget: (args: Record<string, unknown>) => {
      asked.push({ rpc: "sms_claim_party_budget", args });
      return { data: budget.shift() ?? { claimed: true }, error: null };
    },
  });

  const folded = await sendPartySms(
    fake as never,
    {
      partyId: "p1",
      templateKey: "field_card",
      dedupeKey: "card:2026-07-08",
      automationPhase: 1,
      cadenceClass: "event",
    } as never,
    { getEnv: envOf({ ...LIVE_TWILIO, FIELD_LINE_PHASE: "1" }), fetchImpl: mustNotSend(), now: OPEN },
  );
  assertEquals(folded.status, "deferred");
  assertEquals(folded.reason, "budget", "day D: over budget, so it waits for the digest");

  // Tomorrow, ~noon Chicago: a new local day, inside the 24h TTL, and the budget
  // WOULD now say yes. The dead-end gate is therefore the only thing that can
  // stop this row — if the flush does not ask it, the text goes out.
  const wires: string[] = [];
  const nextDay = {
    ...wireDeps(wires, new Date("2026-07-09T17:00:00Z")),
    getEnv: envOf({ ...LIVE_TWILIO, FIELD_LINE_PHASE: "1" }),
  };
  const held = await flushDeferredMessages(fake as never, nextDay);

  assertEquals(held.flushed, 0, "the pause holds the fold");
  assertEquals(wires.length, 0, "and nothing reached the provider");
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(row.twilio_status, "deferred", "still waiting, not failed");
  assertEquals(row.claimed_at, null, "and a refused gate never cost the row its claim");
  assertEquals(row.error_message, "prompts_paused", "the row says which gate held it");
  assertEquals(
    asked.map((a) => a.rpc),
    ["sms_party_prompt_gate", "sms_claim_party_budget", "sms_party_prompt_gate"],
    "the flush asked the dead-end gate, once, and never reached the budget",
  );
  const flushAsk = asked[2].args;
  assertEquals(flushAsk.p_party_id, "p1");
  assertEquals(flushAsk.p_project_id, "proj1");
  assertEquals(flushAsk.p_conversation_id, row.conversation_id, "about THIS thread");

  // A hold, not a drop: when the pause lifts, the same row goes out — once.
  const released = await flushDeferredMessages(fake as never, nextDay);
  assertEquals(released.flushed, 1, "the fold was kept, not thrown away");
  assertEquals(wires.length, 1);
  assertEquals((fake._data.sms_messages ?? [])[0].twilio_status, "queued");
  assertEquals(
    asked.filter((a) => a.rpc === "sms_claim_party_budget").length,
    2,
    "and a slot is spent only by the attempt that got past the gate",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// The homeowner's rail (US-3 P24)
// ═══════════════════════════════════════════════════════════════════════════
// Three gates no other send meets, asked in this order and all fail-closed:
// phase 2, FIELD_LINE_CAMPAIGN_APPROVED=1, and her consent record. On top of
// those she pays the same pace the trade pays, and her link is a client
// capability rather than a /field/ token.

/** The kickoff box, as record_channel_invite actually writes it (SQ-16 case 8):
 *  status 'pending', with HOW she said yes and WHO wrote it down. */
const KICKOFF_RECORD = {
  organization_id: "org-alpha",
  channel_kind: "sms",
  channel_value: "+15551230001",
  status: "pending",
  source: "kickoff_checkbox",
  evidence: "Kickoff consent box ticked in Patina, 19 September 2026.",
  recorded_at: "2026-09-19T15:00:00Z",
  recorded_by: "member-1",
  disclosure_version: "field-sms-v1",
};

const CLIENT_TOKEN = "c".repeat(64);

function clientSeat(overrides: Record<string, unknown> = {}) {
  return {
    id: "cp1",
    phone_e164: "+15551230001",
    project_id: "proj1",
    display_name: "Adaeze Okonkwo",
    party_kind: "client",
    ...overrides,
  };
}

/** The homeowner's world: her seat, her letter, the three client templates. */
function clientWorld(
  opts: {
    consent?: Record<string, unknown> | null;
    mintFails?: boolean;
    seat?: Record<string, unknown>;
    extra?: Record<string, unknown[]>;
  } = {},
) {
  const mints: Array<Record<string, unknown>> = [];
  const asked: Array<{ rpc: string; args: Record<string, unknown> }> = [];
  const consent = opts.consent === undefined ? KICKOFF_RECORD : opts.consent;
  const fake = createFakeSupabase({
    projects: [{
      id: "proj1",
      studio_id: "org-alpha",
      designer_id: "u-designer",
      name: "Okonkwo",
    }],
    organizations: [{ id: "org-alpha", name: "Field & Form", type: "design_studio" }],
    organization_members: [{
      organization_id: "org-alpha",
      user_id: "u-designer",
      status: "active",
    }],
    studio_channel_consent: consent ? [consent] : [],
    project_parties: [clientSeat(opts.seat)],
    client_invitations: [{
      id: "inv-1",
      project_id: "proj1",
      phone: "+15551230001",
      designer_client_id: "dc-1",
      revoked_at: null,
      superseded_by: null,
      sent_at: "2026-09-19T15:00:00Z",
    }],
    email_templates: [
      {
        slug: "sms_client_first_letter",
        is_active: true,
        html_content:
          "{{studio_name}} wrote you a letter about {{project_name}}. " +
          "Read it here: {{link}} Msg&data rates may apply. " +
          "Reply HELP for help, STOP to stop.",
      },
      {
        slug: "sms_selection_ready",
        is_active: true,
        html_content:
          "{{studio_name}} has {{picks}} ready for {{room}}. " +
          "Reply YES {{ref}} or open {{link}} Msg&data rates may apply. " +
          "Reply HELP for help, STOP to stop.",
      },
      {
        slug: "sms_inbound_reply",
        is_active: true,
        html_content:
          "{{studio_name}}: {{message}} Msg&data rates may apply. " +
          "Reply HELP for help, STOP to stop.",
      },
    ],
    ...(opts.extra as Record<string, Array<Record<string, unknown>>> ?? {}),
  }, {
    create_client_link: (args) => {
      mints.push(args);
      return opts.mintFails
        ? { data: null, error: { message: "no_live_letter" } }
        : { data: [{ id: "cl-1", token: CLIENT_TOKEN }], error: null };
    },
    sms_claim_party_budget: (args) => {
      asked.push({ rpc: "sms_claim_party_budget", args });
      return { data: { claimed: true }, error: null };
    },
    sms_party_prompt_gate: (args) => {
      asked.push({ rpc: "sms_party_prompt_gate", args });
      return { data: { allowed: true }, error: null };
    },
  });
  return { fake, mints, asked };
}

const CLIENT_ENV = {
  SMS_DEV_MODE: "dry_run",
  TWILIO_FROM_NUMBER: "+15550000000",
  SMS_CONVERSATION_NUMBER: "+15550000000",
  FIELD_LINE_PHASE: "2",
  FIELD_LINE_CAMPAIGN_APPROVED: "1",
};

function firstLetter(
  fake: ReturnType<typeof clientWorld>["fake"],
  env: Record<string, string> = {},
  now: Date = OPEN,
) {
  return sendClientSms(
    fake as never,
    {
      partyId: "cp1",
      projectId: "proj1",
      templateKey: "sms_client_first_letter",
      clientInvitationId: "inv-1",
      dedupeKey: "client_first_letter:inv-1",
    },
    { getEnv: envOf({ ...CLIENT_ENV, ...env }), now, fetchImpl: mustNotSend() },
  );
}

Deno.test("the client templates and capability actions cannot drift", () => {
  // The three slugs are the three the migration seeds, and the actions are the
  // ones create_client_link is asked for. A capability is hash-at-rest: a scope
  // minted without an action can never be widened, only re-minted — which
  // invalidates the link already in her phone. So the two lists are asserted
  // equal to their own sources rather than trusted to stay in step.
  assertEquals([...CLIENT_SMS_TEMPLATES], [
    "sms_client_first_letter",
    "sms_selection_ready",
    "sms_window_pick",
  ]);
  assertEquals([...CLIENT_CAPABILITY_ACTIONS], [...CLIENT_LINK_ACTIONS]);
  assert(isClientSmsTemplate("sms_window_pick"));
  assert(!isClientSmsTemplate("sms_daily_digest"));
  assert(!isClientSmsTemplate(null));
});

Deno.test("sendClientSms refuses to carry anything but the client copy", async () => {
  const { fake } = clientWorld();
  const res = await sendClientSms(
    fake as never,
    { partyId: "cp1", templateKey: "sms_daily_digest" },
    { getEnv: envOf(CLIENT_ENV), now: OPEN, fetchImpl: mustNotSend() },
  );
  assert(!res.sent);
  assertEquals(res.reason, "not_a_client_template");
  assertEquals((fake._data.sms_messages ?? []).length, 0, "and nothing is written");
});

Deno.test("GATE 3b: the campaign flag is the switch that stops her rail", async () => {
  // Turning FIELD_LINE_CAMPAIGN_APPROVED off is how a studio, or we, stop every
  // homeowner text — mid-flight, without a deploy. Unset is off.
  for (const flag of [undefined, "0", "true", "yes"]) {
    const { fake, mints } = clientWorld();
    const res = await firstLetter(
      fake,
      flag === undefined
        ? { FIELD_LINE_CAMPAIGN_APPROVED: "" }
        : { FIELD_LINE_CAMPAIGN_APPROVED: flag },
    );
    assert(!res.sent, `the flag at "${flag}" must not send`);
    assertEquals(res.reason, "campaign_not_approved");
    assertEquals((fake._data.sms_messages ?? []).length, 0, "no row");
    assertEquals(mints.length, 0, "and no capability is minted for it");
  }
  const { fake } = clientWorld();
  assertEquals((await firstLetter(fake)).sent, true, "and 1 is the only yes");
});

Deno.test("GATE 3b: phase 2 is the client rail's own phase", async () => {
  for (const phase of ["", "0", "1"]) {
    const { fake } = clientWorld();
    const res = await firstLetter(fake, { FIELD_LINE_PHASE: phase });
    assert(!res.sent, `phase "${phase}" must not send a client text`);
    assertEquals(res.reason, "field_line_phase_off");
  }
});

Deno.test("GATE 2: the kickoff record carries the letter, and nothing else does", async () => {
  // record_channel_invite writes 'pending', so a client gate that demanded
  // 'allow' could never send a single text (SQ-16 SQL case 8b). The permission
  // is the invite's, and just as narrow: the studio's OWN record, pending
  // rather than refused, carrying the written act.
  const granted = clientWorld({
    consent: { ...KICKOFF_RECORD, status: "granted" },
  });
  assertEquals((await firstLetter(granted.fake)).sent, true, "a grant sends");

  const pending = clientWorld();
  assertEquals((await firstLetter(pending.fake)).sent, true, "so does the tick");

  const unsigned = clientWorld({
    consent: { ...KICKOFF_RECORD, source: null, recorded_by: null },
  });
  const unsignedRes = await firstLetter(unsigned.fake);
  assert(!unsignedRes.sent, "a tick nobody signed is not a tick");
  assertEquals(unsignedRes.reason, "consent_evidence_required");

  // A studio with a seat on the number and NO record for it is a refusal, not
  // an unknown: R-AW's `not_asked` reads as refuse, so the letter is stopped
  // one gate earlier than the evidence check and says so in the same word a
  // STOP does. Either way nothing reaches her, which is the point.
  const none = clientWorld({ consent: null });
  const noneRes = await firstLetter(none.fake);
  assert(!noneRes.sent, "nobody asked her anything");
  assertEquals(noneRes.reason, "opted_out");

  const refused = clientWorld({
    consent: { ...KICKOFF_RECORD, status: "opted_out" },
  });
  const refusedRes = await firstLetter(refused.fake);
  assert(!refusedRes.sent, "her STOP outranks every box anyone ticked");
  assertEquals(refusedRes.reason, "opted_out");
});

Deno.test("the letter carries a client capability, never a field link", async () => {
  const { fake, mints } = clientWorld();
  const res = await firstLetter(fake);
  assert(res.sent);
  assertEquals(mints.length, 1, "exactly one capability per letter");
  assertEquals(mints[0].p_invitation_id, "inv-1");
  assertEquals(mints[0].p_actions, [...CLIENT_LINK_ACTIONS]);
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  const body = String(row.body);
  assert(
    body.includes(`/auth/invite/${CLIENT_TOKEN}`) || !body.includes(CLIENT_TOKEN),
    `the letter must point at her page: "${body}"`,
  );
  assert(!body.includes("/field/"), "a homeowner is never sent a crew link");
  assertEquals(
    (row.recipe as { link_kind?: string })?.link_kind ?? "client",
    "client",
    "the row says which kind of link belongs here",
  );
});

Deno.test("a letter whose capability cannot be minted is not sent at all", async () => {
  // "Read it here: " followed by nothing is worse than no text: she cannot act
  // on it and the studio does not know she cannot.
  const { fake, mints } = clientWorld({ mintFails: true });
  const res = await firstLetter(fake);
  assert(!res.sent, "no link, no letter");
  assertEquals(res.reason, "client_link_unavailable");
  assertEquals(mints.length, 1, "it was attempted");
  assertEquals((fake._data.sms_messages ?? []).length, 0, "and nothing was logged");
});

Deno.test("an ordinary reply to a homeowner meets the client gate too", async () => {
  // Her acknowledgement travels as sms_inbound_reply from sms-inbound's own
  // dispatcher, which knows nothing about client templates. The gate turns on
  // the SEAT as well, or the campaign flag would stop the letters and leave the
  // replies going out.
  const { fake } = clientWorld();
  const off = await sendPartySms(
    fake as never,
    {
      partyId: "cp1",
      projectId: "proj1",
      templateKey: "sms_inbound_reply",
      vars: { studio_name: "Field & Form", message: "Got it." },
    },
    {
      getEnv: envOf({ ...CLIENT_ENV, FIELD_LINE_CAMPAIGN_APPROVED: "0" }),
      now: OPEN,
      fetchImpl: mustNotSend(),
    },
  );
  assert(!off.sent, "the flag is off, so nothing reaches her");
  assertEquals(off.reason, "campaign_not_approved");

  const { fake: onFake } = clientWorld();
  const on = await sendPartySms(
    onFake as never,
    {
      partyId: "cp1",
      projectId: "proj1",
      templateKey: "sms_inbound_reply",
      vars: { studio_name: "Field & Form", message: "Got it." },
    },
    { getEnv: envOf(CLIENT_ENV), now: OPEN, fetchImpl: mustNotSend() },
  );
  assert(on.sent, "and with the rail running she gets an answer");
});

Deno.test("a trade text is untouched by the campaign flag", async () => {
  // The flag is the HOMEOWNER rail's switch. A crew digest must not depend on it.
  const { fake } = linkWorld();
  const res = await sendPartySms(
    fake as never,
    { partyId: "p1", templateKey: "field_digest", automationPhase: 1 },
    {
      getEnv: envOf({
        SMS_DEV_MODE: "dry_run",
        TWILIO_FROM_NUMBER: "+15550000000",
        FIELD_LINE_PHASE: "1",
      }),
      now: OPEN,
      fetchImpl: mustNotSend(),
    },
  );
  assert(res.sent, "the crew's rail has its own phase gate and no flag");
});

Deno.test("P13: the campaign flag is re-asked at the flush, and costs her no slot", async () => {
  // Quiet hours store the letter at 9pm; the flag can be off by 8am. The row
  // stays DEFERRED with the reason and spends NO cadence slot — GATE 3b is
  // asked before the claim, so the flag coming back up inside the 24h window
  // still sends it.
  const { fake, mints, asked } = clientWorld();
  const stored = await sendClientSms(
    fake as never,
    {
      partyId: "cp1",
      projectId: "proj1",
      templateKey: "sms_client_first_letter",
      clientInvitationId: "inv-1",
      dedupeKey: "client_first_letter:inv-1",
    },
    {
      getEnv: envOf({ ...CLIENT_ENV, ...LIVE_TWILIO, FIELD_LINE_PHASE: "2", FIELD_LINE_CAMPAIGN_APPROVED: "1" }),
      now: QUIET,
      fetchImpl: mustNotSend(),
    },
  );
  assert(stored.deferred, `quiet hours must store it: ${JSON.stringify(stored)}`);
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(mints.length, 0, "and mint nothing overnight (contract S6)");
  assert(
    !JSON.stringify(row.recipe).includes(CLIENT_TOKEN),
    "no capability is stored at rest",
  );

  const budgetBefore = asked.filter((a) => a.rpc === "sms_claim_party_budget").length;
  const held = await flushDeferredMessages(fake as never, {
    getEnv: envOf({ ...LIVE_TWILIO, FIELD_LINE_PHASE: "2", FIELD_LINE_CAMPAIGN_APPROVED: "0" }),
    fetchImpl: mustNotSend(),
    now: OPEN,
  });
  assertEquals(held.flushed, 0, "nothing goes out while the flag is off");
  assertEquals(row.twilio_status, "deferred", "the row keeps its place");
  assertEquals(row.error_message, "campaign_not_approved", "and says why");
  assertEquals(mints.length, 0, "no capability minted for a refused flush");
  assertEquals(
    asked.filter((a) => a.rpc === "sms_claim_party_budget").length,
    budgetBefore,
    "and the refusal costs her no cadence slot",
  );

  const wires: string[] = [];
  const resumed = await flushDeferredMessages(fake as never, {
    getEnv: envOf({ ...LIVE_TWILIO, FIELD_LINE_PHASE: "2", FIELD_LINE_CAMPAIGN_APPROVED: "1" }),
    fetchImpl: ((_url: string, init: RequestInit) => {
      wires.push(new URLSearchParams(String(init.body)).get("Body") ?? "");
      return Promise.resolve(
        new Response(JSON.stringify({ sid: "SM1", status: "queued" }), { status: 201 }),
      );
    }) as unknown as typeof fetch,
    now: OPEN,
  });
  assertEquals(resumed.flushed, 1, "the flag came back up inside the window");
  assertEquals(mints.length, 1, "and the capability is minted at dispatch");
  assertEquals(wires.length, 1);
  assert(
    wires[0].includes(`/auth/invite/${CLIENT_TOKEN}`),
    `the wire body carries the link minted this morning: "${wires[0]}"`,
  );
  // And the row it went out from still carries none of it (contract R2).
  assert(
    !JSON.stringify(fake._data.sms_messages ?? []).includes(CLIENT_TOKEN),
    "the stored row keeps no credential, even after the send",
  );
});

Deno.test("P13: the phase is re-asked at the flush for a client row too", async () => {
  const { fake } = clientWorld();
  const stored = await sendClientSms(
    fake as never,
    {
      partyId: "cp1",
      projectId: "proj1",
      templateKey: "sms_client_first_letter",
      clientInvitationId: "inv-1",
      dedupeKey: "client_first_letter:inv-1",
    },
    {
      getEnv: envOf({ ...CLIENT_ENV, ...LIVE_TWILIO }),
      now: QUIET,
      fetchImpl: mustNotSend(),
    },
  );
  assert(stored.deferred);
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  const out = await flushDeferredMessages(fake as never, {
    getEnv: envOf({ ...LIVE_TWILIO, FIELD_LINE_PHASE: "1", FIELD_LINE_CAMPAIGN_APPROVED: "1" }),
    fetchImpl: mustNotSend(),
    now: OPEN,
  });
  assertEquals(out.flushed, 0);
  assertEquals(row.twilio_status, "deferred");
  assertEquals(row.error_message, "field_line_phase_off");
});

Deno.test("her letter is paced by the same guard the crew's is (P1/P5)", async () => {
  const { fake, asked } = clientWorld();
  const res = await firstLetter(fake);
  assert(res.sent);
  const claim = asked.find((a) => a.rpc === "sms_claim_party_budget");
  assert(claim, `the budget was never claimed: ${JSON.stringify(asked)}`);
  assertEquals(claim.args.p_class, "recurring", "one a day, like a digest");
  assert(
    asked.some((a) => a.rpc === "sms_party_prompt_gate"),
    "and the dead-end detector is asked as well",
  );
});

Deno.test("a handset holding a client seat is gated as hers, whichever seat answers first", async () => {
  // SQ-111 INFO-1. A phone-only send names no seat, so the number can answer
  // with several: a foreman who is also the homeowner, or a household phone
  // written on two rows. The classification used to give up at two rows and
  // leave partyKind null, which turned the client gate OFF for exactly the
  // ambiguous case. It now fails closed — ANY client seat on the number makes
  // the send hers — and it does so whatever order the rows come back in.
  const trade = { id: "tp1", phone_e164: "+15551230001", project_id: "proj1", display_name: "Marcus Bell", party_kind: "vendor" };
  const client = clientSeat();
  const phoneOnly = (fake: ReturnType<typeof clientWorld>["fake"]) =>
    sendPartySms(
      fake as never,
      {
        phone: "+15551230001",
        projectId: "proj1",
        templateKey: "sms_inbound_reply",
        vars: { studio_name: "Field & Form", message: "Got it." },
      },
      {
        getEnv: envOf({ ...CLIENT_ENV, FIELD_LINE_CAMPAIGN_APPROVED: "0" }),
        now: OPEN,
        fetchImpl: mustNotSend(),
      },
    );

  for (const [order, seats] of [
    ["client first", [client, trade]],
    ["trade first", [trade, client]],
  ] as const) {
    const { fake } = clientWorld({
      // A grant, so the only thing that can stop this send is the client gate.
      consent: { ...KICKOFF_RECORD, status: "granted" },
      extra: { project_parties: [...seats] },
    });
    const res = await phoneOnly(fake);
    assert(!res.sent, `[${order}] her gate applies to the number she shares`);
    assertEquals(res.reason, "campaign_not_approved", order);
    assertEquals((fake._data.sms_messages ?? []).length, 0, `[${order}] and no row was written`);
  }

  // The control: two seats and NO client among them is not her number, so the
  // flag does not reach it and the trade text goes.
  const { fake: tradeOnly } = clientWorld({
    consent: { ...KICKOFF_RECORD, status: "granted" },
    extra: {
      project_parties: [trade, { ...trade, id: "tp2", display_name: "Sam Okafor", party_kind: "gc" }],
    },
  });
  const sent = await phoneOnly(tradeOnly);
  assert(sent.sent, `two trade seats answer to no client flag: ${JSON.stringify(sent)}`);
});
