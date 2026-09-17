// sms-dispatch/handler.ts — the HTTP contract of the SMS dispatch function.
// Run: deno test --no-check -A --config supabase/functions/deno.json \
//        supabase/functions/_tests/sms-dispatch.test.ts
//
// Two kinds of test here:
//   (a) the status-code table, driven with an INJECTED sendPartySms, so the
//       mapping from one-word result to HTTP status is tested on its own;
//   (b) the 00284 trigger → sms-dispatch → sms_optin_invite leg end to end
//       through the REAL sendPartySms against the in-memory fake, which is the
//       only place the whole rail (consent, claim, render, provider, log) is
//       exercised as one thing.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleSmsDispatch } from "../sms-dispatch/handler.ts";
import type { SendPartySmsResult } from "../_shared/sms.ts";
import { createFakeSupabase, type FakeSupabase } from "./fake-supabase.ts";

// ── Harness ─────────────────────────────────────────────────────────────────

function envOf(map: Record<string, string>) {
  return (k: string) => map[k];
}

const BASE_ENV = {
  SMS_DEV_MODE: "dry_run",
  TWILIO_FROM_NUMBER: "+15550000000",
  TWILIO_ACCOUNT_SID: "AC-test",
  TWILIO_AUTH_TOKEN: "tok",
};

/** A Bearer token shaped like a Supabase JWT, carrying the claims we decode. */
function bearer(claims: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(claims)).replace(/=+$/, "");
  return `Bearer header.${b64}.signature`;
}

const INTERNAL = bearer({ role: "service_role" });

function post(body: unknown, auth = INTERNAL): Request {
  return new Request("https://fn.test/sms-dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  });
}

/** A stub send path that answers with exactly the result under test. */
function sender(result: SendPartySmsResult) {
  const calls: Array<Record<string, unknown>> = [];
  const fn = (
    _supabase: unknown,
    input: Record<string, unknown>,
  ): Promise<SendPartySmsResult> => {
    calls.push(input);
    return Promise.resolve(result);
  };
  return { fn: fn as never, calls };
}

// ── The claim, modelled the way 00640's index models it ─────────────────────
//
// createFakeSupabase is not a Postgres and has no unique indexes, and it is
// owned by another ticket this wave, so the claim is enforced HERE, by the same
// rule the migration states: (party_id, coalesce(template_key,''), dedupe_key)
// is unique among outbound rows whose status has not released the claim.
const CLAIM_RELEASED = new Set([
  "failed",
  "undelivered",
  "canceled",
  "expired",
  "suppressed",
]);

function duplicateKeyBuilder() {
  const answer = {
    data: null,
    error: {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "sms_messages_send_claim_uniq"',
    },
  };
  // deno-lint-ignore no-explicit-any
  const b: any = {
    select: () => b,
    single: () => Promise.resolve(answer),
    maybeSingle: () => Promise.resolve(answer),
    // deno-lint-ignore no-explicit-any
    then: (f: any, r: any) => Promise.resolve(answer).then(f, r),
  };
  return b;
}

function withSendClaim(fake: FakeSupabase): FakeSupabase {
  const from = fake.from.bind(fake);
  return new Proxy(fake, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const builder = from(table);
        if (table !== "sms_messages") return builder;
        const insert = builder.insert.bind(builder);
        builder.insert = ((payload: unknown) => {
          const row = payload as Record<string, unknown>;
          const held = (target._data.sms_messages ?? []).some((r) =>
            r.direction === "outbound" &&
            row.direction === "outbound" &&
            row.party_id != null && r.party_id === row.party_id &&
            (r.template_key ?? "") === (row.template_key ?? "") &&
            row.dedupe_key != null && r.dedupe_key === row.dedupe_key &&
            !CLAIM_RELEASED.has(String(r.twilio_status ?? "claimed"))
          );
          return held ? duplicateKeyBuilder() : insert(payload);
        }) as never;
        return builder;
      };
    },
  }) as FakeSupabase;
}

// ── (a) The status-code table ───────────────────────────────────────────────

Deno.test("200 only when the text is gone", async () => {
  const s = sender({ sent: true, status: "sent", messageId: "m1" });
  const res = await handleSmsDispatch(post({ partyId: "p1", body: "hi" }), {
    supabase: createFakeSupabase() as never,
    getEnv: envOf(BASE_ENV),
    sendPartySms: s.fn,
  });
  assertEquals(res.status, 200);
  const payload = await res.json();
  assertEquals(payload.success, true);
  assertEquals(payload.status, "sent");
});

Deno.test("202 for accepted-but-not-delivered: queued, deferred, already claimed", async () => {
  // A provider ACCEPT is not a delivery, a deferred text has not gone yet, and
  // a send another writer holds is neither an error nor a second text. All
  // three are "accepted, ask later" — and none of them was distinguishable
  // from a delivered text before this (contract S5).
  const cases: Array<[SendPartySmsResult, string]> = [
    [{ sent: true, status: "queued", twilioSid: "SM1" }, "queued"],
    [
      {
        sent: false,
        deferred: true,
        status: "deferred",
        reason: "quiet_hours",
        dueAt: "2026-07-09T13:00:00.000Z",
      },
      "deferred",
    ],
    [
      { sent: false, status: "queued", reason: "duplicate_send_claim" },
      "queued",
    ],
  ];
  for (const [result, status] of cases) {
    const s = sender(result);
    const res = await handleSmsDispatch(post({ partyId: "p1", body: "hi" }), {
      supabase: createFakeSupabase() as never,
      getEnv: envOf(BASE_ENV),
      sendPartySms: s.fn,
    });
    assertEquals(res.status, 202, `${status} must answer 202`);
    const payload = await res.json();
    assertEquals(payload.status, status);
    if (result.dueAt) assertEquals(payload.dueAt, result.dueAt);
  }
});

Deno.test("422 for every consent or suppression refusal", async () => {
  // A refusal is not a failure to retry. The recipient, the studio's record or
  // the studio's own rule is what changes it, so the caller is told to stop
  // rather than to try again.
  for (
    const reason of [
      "opted_out",
      "not_consented",
      "suppressed",
      "contact_rule_forbids_sms",
      "consent_evidence_required",
    ]
  ) {
    const s = sender({ sent: false, status: "failed", reason });
    const res = await handleSmsDispatch(post({ partyId: "p1", body: "hi" }), {
      supabase: createFakeSupabase() as never,
      getEnv: envOf(BASE_ENV),
      sendPartySms: s.fn,
    });
    assertEquals(res.status, 422, `${reason} must answer 422`);
    assertEquals((await res.json()).reason, reason);
  }
});

Deno.test("502 when the provider said no, carrying its own code", async () => {
  const s = sender({
    sent: false,
    status: "failed",
    reason: "Twilio 400: {}",
    provider_code: "21610",
  });
  const res = await handleSmsDispatch(post({ partyId: "p1", body: "hi" }), {
    supabase: createFakeSupabase() as never,
    getEnv: envOf(BASE_ENV),
    sendPartySms: s.fn,
  });
  assertEquals(res.status, 502);
  // 21610 is Twilio's "this number has opted out" — the one provider code the
  // room has to act on, and it was unreadable in a 200 body before this.
  assertEquals((await res.json()).provider_code, "21610");
});

Deno.test("503 for a dependency that is not provisioned or a phase not live", async () => {
  for (const reason of ["twilio_not_configured", "field_line_phase_off"]) {
    const s = sender({ sent: false, status: "failed", reason });
    const res = await handleSmsDispatch(post({ partyId: "p1", body: "hi" }), {
      supabase: createFakeSupabase() as never,
      getEnv: envOf(BASE_ENV),
      sendPartySms: s.fn,
    });
    assertEquals(res.status, 503, `${reason} must answer 503`);
  }
});

Deno.test("400 when the job cannot be acted on at all", async () => {
  for (const reason of ["no_phone_number", "empty_body"]) {
    const s = sender({ sent: false, status: "failed", reason });
    const res = await handleSmsDispatch(post({ partyId: "p1", body: "hi" }), {
      supabase: createFakeSupabase() as never,
      getEnv: envOf(BASE_ENV),
      sendPartySms: s.fn,
    });
    assertEquals(res.status, 400, `${reason} must answer 400`);
  }
});

Deno.test("500 when this rail could not write its own record", async () => {
  // Every one of these is "the send did not happen and it is OUR fault" — the
  // claim row that would not write, the deferred row that never landed, and the
  // accepted send whose provider id could not be recorded. None of them is a
  // 202: a caller told 'accepted' stops looking, and nothing is coming.
  for (
    const reason of [
      "send_not_claimable",
      "defer_requires_recipe",
      "defer_failed",
      "sid_unrecorded",
    ]
  ) {
    const s = sender({ sent: false, status: "failed", reason });
    const res = await handleSmsDispatch(post({ partyId: "p1", body: "hi" }), {
      supabase: createFakeSupabase() as never,
      getEnv: envOf(BASE_ENV),
      sendPartySms: s.fn,
    });
    assertEquals(res.status, 500, `${reason} must answer 500`);
    assertEquals((await res.json()).reason, reason);
  }
});

Deno.test("CORS and the job schema are unchanged", async () => {
  const deps = {
    supabase: createFakeSupabase() as never,
    getEnv: envOf(BASE_ENV),
  };
  const preflight = await handleSmsDispatch(
    new Request("https://fn.test/sms-dispatch", { method: "OPTIONS" }),
    deps,
  );
  assertEquals(preflight.status, 200);
  assertEquals(
    preflight.headers.get("Access-Control-Allow-Origin"),
    "*",
  );

  const sent = await handleSmsDispatch(post({ partyId: "p1", body: "hi" }), {
    ...deps,
    sendPartySms: sender({ sent: true, status: "sent" }).fn,
  });
  assertEquals(sent.headers.get("Access-Control-Allow-Origin"), "*");

  // Neither a userId nor a partyId is still the same 400 it always was.
  const empty = await handleSmsDispatch(post({ body: "hi" }), deps);
  assertEquals(empty.status, 400);
  assertEquals(
    (await empty.json()).error,
    "Missing required field: userId or partyId",
  );
});

Deno.test("authorization on the party path is unchanged", async () => {
  const fake = createFakeSupabase({
    project_parties: [{ id: "p1", project_id: "proj1" }],
    projects: [{ id: "proj1", designer_id: "someone-else" }],
  });
  const deps = { supabase: fake as never, getEnv: envOf(BASE_ENV) };

  const anon = await handleSmsDispatch(
    post({ partyId: "p1", body: "hi" }, "Bearer not.a.jwt"),
    deps,
  );
  assertEquals(anon.status, 401);

  const stranger = await handleSmsDispatch(
    post({ partyId: "p1", body: "hi" }, bearer({ sub: "u-outsider" })),
    deps,
  );
  assertEquals(stranger.status, 403);

  const missing = await handleSmsDispatch(
    post({ partyId: "nope", body: "hi" }, bearer({ sub: "u-outsider" })),
    deps,
  );
  assertEquals(missing.status, 404);
});

Deno.test("the prompt's Ref code reaches the template as {{code}}", async () => {
  const s = sender({ sent: true, status: "sent" });
  await handleSmsDispatch(
    post({
      partyId: "p1",
      templateKey: "sms_optin_invite",
      code: "42",
      vars: { project_name: "Lindqvist" },
    }),
    {
      supabase: createFakeSupabase() as never,
      getEnv: envOf(BASE_ENV),
      sendPartySms: s.fn,
    },
  );
  assertEquals(s.calls.length, 1);
  assertEquals(
    (s.calls[0].vars as Record<string, unknown>).code,
    "42",
    "the code the prompt allocated has to reach the copy",
  );
  assertEquals(
    (s.calls[0].vars as Record<string, unknown>).project_name,
    "Lindqvist",
    "and it rides alongside the job's own vars, not instead of them",
  );
});

// ── (b) The 00284 leg, end to end through the real send path ────────────────

const INVITE_COPY =
  "Hi {{party_first_name}} - you asked {{studio_name}} to send {{project_name}} " +
  "updates through Patina. Reply YES {{code}} to confirm (~1 msg/day). " +
  "Msg&data rates may apply. Reply HELP for help, STOP to opt out.";

/**
 * The invite fixture, plus a stand-in for public.sms_create_prompt (00639):
 * it issues one code per call and writes the sms_prompts row the reuse query
 * reads back, so the retry path is exercised against a real row rather than a
 * stubbed answer.
 */
function inviteWorld(codes: string[] = ["42", "43", "44"]) {
  const holder: { fake?: FakeSupabase } = {};
  const allocations: Array<Record<string, unknown>> = [];
  let next = 0;
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
    // The record says `pending`: the studio asked, the recipient has not
    // answered. That is the one door the invite may use (contract S2).
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551230001",
      status: "pending",
      recorded_at: "2026-07-08T17:00:00Z",
    }],
    project_parties: [{
      id: "p1",
      project_id: "proj1",
      phone_e164: "+15551230001",
      display_name: "Sal Sub",
      sms_consent_status: "pending",
      sms_consent_source: "verbal",
      sms_consent_evidence: "Recorded during the project kickoff meeting",
      sms_consent_recorded_at: "2026-07-08T17:00:00Z",
      sms_consent_disclosure_version: "field-sms-v1",
    }],
    email_templates: [{
      slug: "sms_optin_invite",
      is_active: true,
      html_content: INVITE_COPY,
    }],
    sms_prompts: [],
  }, {
    sms_create_prompt: (args) => {
      // 00639's sms_prompts_open_optin_uniq, modelled the way withSendClaim
      // models the send-claim index: UNIQUE (party_id, version) WHERE
      // kind = 'optin' AND answered_at IS NULL. EXPIRY IS NOT IN THAT
      // PREDICATE, which is the whole of the re-invite defect — a challenge
      // that ran out unanswered still holds its generation.
      const held = (holder.fake!._data.sms_prompts ?? []).some((p) =>
        p.kind === "optin" && p.answered_at == null &&
        p.party_id === args.p_party_id &&
        Number(p.version) === Number(args.p_version)
      );
      if (held) {
        return {
          data: null,
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "sms_prompts_open_optin_uniq"',
          },
        };
      }
      allocations.push(args);
      const short_code = codes[Math.min(next++, codes.length - 1)];
      const id = `prompt-${short_code}`;
      (holder.fake!._data.sms_prompts ??= []).push({
        id,
        party_id: args.p_party_id,
        project_id: args.p_project_id,
        kind: args.p_kind,
        subject_id: args.p_subject_id,
        version: args.p_version,
        short_code,
        sender_number: args.p_sender_number,
        recipient_phone: args.p_recipient_phone,
        expires_at: args.p_expires_at,
        answered_at: null,
        created_at: new Date().toISOString(),
      });
      return { data: [{ id, short_code }], error: null };
    },
  });
  holder.fake = fake;
  return { fake, allocations };
}

/** Exactly what fc_dispatch_optin_invite() posts (00284:240, 00432:56) — and
 *  note what it does NOT post: a code. sms-dispatch allocates that. */
function triggerJob(code?: string) {
  return {
    partyId: "p1",
    projectId: "proj1",
    templateKey: "sms_optin_invite",
    type: "field_optin_confirmation",
    ...(code ? { code } : {}),
  };
}

Deno.test("00284 trigger → sms-dispatch → the invite goes out ONCE", async () => {
  const CODE = "42";
  const { fake, allocations } = inviteWorld([CODE, "43"]);
  const supabase = withSendClaim(fake);
  const deps = {
    supabase: supabase as never,
    getEnv: envOf(BASE_ENV),
    now: new Date("2026-07-08T18:00:00Z"), // ~1pm Chicago — inside the window
  };

  // The trigger sends no code; sms-dispatch allocates one through
  // public.sms_create_prompt, which is the only allocation door (contract S1).
  const first = await handleSmsDispatch(post(triggerJob()), deps);
  assertEquals(first.status, 200, "the invite goes");
  const firstBody = await first.json();
  assertEquals(firstBody.success, true);
  assertEquals(firstBody.status, "sent");

  const rows = fake._data.sms_messages ?? [];
  assertEquals(rows.length, 1, "one invite, one row");
  const stored = rows[0] as Record<string, unknown>;
  assertEquals(stored.twilio_status, "dry_run");
  assertEquals(stored.template_key, "sms_optin_invite");
  // The claim the invite named for itself: keyed on the consent record's own
  // evidence stamp, so a re-consent later earns a fresh invite and a retried
  // trigger does not.
  assertEquals(stored.dedupe_key, "optin:2026-07-08T17:00:00Z");
  // The copy: studio name first, the code the prompt allocated, and the rates /
  // HELP / STOP line every outbound body ends with (contract S8).
  const body = String(stored.body);
  assert(body.includes("Field & Form"), `studio name missing: ${body}`);
  // 00641 renders the invite as "Reply YES {{code}}" and a MISSING code renders
  // EMPTY, so the leg is only correct when the allocated short code reaches the
  // copy: the recipient has to be told which prompt to answer (contract S1/S2).
  assert(
    body.includes(`YES ${CODE}`),
    `the Ref code must reach the copy: ${body}`,
  );
  assertEquals(allocations.length, 1, "one prompt, allocated once");
  assertEquals(allocations[0].p_kind, "optin");
  assertEquals(allocations[0].p_party_id, "p1");
  assertEquals(allocations[0].p_subject_id, "p1");
  assertEquals(allocations[0].p_project_id, "proj1");
  assertEquals(allocations[0].p_recipient_phone, "+15551230001");
  assertEquals(allocations[0].p_sender_number, "+15550000000");
  assert(
    body.includes("Msg&data rates may apply. Reply HELP for help, STOP to opt out."),
    `the compliance line missing: ${body}`,
  );

  // THE TRIGGER FIRES AGAIN — a retried statement, a second UPDATE that still
  // reads `pending`, the cron behind it. The claim is what stops the second
  // text; before 00640 this was a second invite to the same person.
  const second = await handleSmsDispatch(post(triggerJob()), deps);
  assertEquals(second.status, 202, "the retry is accepted, not sent");
  assertEquals((await second.json()).reason, "duplicate_send_claim");
  assertEquals(
    (fake._data.sms_messages ?? []).length,
    1,
    "still one invite",
  );
  // AND THE RETRY DID NOT BURN A SECOND CODE. Allocating per call would change
  // the question the recipient was asked every time a trigger re-fired; the
  // open prompt is reused instead.
  assertEquals(allocations.length, 1, "still one prompt");
  assertEquals((fake._data.sms_prompts ?? []).length, 1);
});

Deno.test("the invite's code is allocated once and reused while the prompt is open", async () => {
  // The same party, asked again before answering: same code. sms-dispatch
  // reuses the OPEN optin prompt rather than calling the allocator twice — and
  // the reuse is checked against the recipient's own digits, because
  // sms_create_prompt stores the normalized number and we hold E.164.
  const { fake, allocations } = inviteWorld(["42", "43"]);
  const deps = {
    supabase: fake as never,
    getEnv: envOf(BASE_ENV),
    now: new Date("2026-07-08T18:00:00Z"),
    sendPartySms: sender({ sent: true, status: "sent" }).fn,
  };
  await handleSmsDispatch(post(triggerJob()), deps);
  await handleSmsDispatch(post(triggerJob()), deps);
  assertEquals(allocations.length, 1, "one allocation for one open prompt");
  assertEquals(
    String((fake._data.sms_prompts ?? [])[0].short_code),
    "42",
  );

  // Answered — the prompt is closed, so the next invite gets a fresh code.
  (fake._data.sms_prompts ?? [])[0].answered_at = "2026-07-08T18:30:00Z";
  await handleSmsDispatch(post(triggerJob()), deps);
  assertEquals(allocations.length, 2, "a closed prompt earns a new code");
  assertEquals((fake._data.sms_prompts ?? []).length, 2);

  // A caller that already made its own prompt keeps its code untouched.
  const explicit = await handleSmsDispatch(post(triggerJob("77")), deps);
  assertEquals(explicit.status, 200);
  assertEquals(allocations.length, 2, "a supplied code allocates nothing");
});

Deno.test("a challenge that expired UNANSWERED earns the next generation, not a collision", async () => {
  // The day-eight re-invite. The open-prompt read excludes an expired prompt —
  // that is what makes this a fresh ask — but the index it has to get past does
  // NOT: an unanswered challenge holds (party, version) whether or not it has
  // run out. Allocating version 1 again therefore died on 23505 and the person
  // who never answered was never asked again (SQ-37 R6).
  const { fake, allocations } = inviteWorld(["42", "43"]);
  const deps = {
    supabase: fake as never,
    getEnv: envOf(BASE_ENV),
    now: new Date("2026-07-08T18:00:00Z"),
    sendPartySms: sender({ sent: true, status: "sent" }).fn,
  };
  const first = await handleSmsDispatch(post(triggerJob()), deps);
  assertEquals(first.status, 200);
  assertEquals(allocations.length, 1);
  assertEquals(Number(allocations[0].p_version), 1, "the first ask is version 1");

  // Eight days later: the prompt's 7-day expiry has passed and answered_at is
  // still NULL. Nothing closed it; it simply ran out.
  const dayEight = { ...deps, now: new Date("2026-07-16T18:00:00Z") };
  const reinvite = await handleSmsDispatch(post(triggerJob()), dayEight);
  assertEquals(reinvite.status, 200, "the re-invite goes out");
  assertEquals(allocations.length, 2, "an expired prompt is a new ask, not a reuse");
  assertEquals(
    Number(allocations[1].p_version),
    2,
    "and it takes the NEXT generation — version 1 is still held by the expired row",
  );
  assertEquals((fake._data.sms_prompts ?? []).length, 2);
  assertEquals(String((fake._data.sms_prompts ?? [])[1].short_code), "43");
});

Deno.test("an invite whose code cannot be allocated REFUSES rather than shipping 'Reply YES  to confirm'", async () => {
  // The copy asks the recipient to answer with a code. An empty one is a
  // question with no way to answer it, so a prompt rail that cannot answer is
  // a 503 the caller retries — not a text.
  const { fake } = inviteWorld();
  const broken = createFakeSupabase({ ...fake._data }, {
    sms_create_prompt: () => ({
      data: null,
      error: { message: "sms_prompts is not readable" },
    }),
  });
  const res = await handleSmsDispatch(post(triggerJob()), {
    supabase: broken as never,
    getEnv: envOf(BASE_ENV),
    now: new Date("2026-07-08T18:00:00Z"),
    sendPartySms: sender({ sent: true, status: "sent" }).fn,
  });
  assertEquals(res.status, 503);
  assertEquals((await res.json()).reason, "prompt_code_unavailable");
  assertEquals(
    (broken._data.sms_messages ?? []).length,
    0,
    "and no text went out",
  );
});

Deno.test("the provider id is recorded BEFORE the status flips", async () => {
  // The crash window the outbox has to survive: Twilio has accepted the message
  // — it is already going out — and this process dies before the row says so.
  // Writing the sid first leaves a row that still reads 'claimed' and carries
  // the id, which sms-status settles by sid and sms_reconcile_accepted_send()
  // closes by hand. (It is NOT exactly-once carrier delivery: a claim released
  // with no sid can still be retried against a carrier that already delivered.)
  const { fake } = inviteWorld();
  const writes: Array<Record<string, unknown>> = [];
  let claimedAtSendTime: string | undefined;

  const from = fake.from.bind(fake);
  const recording = new Proxy(fake, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const builder = from(table);
        if (table !== "sms_messages") return builder;
        const update = builder.update.bind(builder);
        builder.update = ((payload: unknown) => {
          writes.push(payload as Record<string, unknown>);
          return update(payload);
        }) as never;
        return builder;
      };
    },
  }) as FakeSupabase;

  const res = await handleSmsDispatch(post(triggerJob("42")), {
    supabase: recording as never,
    getEnv: envOf({
      ...BASE_ENV,
      SMS_DEV_MODE: "off",
      SMS_CONVERSATION_NUMBER: "+15550000000",
    }),
    now: new Date("2026-07-08T18:00:00Z"),
    fetchImpl: ((_url: string) => {
      // At the moment the provider is called the row already exists and is
      // still a claim: the claim is taken BEFORE the send, not after it.
      const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
      claimedAtSendTime = row ? String(row.twilio_status) : undefined;
      return Promise.resolve(
        new Response(JSON.stringify({ sid: "SM-accepted", status: "queued" }), {
          status: 201,
        }),
      );
    }) as unknown as typeof fetch,
  });

  assertEquals(res.status, 202, "an accept is 202, not 200");
  assertEquals(claimedAtSendTime, "claimed");

  const sidWrite = writes.findIndex((w) => "twilio_sid" in w);
  const statusWrite = writes.findIndex((w) => "twilio_status" in w);
  assert(sidWrite >= 0, "the sid must be written");
  assert(statusWrite >= 0, "the status must be written");
  assert(
    sidWrite < statusWrite,
    `the sid has to land first: ${JSON.stringify(writes)}`,
  );
  assertEquals(
    writes[sidWrite].twilio_status,
    undefined,
    "the sid write must not carry the status with it",
  );

  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(row.twilio_sid, "SM-accepted");
  assertEquals(row.twilio_status, "queued");
});

Deno.test("a provider refusal answers 502 with the code, through the real send path", async () => {
  const { fake } = inviteWorld();
  const res = await handleSmsDispatch(post(triggerJob("42")), {
    supabase: fake as never,
    getEnv: envOf({
      ...BASE_ENV,
      SMS_DEV_MODE: "off",
      SMS_CONVERSATION_NUMBER: "+15550000000",
    }),
    now: new Date("2026-07-08T18:00:00Z"),
    fetchImpl: (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ code: 21610, message: "Attempt to send to unsubscribed recipient" }),
          { status: 400 },
        ),
      )) as unknown as typeof fetch,
  });
  assertEquals(res.status, 502);
  assertEquals((await res.json()).provider_code, "21610");
  const row = (fake._data.sms_messages ?? [])[0] as Record<string, unknown>;
  assertEquals(row.twilio_status, "failed");
  assertEquals(row.error_code, "21610");
});
