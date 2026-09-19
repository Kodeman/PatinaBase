// Deno test for the sms-inbound pipeline (compliance keywords, idempotency,
// menu replies, and the LLM confidence gate with a stubbed parser).
// Run: deno test --no-check -A supabase/functions/_tests/sms-inbound.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound, tradeShape, type InboundParams } from "../sms-inbound/pipeline.ts";
import type { FieldParseResult } from "../_shared/field-parse.ts";
import { createFakeSupabase as baseFakeSupabase, type FakeSupabase } from "./fake-supabase.ts";
import { inboundFixture } from "./field-line/inbound-fixture.ts";
import { clientFixture, CLIENT_PHONE } from "./field-line/client-fixture.ts";

function createFakeSupabase(...args: Parameters<typeof baseFakeSupabase>): FakeSupabase {
  const fake = baseFakeSupabase(...args);
  const invoke = fake.functions.invoke;
  fake.functions.invoke = async (name, opts) => {
    await invoke(name, opts);
    return { data: { success: true, notification_id: "fixture-notification", channel: "in_app" }, error: null };
  };
  // Old chooser controls now start from a durably delivered, authorized question,
  // not an unverified handset options array. Keep their replay/media assertions.
  for (const conv of fake._data.sms_conversations ?? []) {
    if (conv.state !== "awaiting_project_choice") continue;
    const context = conv.state_context as any;
    const origin = context.pending_message_id ?? crypto.randomUUID();
    const outbound = crypto.randomUUID();
    const created = "2026-08-12T11:59:00.000Z";
    const options = context.chooser.map((c: any) => ({ number: c.n, partyId: c.party_id, projectId: c.project_id }));
    fake._data.sms_messages ??= [];
    if (!fake._data.sms_messages.some(m=>m.id===origin)) fake._data.sms_messages.push({
      id: origin, direction: "inbound", conversation_id: conv.id, created_at: created,
      body: context.pending_body ?? "", media: context.pending_media ?? [],
    });
    const source = fake._data.sms_messages.find(m => m.id === origin)!;
    source.twilio_sid ??= "SMfixture" + origin;
    const manifest = { version: 1, kind: "project_choice", inboundMessageId: origin, conversationId: conv.id,
      senderNumber: conv.twilio_number, recipientPhone: conv.phone_e164, expiresAt: "2026-08-13T11:59:00.000Z", options };
    fake._data.sms_messages.push({ id: outbound, direction: "outbound", conversation_id: conv.id,
      party_id: null, project_id: null, template_key: "sms_selection", dedupe_key: "selection:" + origin + ":project_choice",
      twilio_status: "delivered", recipe: { template_key: "sms_selection", party_id: null, project_id: null, link_kind: null, params: {}, selection: manifest } });
    context.selection = { kind: "project_choice", inboundMessageId: origin, messageId: outbound };
    context.pending_message_id = origin;
    fake._data.organizations = [{ id: "org-alpha", name: "Studio A" }];
    fake._data.studio_channel_consent = [{ organization_id: "org-alpha", channel_kind: "sms", channel_value: conv.phone_e164, status: "granted", refusal_unanswered: false }];
    fake._data.email_templates.push({ slug: "sms_selection", is_active: true, html_content: "{{selection}} Msg&data rates may apply. Reply HELP for help, STOP to opt out." });
  }
  // These controls describe live (unstamped) context, not migration snapshots.
  // Separate each menu by its actual project; chooser metadata stays service-only.
  fake._data.sms_conversation_context ??= [];
  for (const conv of fake._data.sms_conversations ?? []) {
    const ctx = conv.state_context as any ?? {};
    const menus = new Map<string, any[]>();
    for (const entry of ctx.menu ?? []) menus.set(entry.project_id, [...(menus.get(entry.project_id) ?? []), entry]);
    const projectId = ctx.project_pin?.project_id ?? conv.active_project_id;
    const ids = new Set([...menus.keys(), ...(projectId ? [projectId] : [])]);
    for (const id of ids) fake._data.sms_conversation_context.push({
      conversation_id: conv.id, project_id: id,
      party_id: fake._data.project_parties?.find(p=>p.project_id===id && p.phone_e164===conv.phone_e164)?.id ?? conv.party_id,
      state: conv.state === "awaiting_project_choice" ? "idle" : conv.state,
      state_context: { ...(menus.has(id) ? { menu: menus.get(id), menu_created_at: ctx.menu_created_at } : {}),
        ...(ctx.project_pin?.project_id===id ? { project_pin: ctx.project_pin } : {}),
        ...(ctx.pending_prompt_id ? {pending_prompt_id: ctx.pending_prompt_id} : {}) },
      paused_until: null, backfilled_at: null,
    });
    if (conv.state === "awaiting_project_choice") {
      const held = { ...ctx }; delete held.menu; delete held.menu_created_at; delete held.project_pin;
      fake._data.sms_conversation_context.push({ conversation_id: conv.id, project_id: null, party_id: null,
        state: conv.state, state_context: held, paused_until: null, backfilled_at: null });
    }
    delete conv.state; delete conv.state_context;
  }
  return fake;
}

const TO = "+15559990000";
const NO_POSTHOG = (key: string) => key === "FIELD_LINE_TRIAGE_USER" ? "triage-owner" : key === "SMS_CONVERSATION_NUMBER" ? TO : undefined; // keep captureServerEvent off the network

function baseSeed(extra: Record<string, unknown[]> = {}) {
  return {
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    profiles: [{ id: "dz1", full_name: "Dana Designer" }],
    email_templates: [
      { slug: "sms_optin_confirm", is_active: true, html_content: "You're set {{party_first_name}} for {{project_name}}." },
      { slug: "sms_inbound_reply", is_active: true, html_content: "{{studio_name}}: {{message}} Msg&data rates may apply. Reply HELP for help, STOP to opt out." },
      { slug: "sms_optin_invite", is_active: true, html_content: "{{studio_name}} sends {{project_name}} updates by text through Patina. Reply YES {{code}} to confirm (~1 msg/day). Msg&data rates may apply. Reply HELP for help, STOP to opt out." },
      { slug: "sms_help", is_active: true, html_content: "Help from {{studio_name}}." },
    ],
    ...extra,
  };
}

function params(p: Partial<InboundParams> & { From: string; Body: string; MessageSid: string }): InboundParams {
  return { To: TO, NumMedia: "0", ...p } as InboundParams;
}

// R-AS: the refusal lands on the RECORD of every studio that holds the number,
// and on nothing else. project_parties.sms_consent_* is frozen legacy.
Deno.test("STOP opts out every studio's record for the phone, and writes no seat", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [
      { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110000", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
      { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110000", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "installer", sms_consent_status: "granted" },
    ],
  }));
  const res = await processInbound(
    params({ From: "+15551110000", Body: "STOP", MessageSid: "SMstop" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  const byOrg = Object.fromEntries(
    ((fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>)
      .map((c) => [c.organization_id, c.status]),
  );
  assertEquals(byOrg["org-alpha"], "opted_out");
  assertEquals(byOrg["org-beta"], "opted_out", "both studios holding the number are refused");
  const parties = fake._data.project_parties as Array<{ sms_consent_status: string }>;
  assert(
    parties.every((p) => p.sms_consent_status === "granted"),
    "the frozen legacy columns are left exactly as they stood",
  );
  assert(res.twiml.includes("Texts stopped"), "STOP confirms once when Advanced Opt-Out did not");
});

// r10 M1, restated for the single source (R-AS). project_parties holds ONE
// evidence set, which is why a seat could never say both "signed the kickoff
// form" and "replied STOP" — the defect that fix chased. The record holds the
// grant's five and the refusal's four side by side, so the STOP writes its own
// evidence where it belongs and the grant's paperwork is left standing.
Deno.test("STOP writes the refusal's own evidence onto the record, beside the grant's", async () => {
  const fake = createFakeSupabase(baseSeed({
    project_parties: [
      {
        id: "53100000-0000-4000-8000-000000000001",
        phone_e164: "+15551110044",
        project_id: "53100000-0000-4000-8000-000000000003",
        party_kind: "sub",
        sms_consent_status: "granted",
        sms_consented_at: "2025-05-02T00:00:00Z",
        sms_consent_source: "written",
        sms_consent_evidence: "Signed the Lindqvist kickoff form",
        sms_consent_recorded_at: "2025-05-02T00:00:00Z",
        sms_consent_disclosure_version: "field-sms-v1",
        sms_consent_recorded_by: "dz1",
      },
    ],
  }));
  const res = await processInbound(
    params({ From: "+15551110044", Body: "STOP", MessageSid: "SMstopevidence" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<Record<string, unknown>>;
  assertEquals(consent.length, 1);
  assertEquals(consent[0].status, "opted_out");
  // The refusal's own four: how it arrived, in its own words, and nobody in the
  // studio as its recorder — the recipient made it.
  assertEquals(consent[0].opt_out_source, "inbound_sms");
  assertEquals(consent[0].opt_out_evidence, "Inbound STOP");
  assertEquals(consent[0].opt_out_recorded_at, consent[0].opt_out_at);
  assertEquals(consent[0].opt_out_recorded_by, null);
  // This STOP MINTS the record, so there is no standing grant to protect and
  // the act's own source and words go on the consent side too (the same leg
  // record_channel_consent's INSERT takes). The disclosure version is not
  // invented: R-AN scopes the seat fallback to a GRANT.
  assertEquals(consent[0].source, "inbound_sms");
  assertEquals(consent[0].disclosure_version, null);
  // The seat is frozen legacy and says exactly what it said before.
  const p1 = (fake._data.project_parties as Array<Record<string, unknown>>)
    .find((p) => p.id === "53100000-0000-4000-8000-000000000001")!;
  assertEquals(p1.sms_consent_status, "granted");
  assertEquals(p1.sms_consent_source, "written");
  assertEquals(p1.sms_consent_evidence, "Signed the Lindqvist kickoff form");
});

// The keyword the person actually sent is the words on the record.
Deno.test("an UNSUBSCRIBE stamps its own keyword on the record, not a generic STOP", async () => {
  const fake = createFakeSupabase(baseSeed({
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110045", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
    ],
  }));
  await processInbound(
    params({ From: "+15551110045", Body: "unsubscribe", MessageSid: "SMunsub" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  const consent = (fake._data.studio_channel_consent ?? []) as Array<Record<string, unknown>>;
  assertEquals(consent[0].opt_out_evidence, "Inbound UNSUBSCRIBE");
});

Deno.test("YES grants a pending party and confirms", async () => {
  const fake = createFakeSupabase(baseSeed({
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110001", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
    ],
    // WHAT THE YES ANSWERS IS THE RECORD (final-run BLOCKING-1): the invite
    // record record_channel_invite() writes, not the frozen seat beside it.
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551110001",
      status: "pending",
    }],
  }));
  const res = await processInbound(
    params({ From: "+15551110001", Body: "YES", MessageSid: "SMyes" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "granted");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<
    { organization_id: string; status: string }
  >;
  assertEquals(consent.length, 1);
  assertEquals(consent[0].organization_id, "org-alpha");
  assertEquals(consent[0].status, "granted");
  // The seat is frozen legacy: the grant lives on the record alone (R-AS).
  const p1 = (fake._data.project_parties as Array<{ id: string; sms_consent_status: string }>).find((p) => p.id === "53100000-0000-4000-8000-000000000001")!;
  assertEquals(p1.sms_consent_status, "pending");
  assert(res.twiml.includes("<Message>"));
});

// r5 M5-2 / R-AN: the rail does not know which disclosure the person was shown
// or who recorded it — the studio does, on its own seat, from the portal's
// write. With no record yet (the ordinary case), the record used to be minted
// with both NULL, and 00594's mirror then wrote those NULLs over the seat.
Deno.test("an inbound YES carries the seat's disclosure version and recorder onto the record", async () => {
  const fake = createFakeSupabase(baseSeed({
    project_parties: [
      {
        id: "53100000-0000-4000-8000-000000000001",
        phone_e164: "+15551110033",
        project_id: "53100000-0000-4000-8000-000000000003",
        party_kind: "sub",
        sms_consent_status: "pending",
        display_name: "Sal Sub",
        sms_consent_source: "written",
        sms_consent_evidence: "Signed the studio's field-SMS form",
        sms_consent_disclosure_version: "field-sms-v1",
        sms_consent_recorded_by: "dz1",
      },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551110033",
      status: "pending",
    }],
  }));
  const res = await processInbound(
    params({ From: "+15551110033", Body: "YES", MessageSid: "SMyesevidence" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "granted");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{
    status: string;
    disclosure_version: string | null;
    recorded_by: string | null;
  }>;
  assertEquals(consent.length, 1);
  assertEquals(consent[0].status, "granted");
  assertEquals(consent[0].disclosure_version, "field-sms-v1");
  assertEquals(consent[0].recorded_by, "dz1");
});

Deno.test("a duplicate MessageSid is idempotent (one row, no reprocess)", async () => {
  const seed = baseSeed(); // unknown phone → brush-off path, no parser needed
  const fake = createFakeSupabase(seed);
  const p = params({ From: "+15551119999", Body: "hello", MessageSid: "SMdup" });
  const first = await processInbound(p, { supabase: fake as never, getEnv: NO_POSTHOG });
  const second = await processInbound(p, { supabase: fake as never, getEnv: NO_POSTHOG });
  assertEquals(first.disposition, "unmatched");
  assertEquals(second.disposition, "duplicate");
  const inbound = (fake._data.sms_messages as Array<{ twilio_sid: string; direction: string }>)
    .filter((m) => m.direction === "inbound" && m.twilio_sid === "SMdup");
  assertEquals(inbound.length, 1, "exactly one inbound row for the sid");
});

Deno.test("a numbered menu reply applies mark_done", async () => {
  const now = new Date("2026-07-08T18:00:00Z");
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    baseSeed({
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110002", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_conversations: [
        {
          id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110002", state: "idle",
          active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001",
          state_context: { menu: [{ n: 1, kind: "task", id: "task1", project_id: "53100000-0000-4000-8000-000000000003" }], menu_created_at: now.toISOString() },
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: 'Marked "Vanity" done.', remaining_count: 2 }, error: null }; } },
  );
  const res = await processInbound(
    params({ From: "+15551110002", Body: "DONE 1", MessageSid: "SMmenu" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, now },
  );
  assertEquals(res.disposition, "menu_applied");
  assertEquals(rpcCalls.length, 1);
  const effect = rpcCalls[0].p_effect as { type: string; target: { id: string } };
  assertEquals(effect.type, "mark_done");
  assertEquals(effect.target.id, "task1");
  assert(res.twiml.includes("2 left"));
});

// ── W4 round-1 review: the touch, and what it says about authority ──────────

/** One conversation on a coordination menu, with the touch RPC recorded. */
function coordinationScenario(opts: {
  courtPartyId?: string | null;
  authority?: Array<Record<string, unknown>>;
  coordinationKind?: string;
}) {
  const now = new Date("2026-07-08T18:00:00Z");
  const touches: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110099", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110098", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "client", sms_consent_status: "granted" },
      ],
      client_decisions: [
        {
          id: "dec1",
          project_id: "53100000-0000-4000-8000-000000000003",
          coordination_kind: opts.coordinationKind ?? "selection",
          court_party_id: opts.courtPartyId ?? null,
        },
      ],
      project_party_authority: opts.authority ?? [],
      sms_conversations: [
        {
          id: "convC", twilio_number: TO, phone_e164: "+15551110099", state: "idle",
          active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001",
          state_context: {
            menu: [{ n: 1, kind: "coordination", id: "dec1", project_id: "53100000-0000-4000-8000-000000000003" }],
            menu_created_at: now.toISOString(),
          },
        },
      ],
    }),
    {
      apply_field_effect: () => ({ data: { applied: true, summary_text: "Done.", remaining_count: 0 }, error: null }),
      record_touch: (args) => { touches.push(args); return { data: "touch1", error: null }; },
    },
  );
  return { fake, touches, now };
}

// M-1. court_party_id is an OPTIONAL pointer at one seat, and every
// coordination item on the seeded book carries none. Reading "no named court"
// as a wrong sender filled the one index built to surface real failures with
// false accusations.
Deno.test("a coordination item with no named court is judged by the sender's own authority, not called an unknown sender", async () => {
  const { fake, touches, now } = coordinationScenario({
    authority: [
      { id: "auth1", engagement_id: "53100000-0000-4000-8000-000000000001", scope: "selections", prepares_only: false, effective_from: null, effective_to: null },
    ],
  });
  await processInbound(
    params({ From: "+15551110099", Body: "DONE 1", MessageSid: "SMcourt1" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, now },
  );
  assertEquals(touches.length, 1);
  assertEquals(touches[0].p_decision_class, "selection");
  assertEquals(touches[0].p_authority_check, "passed");
});

// W4 r7 MAJOR-5. A signoff is the money class, and 00624's money-class grants
// are money, change_order AND draw_certify — the same owner/admin gate, on the
// very rail W4 touches (issue_agreement_draw_invoice). Leaving draw_certify
// out of the table filed a certifier's texted approval as
// failed_no_authority, so the studio read "no authority on file" about the one
// party who held exactly the grant that answers.
Deno.test("a draw_certify grant answers a money decision (MAJOR-5)", async () => {
  const { fake, touches, now } = coordinationScenario({
    coordinationKind: "signoff",
    authority: [
      { id: "auth1", engagement_id: "53100000-0000-4000-8000-000000000001", scope: "draw_certify", prepares_only: false, effective_from: null, effective_to: null },
    ],
  });
  await processInbound(
    params({ From: "+15551110099", Body: "DONE 1", MessageSid: "SMdraw1" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, now },
  );
  assertEquals(touches.length, 1);
  assertEquals(touches[0].p_decision_class, "money");
  assertEquals(touches[0].p_authority_check, "passed");
});

// PR-n still decides WITHIN the class: F-03 and F-08 assemble the draw, they
// do not sign it.
Deno.test("a prepares_only draw_certify grant does not sign the draw (MAJOR-5)", async () => {
  const { fake, touches, now } = coordinationScenario({
    coordinationKind: "signoff",
    authority: [
      { id: "auth1", engagement_id: "53100000-0000-4000-8000-000000000001", scope: "draw_certify", prepares_only: true, effective_from: null, effective_to: null },
    ],
  });
  await processInbound(
    params({ From: "+15551110099", Body: "DONE 1", MessageSid: "SMdraw2" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, now },
  );
  assertEquals(touches.length, 1);
  assertEquals(touches[0].p_decision_class, "money");
  assertEquals(touches[0].p_authority_check, "failed_no_authority");
});

Deno.test("a coordination item whose court names ANOTHER seat is still failed_unknown_sender", async () => {
  const { fake, touches, now } = coordinationScenario({
    courtPartyId: "53100000-0000-4000-8000-000000000002",
    authority: [
      { id: "auth1", engagement_id: "53100000-0000-4000-8000-000000000001", scope: "selections", prepares_only: false, effective_from: null, effective_to: null },
    ],
  });
  await processInbound(
    params({ From: "+15551110099", Body: "DONE 1", MessageSid: "SMcourt2" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, now },
  );
  assertEquals(touches.length, 1);
  assertEquals(touches[0].p_authority_check, "failed_unknown_sender");
});

// M-4. Three branches attributed a message to a seat and wrote no touch. A
// STOP is the most consequential message a seat sends.
Deno.test("an inbound STOP files an in touch against the seat that sent it", async () => {
  const touches: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110097", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_conversations: [
        {
          id: "convS", twilio_number: TO, phone_e164: "+15551110097", state: "idle",
          active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001", state_context: {},
        },
      ],
    }),
    { record_touch: (args) => { touches.push(args); return { data: "touch1", error: null }; } },
  );
  const res = await processInbound(
    params({ From: "+15551110097", Body: "STOP", MessageSid: "SMstoptouch" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  assertEquals(touches.length, 1);
  assertEquals(touches[0].p_subject_type, "engagement");
  assertEquals(touches[0].p_subject_id, "53100000-0000-4000-8000-000000000001");
  assertEquals(touches[0].p_channel_kind, "sms");
  assertEquals(touches[0].p_direction, "in");
  assertEquals(touches[0].p_authority_check, "n/a");
});

// W4 r4 MAJOR-3. The same defect class, twice more: START and YES each write a
// consent grant and attribute the message to a seat, and neither filed a touch
// — so after the two most consequential inbound messages after STOP, the seat
// line, the roster row and `touchSentence` all went on printing the PREVIOUS
// contact.
Deno.test("an inbound START files an in touch against the seat that sent it", async () => {
  const touches: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110094", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "opted_out" },
      ],
      studio_channel_consent: [{
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551110094",
        status: "opted_out",
        opt_out_at: "2026-01-04T00:00:00Z",
      }],
      sms_conversations: [
        {
          id: "convStart", twilio_number: TO, phone_e164: "+15551110094", state: "idle",
          active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001", state_context: {},
        },
      ],
    }),
    { record_touch: (args) => { touches.push(args); return { data: "touch1", error: null }; } },
  );
  const res = await processInbound(
    params({ From: "+15551110094", Body: "START", MessageSid: "SMstarttouch" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  assertEquals(touches.length, 1);
  assertEquals(touches[0].p_subject_type, "engagement");
  assertEquals(touches[0].p_subject_id, "53100000-0000-4000-8000-000000000001");
  assertEquals(touches[0].p_channel_kind, "sms");
  assertEquals(touches[0].p_direction, "in");
  assertEquals(touches[0].p_authority_check, "n/a");
});

Deno.test("an inbound YES files an in touch against the seat it is attributed to", async () => {
  const touches: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110093", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
      ],
      studio_channel_consent: [{
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551110093",
        status: "pending",
      }],
      sms_conversations: [
        {
          id: "convYes", twilio_number: TO, phone_e164: "+15551110093", state: "idle",
          active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001", state_context: {},
        },
      ],
    }),
    { record_touch: (args) => { touches.push(args); return { data: "touch1", error: null }; } },
  );
  const res = await processInbound(
    params({ From: "+15551110093", Body: "YES", MessageSid: "SMyestouch" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "granted");
  assertEquals(touches.length, 1);
  assertEquals(touches[0].p_subject_id, "53100000-0000-4000-8000-000000000001");
  assertEquals(touches[0].p_direction, "in");
  assertEquals(touches[0].p_decision_class, "none");
});

Deno.test("HELP files an in touch, and so does a project-chooser pick", async () => {
  const helpTouches: Array<Record<string, unknown>> = [];
  const helpFake = createFakeSupabase(
    baseSeed({
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110096", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_conversations: [
        {
          id: "convH", twilio_number: TO, phone_e164: "+15551110096", state: "idle",
          active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001", state_context: {},
        },
      ],
    }),
    { record_touch: (args) => { helpTouches.push(args); return { data: "touch1", error: null }; } },
  );
  await processInbound(
    params({ From: "+15551110096", Body: "HELP", MessageSid: "SMhelp" }),
    { supabase: helpFake as never, getEnv: NO_POSTHOG, now: PIN_NOW },
  );
  assertEquals(helpTouches.length, 1);
  assertEquals(helpTouches[0].p_subject_id, "53100000-0000-4000-8000-000000000001");

  const pickTouches: Array<Record<string, unknown>> = [];
  const pickFake = createFakeSupabase(
    baseSeed({
      projects: [
        { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
        { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz1", studio_id: "org-alpha" },
      ],
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110095", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110095", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_conversations: [
        {
          id: "53100000-0000-4000-8000-000000000006", twilio_number: TO, phone_e164: "+15551110095",
          state: "awaiting_project_choice", active_project_id: null, party_id: null,
          state_context: {
            chooser: [
              { n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" },
              { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" },
            ],
          },
        },
      ],
    }),
    { record_touch: (args) => { pickTouches.push(args); return { data: "touch1", error: null }; } },
  );
  const res = await processInbound(
    params({ From: "+15551110095", Body: "2", MessageSid: "SMpick" }),
    { supabase: pickFake as never, getEnv: NO_POSTHOG, now: PIN_NOW },
  );
  assertEquals(res.disposition, "project_chosen");
  assertEquals(pickTouches.length, 1);
  assertEquals(pickTouches[0].p_subject_id, "53100000-0000-4000-8000-000000000002");
  assertEquals(pickTouches[0].p_direction, "in");
});

// ── LLM confidence gate ──────────────────────────────────────────────────────
function llmScenario(confidence: number) {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110003", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
      ],
      project_tasks: [
        { id: "task1", title: "Install vanity", due_date: null, owner_party_id: "53100000-0000-4000-8000-000000000001", status: "todo", project_id: "53100000-0000-4000-8000-000000000003" },
      ],
    }),
    { sms_create_prompt: (args) => {
      fake._data.sms_prompts = [{ id: "confirm1", short_code: "17", proposed_effect: args.p_proposed_effect }];
      return { data: [{ id: "confirm1", short_code: "17" }], error: null };
    },
    apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Marked done.", remaining_count: 0 }, error: null }; } },
  );
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "mark_done", target_ref: { kind: "task", id: "task1" }, new_date: null, note: "all done", confidence });
  return { fake, rpcCalls, parseFn };
}

Deno.test("LLM ≥0.8 with a resolved target applies the effect", async () => {
  const { fake, rpcCalls, parseFn } = llmScenario(0.9);
  const res = await processInbound(
    params({ From: "+15551110003", Body: "vanity's in", MessageSid: "SMhi" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn },
  );
  assertEquals(res.disposition, "applied");
  assertEquals(rpcCalls.length, 1);
});

Deno.test("LLM 0.5–0.8 parks the effect and asks to confirm", async () => {
  const { fake, rpcCalls, parseFn } = llmScenario(0.6);
  const res = await processInbound(
    params({ From: "+15551110003", Body: "think vanity's done?", MessageSid: "SMmid" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn },
  );
  assertEquals(res.disposition, "clarify");
  assertEquals(rpcCalls.length, 0, "must not apply below 0.8");
  const conv = (fake._data.sms_conversation_context as Array<{ state: string; state_context: { pending_effect?: unknown } }>)[0];
  assertEquals(conv.state, "awaiting_confirmation");
  assertEquals(conv.state_context.pending_effect, undefined, "handset is not proposal authority");
  assertEquals((fake._data.sms_prompts[0].proposed_effect as Record<string, unknown>).type, "mark_done", "complete proposal stored atomically");
});

Deno.test("LLM <0.5 routes to designer review", async () => {
  const { fake, rpcCalls, parseFn } = llmScenario(0.3);
  const res = await processInbound(
    params({ From: "+15551110003", Body: "uhh", MessageSid: "SMlow" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn },
  );
  assertEquals(res.disposition, "needs_review");
  assertEquals(rpcCalls.length, 0);
  const msg = (fake._data.sms_messages as Array<{ needs_review?: boolean; direction: string }>)
    .find((m) => m.direction === "inbound" && m.needs_review);
  assert(msg, "message flagged needs_review");
});

// ── project-chooser loop fix ─────────────────────────────────────────────────
function multiProjectSeed(conversation: Record<string, unknown>, extra: Record<string, unknown[]> = {}) {
  return baseSeed({
    projects: [
      { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "53100000-0000-4000-8000-000000000004", name: "Feldman", designer_id: "dz1", studio_id: "org-alpha" },
    ],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110004", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
      { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110004", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
    ],
    project_tasks: [
      { id: "task1", title: "Set the vanity", due_date: null, owner_party_id: "53100000-0000-4000-8000-000000000001", status: "todo", project_id: "53100000-0000-4000-8000-000000000003" },
      { id: "task2", title: "Confirm the number", due_date: null, owner_party_id: "53100000-0000-4000-8000-000000000002", status: "todo", project_id: "53100000-0000-4000-8000-000000000004" },
    ],
    sms_conversations: [conversation],
    ...extra,
  });
}

/** A fetchImpl stub for MMS ingestion: any MediaUrl fetch succeeds with a tiny JPEG body. */
function mmsFetchStub(): Promise<Response> {
  return Promise.resolve(
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/jpeg" } }),
  );
}

const PIN_NOW = new Date("2026-08-12T12:00:00Z");

/** A chooser-triggering parse: no target, and an intent the chooser gates on. */
function chooserTriggeringParse(note = "roughed in, photos to follow"): () => Promise<FieldParseResult> {
  return () => Promise.resolve({ intent: "punch_report", target_ref: null, new_date: null, note, confidence: 0.9 });
}

Deno.test("a fresh project_pin skips the chooser and scopes to the pinned party", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      // active_project_id is deliberately unset: only the explicit pin may scope.
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110004", state: "idle",
      active_project_id: null, party_id: "53100000-0000-4000-8000-000000000002",
      state_context: { project_pin: { project_id: "53100000-0000-4000-8000-000000000004", at: "2026-08-12T11:00:00.000Z" } },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Got it.", remaining_count: 0 }, error: null }; } },
  );
  let seenItems: Array<{ id: string }> = [];
  const parseFn = (input: { openItems: Array<{ id: string }> }): Promise<FieldParseResult> => {
    seenItems = input.openItems;
    return chooserTriggeringParse()();
  };
  const res = await processInbound(
    params({ From: "+15551110004", Body: "framing's roughed in", MessageSid: "SMpinned" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn: parseFn as never, now: PIN_NOW },
  );
  assertEquals(res.disposition, "applied", "a pinned conversation never re-asks which project");
  assertEquals(rpcCalls.length, 1);
  // The pinned project's party — NOT parties[0] (p1 on proj1).
  assertEquals(rpcCalls[0].p_party_id, "53100000-0000-4000-8000-000000000002");
  assertEquals(seenItems.map((i) => i.id), ["task2"], "candidate items scoped to the pinned project");
});

Deno.test("a stale project_pin (>4h) falls back to the chooser", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110004", state: "idle",
      active_project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002",
      state_context: { project_pin: { project_id: "53100000-0000-4000-8000-000000000004", at: "2026-08-12T04:00:00.000Z" } },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Got it.", remaining_count: 0 }, error: null }; } },
  );
  const res = await processInbound(
    params({ From: "+15551110004", Body: "framing's roughed in", MessageSid: "SMstale" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn: chooserTriggeringParse() as never, now: PIN_NOW },
  );
  assertEquals(res.disposition, "project_chooser");
  assertEquals(rpcCalls.length, 0);
  assertEquals(res.selection?.kind, "project_choice");
  assertEquals(res.selection.options.length, 2, "typed intent awaits the shared sender");
});

Deno.test("chooser resolution processes the stashed triggering text and preserves state_context.menu", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110004", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "cant get the number until Thursday",
        menu: [{ n: 1, kind: "task", id: "digest1", project_id: "53100000-0000-4000-8000-000000000003" }],
        menu_created_at: "2026-08-12T00:00:00.000Z",
      },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Got it.", remaining_count: 0 }, error: null }; } },
  );
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "note", target_ref: null, new_date: null, note: "cant get the number until Thursday", confidence: 0.9 });
  const res = await processInbound(
    params({ From: "+15551110004", Body: "2", MessageSid: "SMchoice" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, now: PIN_NOW, parseFn },
  );
  // The chosen project's stashed freeform text is processed now — not a
  // second "text me your update" brush-off — and the pipeline never asks
  // "which project" again.
  assertEquals(res.disposition, "applied");
  assertEquals(rpcCalls.length, 1);
  assert(!res.twiml.includes("Text me your update"));
  assert(!res.twiml.includes("Which project?"));
  const conv = fake._data.sms_conversation_context.find(c => c.project_id === "53100000-0000-4000-8000-000000000004") as any;
  assertEquals(conv.state, "idle");
  assertEquals(conv.project_id, "53100000-0000-4000-8000-000000000004");
  assert((fake._data.sms_conversation_context.find(c => c.project_id === "53100000-0000-4000-8000-000000000003")!.state_context as any).menu, "other project digest menu preserved in its own context");
  assertEquals(conv.state_context.menu, undefined, "other project menu must not transfer to the picked project");
  assertEquals(conv.state_context.chooser, undefined);
  assertEquals(conv.state_context.pending_body, undefined);
  assertEquals(
    (conv.state_context as { project_pin?: { project_id?: string } }).project_pin?.project_id,
    "53100000-0000-4000-8000-000000000004",
    "the explicit pick writes the pin",
  );
});

Deno.test("an MMS with no caption replays the stashed media, not a brush-off", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110004", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/m1/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Logged the photo.", remaining_count: 0 }, error: null }; } },
  );
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "punch_report", target_ref: null, new_date: null, note: "", confidence: 0.9 });
  const res = await processInbound(
    params({ From: "+15551110004", Body: "2", MessageSid: "SMmms" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn, now: PIN_NOW },
  );
  assertEquals(res.disposition, "applied");
  assert(!res.twiml.includes("Text me your update"), "a caption-less photo is not brushed off");
  assertEquals(rpcCalls.length, 1);
  const effect = rpcCalls[0].p_effect as { media?: string[] };
  // Re-homed (item 3) now that the project is known — the effect carries the
  // NEW project path, not the original holding/ one.
  assertEquals(effect.media, ["project/53100000-0000-4000-8000-000000000004/sms/m1/0.jpg"], "stashed media carried into the effect, re-homed");
  assertEquals(rpcCalls[0].p_party_id, "53100000-0000-4000-8000-000000000002");
});

Deno.test("STOP while awaiting a project choice still opts out", async () => {
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110004", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "concrete slipped",
      },
    }),
  );
  const res = await processInbound(
    params({ From: "+15551110004", Body: "STOP", MessageSid: "SMstopchoice" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, now: PIN_NOW },
  );
  assertEquals(res.disposition, "opted_out");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{ status: string }>;
  assert(consent.length > 0, "compliance runs before conversation state");
  assert(consent.every((c) => c.status === "opted_out"));
});

Deno.test("two simultaneous chooser picks apply the stashed update exactly once", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110004", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "cant get the number until Thursday",
      },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Got it.", remaining_count: 0 }, error: null }; } },
  );
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "punch_report", target_ref: null, new_date: null, note: "cant get the number until Thursday", confidence: 0.9 });
  const deps = { supabase: fake as never, getEnv: NO_POSTHOG, parseFn, now: PIN_NOW };
  const [a, b] = await Promise.all([
    processInbound(params({ From: "+15551110004", Body: "2", MessageSid: "SMrace1" }), deps),
    processInbound(params({ From: "+15551110004", Body: "2", MessageSid: "SMrace2" }), deps),
  ]);
  const dispositions = [a.disposition, b.disposition].sort();
  assertEquals(dispositions, ["applied", "project_choice_race"]);
  assertEquals(rpcCalls.length, 1, "the loser of the race replays nothing");
});

// ── pick-reply MMS merge, pin-aware MMS paths, holding re-home, attribution ──

Deno.test("a pick-reply carrying its own MMS merges it with the stashed media, not overwrites it", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110005", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/m1/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110005", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110005", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
  );
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "punch_report", target_ref: null, new_date: null, note: "", confidence: 0.9 });
  const res = await processInbound(
    params({
      From: "+15551110005", Body: "2", MessageSid: "SMownmedia", NumMedia: "1",
      MediaUrl0: "https://twilio/own0", MediaContentType0: "image/png",
    }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn, fetchImpl: mmsFetchStub, now: PIN_NOW },
  );
  assertEquals(res.disposition, "applied");
  assertEquals(rpcCalls.length, 1);
  const effect = rpcCalls[0].p_effect as { media?: string[] };
  // Both the stash AND this turn's own MMS get re-homed in the same pass —
  // neither survives at its original holding/ path.
  assert(effect.media?.includes("project/53100000-0000-4000-8000-000000000004/sms/m1/0.jpg"), "stashed media survives (re-homed)");
  assertEquals(effect.media?.length, 2, "merged, not overwritten");
  const ownPath = effect.media?.find((p) => p !== "project/53100000-0000-4000-8000-000000000004/sms/m1/0.jpg");
  assert(
    ownPath?.startsWith("project/53100000-0000-4000-8000-000000000004/sms/") && !ownPath.startsWith("holding/"),
    "the pick-reply's own MMS is ALSO re-homed, not stranded at its ingest-time holding/ path",
  );
});

Deno.test("MMS storage path prefers a fresh project_pin over active_project_id and the single-project fallback", async () => {
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      // active_project_id is deliberately the OTHER project — a stale value
      // that must not win over the fresh, explicit pin.
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110006", state: "idle",
      active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000002",
      state_context: { project_pin: { project_id: "53100000-0000-4000-8000-000000000004", at: "2026-08-12T11:00:00.000Z" } },
    }, {
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110006", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110006", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
    }),
  );
  await processInbound(
    params({
      From: "+15551110006", Body: "roof photo", MessageSid: "SMpinpath", NumMedia: "1",
      MediaUrl0: "https://twilio/pin0", MediaContentType0: "image/jpeg",
    }),
    {
      supabase: fake as never, getEnv: NO_POSTHOG, fetchImpl: mmsFetchStub, now: PIN_NOW,
      parseFn: () => Promise.resolve({ intent: "note", target_ref: null, new_date: null, note: "roof photo", confidence: 0.9 }),
    },
  );
  const upload = fake._uploads[0];
  assert(upload, "an upload happened");
  assert(upload.path.startsWith("holding/"), "multi-project media begins unattributed until the ref/pin is resolved");
  assert(fake._moves.some(m => m.to.startsWith("project/53100000-0000-4000-8000-000000000004/")), "resolved pin rehomes into its own project");
});

Deno.test("MMS storage path falls back to holding/ when multi-project and no fresh pin", async () => {
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110007", state: "idle",
      active_project_id: "53100000-0000-4000-8000-000000000003", party_id: null,
      state_context: {},
    }, {
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110007", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110007", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
    }),
  );
  await processInbound(
    params({
      From: "+15551110007", Body: "site photo", MessageSid: "SMholdingpath", NumMedia: "1",
      MediaUrl0: "https://twilio/hold0", MediaContentType0: "image/jpeg",
    }),
    {
      supabase: fake as never, getEnv: NO_POSTHOG, fetchImpl: mmsFetchStub, now: PIN_NOW,
      parseFn: () => Promise.resolve({ intent: "note", target_ref: null, new_date: null, note: "site photo", confidence: 0.9 }),
    },
  );
  const upload = fake._uploads[0];
  assert(upload, "an upload happened");
  assert(upload.path.startsWith("holding/"), `expected holding/, got ${upload.path}`);
});

Deno.test("chooser resolution re-homes holding/ media to the picked project and updates the originating row", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110008", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/origmsg1/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110008", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110008", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        {
          id: "origmsg1", conversation_id: "53100000-0000-4000-8000-000000000005", direction: "inbound", body: "",
          media: [{ path: "holding/conv1/origmsg1/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
  );
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "punch_report", target_ref: null, new_date: null, note: "", confidence: 0.9 });
  const res = await processInbound(
    params({ From: "+15551110008", Body: "2", MessageSid: "SMrehome" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn, now: PIN_NOW },
  );
  assertEquals(res.disposition, "applied");
  assertEquals(fake._moves.length, 1, "one storage move happened");
  assertEquals(fake._moves[0].from, "holding/conv1/origmsg1/0.jpg");
  assertEquals(fake._moves[0].to, "project/53100000-0000-4000-8000-000000000004/sms/origmsg1/0.jpg");
  const effect = rpcCalls[0].p_effect as { media?: string[] };
  assertEquals(effect.media, ["project/53100000-0000-4000-8000-000000000004/sms/origmsg1/0.jpg"], "the effect carries the NEW path");
  const origRow = (fake._data.sms_messages as Array<{ id: string; media: Array<{ path: string }> }>)
    .find((m) => m.id === "origmsg1")!;
  assertEquals(origRow.media[0].path, "project/53100000-0000-4000-8000-000000000004/sms/origmsg1/0.jpg", "originating row's media path is re-homed too");
});

Deno.test("a re-home move failure keeps the holding path and still replies (does not crash)", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110009", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/origmsg2/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110009", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110009", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        {
          id: "origmsg2", conversation_id: "53100000-0000-4000-8000-000000000005", direction: "inbound", body: "",
          media: [{ path: "holding/conv1/origmsg2/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
  );
  fake._failMovesFor!.add("holding/conv1/origmsg2/0.jpg");
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "punch_report", target_ref: null, new_date: null, note: "", confidence: 0.9 });
  const res = await processInbound(
    params({ From: "+15551110009", Body: "2", MessageSid: "SMrehomefail" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn, now: PIN_NOW },
  );
  assertEquals(res.disposition, "applied", "a move failure never crashes the reply");
  const effect = rpcCalls[0].p_effect as { media?: string[] };
  assertEquals(effect.media, ["holding/conv1/origmsg2/0.jpg"], "kept the holding path on move failure");
  const origRow = (fake._data.sms_messages as Array<{ id: string; media: Array<{ path: string }> }>)
    .find((m) => m.id === "origmsg2")!;
  assertEquals(origRow.media[0].path, "holding/conv1/origmsg2/0.jpg", "originating row's media untouched on failure");
});

Deno.test("a DB-update failure after a successful move triggers a compensating move-back (row and storage stay consistent)", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110011", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/origmsgA/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110011", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110011", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        {
          id: "origmsgA", conversation_id: "53100000-0000-4000-8000-000000000005", direction: "inbound", body: "",
          media: [{ path: "holding/conv1/origmsgA/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
  );
  fake._failUpdateIds!.add("origmsgA");
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "punch_report", target_ref: null, new_date: null, note: "", confidence: 0.9 });
  const res = await processInbound(
    params({ From: "+15551110011", Body: "2", MessageSid: "SMcrashwindow" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn, now: PIN_NOW },
  );
  assertEquals(res.disposition, "applied", "a rehome DB failure never crashes the reply");
  // Forward move, then a compensating move-back once the repoint threw.
  assertEquals(fake._moves.length, 2, "forward move + compensating move-back");
  assertEquals(
    fake._moves[0],
    { bucket: "field-media", from: "holding/conv1/origmsgA/0.jpg", to: "project/53100000-0000-4000-8000-000000000004/sms/origmsgA/0.jpg" },
  );
  assertEquals(
    fake._moves[1],
    { bucket: "field-media", from: "project/53100000-0000-4000-8000-000000000004/sms/origmsgA/0.jpg", to: "holding/conv1/origmsgA/0.jpg" },
  );
  const effect = rpcCalls[0].p_effect as { media?: string[] };
  assertEquals(effect.media, ["holding/conv1/origmsgA/0.jpg"], "rolled back to the holding path in the returned array too");
  const origRow = (fake._data.sms_messages as Array<{ id: string; media: Array<{ path: string }> }>)
    .find((m) => m.id === "origmsgA")!;
  assertEquals(
    origRow.media[0].path,
    "holding/conv1/origmsgA/0.jpg",
    "the row was never repointed — consistent with the rolled-back storage",
  );
});

Deno.test("re-home is idempotent on retry: a missing source + an already-present destination is treated as already-moved", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110012", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/origmsgB/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110012", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110012", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        {
          id: "origmsgB", conversation_id: "53100000-0000-4000-8000-000000000005", direction: "inbound", body: "",
          // A prior attempt already moved the object but its repoint crashed
          // before landing — the row still (stale-ly) points at holding/.
          media: [{ path: "holding/conv1/origmsgB/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
  );
  fake._missingSourceFor!.add("holding/conv1/origmsgB/0.jpg");
  fake._storageFiles!.add("field-media:project/53100000-0000-4000-8000-000000000004/sms/origmsgB/0.jpg");
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "punch_report", target_ref: null, new_date: null, note: "", confidence: 0.9 });
  const res = await processInbound(
    params({ From: "+15551110012", Body: "2", MessageSid: "SMretry" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn, now: PIN_NOW },
  );
  assertEquals(res.disposition, "applied");
  assertEquals(fake._moves.length, 0, "no successful move recorded — the object was already moved by a prior attempt");
  const effect = rpcCalls[0].p_effect as { media?: string[] };
  assertEquals(
    effect.media,
    ["project/53100000-0000-4000-8000-000000000004/sms/origmsgB/0.jpg"],
    "treated as already-moved; the effect carries the project path",
  );
  const origRow = (fake._data.sms_messages as Array<{ id: string; media: Array<{ path: string }> }>)
    .find((m) => m.id === "origmsgB")!;
  assertEquals(
    origRow.media[0].path,
    "project/53100000-0000-4000-8000-000000000004/sms/origmsgB/0.jpg",
    "the stale row is finally repointed on this retry",
  );
});

Deno.test("attribution on replay: parsed_intent/confidence stamp the ORIGINAL stashed message, not the digit reply", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "53100000-0000-4000-8000-000000000005", twilio_number: TO, phone_e164: "+15551110010", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001" }, { n: 2, project_id: "53100000-0000-4000-8000-000000000004", party_id: "53100000-0000-4000-8000-000000000002" }],
        pending_body: "roof leak in the attic",
        pending_message_id: "53100000-0000-4000-8000-000000000007",
      },
    }, {
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110010", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110010", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        { id: "53100000-0000-4000-8000-000000000007", conversation_id: "53100000-0000-4000-8000-000000000005", direction: "inbound", body: "roof leak in the attic", created_at: "2026-08-12T11:59:00.000Z" },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { applied: true, summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
  );
  let seenRecent: Array<{ direction: string; body: string }> = [];
  const parseFn = (input: { recentMessages: Array<{ direction: string; body: string }> }): Promise<FieldParseResult> => {
    seenRecent = input.recentMessages;
    return Promise.resolve({ intent: "punch_report", target_ref: null, new_date: null, note: "roof leak in the attic", confidence: 0.9 });
  };
  const res = await processInbound(
    params({ From: "+15551110010", Body: "2", MessageSid: "SMattrib" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn: parseFn as never, now: PIN_NOW },
  );
  assertEquals(res.disposition, "applied");
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].p_sms_message_id, "53100000-0000-4000-8000-000000000007", "apply_field_effect provenance points at the original message");

  const messages = fake._data.sms_messages as Array<
    { id: string; twilio_sid?: string; parsed_intent?: unknown; confidence?: number; body: string }
  >;
  const origRow = messages.find((m) => m.id === "53100000-0000-4000-8000-000000000007")!;
  assert(origRow.parsed_intent, "the ORIGINAL stashed message is stamped");
  assertEquals(origRow.confidence, 0.9);

  const digitRow = messages.find((m) => m.twilio_sid === "SMattrib")!;
  assertEquals((digitRow.parsed_intent as any).selection_intent.inboundMessageId, origRow.id, "digit carries only original-origin resume provenance");
  assertEquals(digitRow.confidence, undefined, "the digit reply is never stamped with the parsed business effect");

  assert(
    !seenRecent.some((m) => m.body === "roof leak in the attic"),
    "the replayed original text is excluded from the LLM's recent-history feed",
  );
});

// ── studio-scoped consent records (migration 00594) ─────────────────────────

Deno.test("STOP writes an opted_out consent record for every studio holding the phone", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [
      { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
      { id: "proj3", name: "Alpha job 2", designer_id: "dz1", studio_id: "org-alpha" },
    ],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110010", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
      { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110010", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      { id: "p3", phone_e164: "+15551110010", project_id: "proj3", party_kind: "sub", sms_consent_status: "granted" },
    ],
  }));
  const res = await processInbound(
    params({ From: "+15551110010", Body: "STOP", MessageSid: "SMstoporg" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{
    organization_id: string; channel_kind: string; channel_value: string; status: string; source: string;
    opt_out_source: string | null; opt_out_evidence: string | null; opt_out_recorded_at: string | null;
  }>;
  assertEquals(consent.length, 2, "one record per studio, not one per party row");
  assert(consent.every((c) => c.status === "opted_out" && c.channel_kind === "sms"));
  assert(consent.every((c) => c.source === "inbound_sms"));
  // 00594 r8 W4-M2: the refusal gets its OWN evidence set, so a studio
  // recording fresh consent later cannot speak for it.
  assert(
    consent.every((c) => c.opt_out_source === "inbound_sms" && !!c.opt_out_evidence),
    "the STOP stamps the refusal's own source and words",
  );
  assert(consent.every((c) => !!c.opt_out_recorded_at), "the refusal is dated on its own set");
  assertEquals(
    consent.map((c) => c.organization_id).sort().join(","),
    "org-alpha,org-beta",
  );
});

Deno.test("YES grants consent only for the studios that actually invited", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [
      { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    // BOTH seats read `pending` — the state every invited seat is born in and
    // frozen at — and only Alpha holds an invite ON THE RECORD. Which studio
    // asked is the record's answer now (final-run BLOCKING-1).
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110011", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
      { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110011", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551110011",
      status: "pending",
    }],
  }));
  const res = await processInbound(
    params({ From: "+15551110011", Body: "YES", MessageSid: "SMyesorg" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "granted");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{
    organization_id: string; status: string; consented_at: string | null;
  }>;
  assertEquals(consent.length, 1, "only the inviting studio gets a record");
  assertEquals(consent[0].organization_id, "org-alpha");
  assertEquals(consent[0].status, "granted");
  assert(consent[0].consented_at, "a grant is dated");
});

// ── final-run BLOCKING-1: a YES is not a way back from a STOP ──────────────
//
// Pre-wave, an inbound STOP wrote `opted_out` onto every party row on the
// number, so a later YES found nothing `pending` and granted nobody. R-AS
// deleted that write and froze the seats at the `pending` every invited seat is
// born in — and the YES gate was still reading that column, so it was armed for
// ever: a bare YES, weeks after a STOP, wrote the refusal back to `granted`,
// lowered refusal_unanswered, and the next send went out on a 10DLC campaign.
// The target set is the RECORD's `pending` now, and a record whose verdict is
// `opted_out` is answered by START and by nothing else.
Deno.test("a bare YES does not lift a standing recorded STOP", async () => {
  const fake = createFakeSupabase(baseSeed({
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110077", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
    ],
    // The state a STOP leaves behind, with the seat frozen at `pending`.
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551110077",
      status: "opted_out",
      refusal_unanswered: true,
      opt_out_at: "2026-02-01T00:00:00Z",
      opt_out_source: "inbound_sms",
      opt_out_evidence: "Inbound STOP",
    }],
  }));
  const res = await processInbound(
    params({ From: "+15551110077", Body: "YES", MessageSid: "SMyesafterstop" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assert(res.disposition !== "granted", "a YES may not answer a refusal");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{
    status: string; refusal_unanswered: boolean | null; opt_out_at: string | null;
    consented_at: string | null;
  }>;
  assertEquals(consent.length, 1);
  assertEquals(consent[0].status, "opted_out", "the refusal stands");
  assertEquals(consent[0].refusal_unanswered, true, "and it is still unanswered");
  assertEquals(consent[0].opt_out_at, "2026-02-01T00:00:00Z");
  assert(!consent[0].consented_at, "nothing was granted");
  // The seat never moves either way: it is frozen legacy.
  const p1 = (fake._data.project_parties as Array<{ id: string; sms_consent_status: string }>)
    .find((p) => p.id === "53100000-0000-4000-8000-000000000001")!;
  assertEquals(p1.sms_consent_status, "pending");
});

// The sharpest shape of the same defect: the `Y` belongs to a DIFFERENT studio.
// Beta invited today; Alpha was STOPped months ago and never invited again.
// Answering Beta must not speak for Alpha.
Deno.test("a Y answering one studio's invite leaves another studio's recorded STOP standing", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [
      { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110078", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
      { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110078", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
    ],
    studio_channel_consent: [
      {
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551110078",
        status: "opted_out",
        refusal_unanswered: true,
        opt_out_at: "2026-02-01T00:00:00Z",
      },
      {
        organization_id: "org-beta",
        channel_kind: "sms",
        channel_value: "+15551110078",
        status: "pending",
      },
    ],
  }));
  const res = await processInbound(
    params({ From: "+15551110078", Body: "Y", MessageSid: "SMyxstudio" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "granted");
  const byOrg = Object.fromEntries(
    ((fake._data.studio_channel_consent ?? []) as Array<{
      organization_id: string; status: string; refusal_unanswered: boolean | null;
    }>).map((c) => [c.organization_id, `${c.status}/${c.refusal_unanswered}`]),
  );
  assertEquals(byOrg["org-beta"], "granted/false", "the studio that asked is answered");
  assertEquals(
    byOrg["org-alpha"],
    "opted_out/true",
    "the studio that was refused is untouched",
  );
});

Deno.test("START re-grants per studio and keeps the earlier opt-out date", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110012", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "opted_out" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551110012",
      status: "opted_out",
      opt_out_at: "2025-12-03T00:00:00Z",
      consented_at: null,
      disclosure_version: "field-sms-v1",
      opt_out_source: "inbound_sms",
      opt_out_evidence: "Replied STOP",
      opt_out_recorded_at: "2025-12-03T00:00:00Z",
      origin_project_id: "53100000-0000-4000-8000-000000000003",
    }],
  }));
  const res = await processInbound(
    params({ From: "+15551110012", Body: "START", MessageSid: "SMstartorg" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{
    status: string; opt_out_at: string | null; consented_at: string | null; disclosure_version: string | null;
    opt_out_source: string | null; opt_out_evidence: string | null;
  }>;
  assertEquals(consent.length, 1, "the record is upserted, not duplicated");
  assertEquals(consent[0].status, "granted");
  assertEquals(consent[0].opt_out_at, "2025-12-03T00:00:00Z", "the STOP date survives");
  assert(consent[0].consented_at, "the new grant is dated");
  assertEquals(consent[0].disclosure_version, "field-sms-v1", "the disclosure version carries");
  // 00594 r8 W4-M2: the answered refusal keeps its own words — a carrier audit
  // asks about the STOP whether or not it was answered.
  assertEquals(consent[0].opt_out_source, "inbound_sms", "the refusal's source survives the grant");
  assertEquals(consent[0].opt_out_evidence, "Replied STOP", "the refusal's words survive the grant");
});

// ── r1 review fixes ─────────────────────────────────────────────────────────

// M6, restated for the single source (R-AS): the grant is scoped to the studios
// that actually invited. Phone-globally, org-beta would gain a `granted` record
// for a number it never asked.
Deno.test("YES does not grant a studio that never invited", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [
      { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110020", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
      { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110020", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
    ],
    // Only org-alpha has an invite standing on the record at the moment of the
    // YES; both frozen seats say `pending` and neither is read.
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551110020",
      status: "pending",
    }],
  }));

  const res = await processInbound(
    params({ From: "+15551110020", Body: "YES", MessageSid: "SMyesscope" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "granted");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<
    { organization_id: string; status: string }
  >;
  assertEquals(consent.length, 1, "a studio that never invited gains no record");
  assertEquals(consent[0].organization_id, "org-alpha");
  assertEquals(consent[0].status, "granted");
  // Neither seat moves: they are frozen legacy.
  const parties = fake._data.project_parties as Array<{ id: string; sms_consent_status: string }>;
  assertEquals(parties.find((p) => p.id === "53100000-0000-4000-8000-000000000001")!.sms_consent_status, "pending");
  assertEquals(parties.find((p) => p.id === "53100000-0000-4000-8000-000000000002")!.sms_consent_status, "pending");
});

// M7: a project with a NULL studio_id resolves through the designer's primary
// studio, exactly as 00594's backfill and mirror do. Without the fallback the
// migration writes a consent record this rail can never reach.
// r5 M5-1 / R-AM: off organization_members + organizations, never the revoked
// _primary_studio_for RPC — the stub that used to stand here hid a 42501.
Deno.test("STOP reaches a NULL-studio_id project through the designer's primary studio", async () => {
  const fake = createFakeSupabase(
    baseSeed({
      projects: [
        { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: null },
      ],
      organization_members: [
        { user_id: "dz1", organization_id: "org-alpha", role: "owner", status: "active", joined_at: "2025-01-01T00:00:00Z" },
      ],
      organizations: [{ id: "org-alpha", type: "design_studio" }],
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110021", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
      ],
    }),
  );
  const res = await processInbound(
    params({ From: "+15551110021", Body: "STOP", MessageSid: "SMstopnullstudio" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{
    organization_id: string; status: string;
  }>;
  assertEquals(consent.length, 1, "the designer's primary studio gets the record");
  assertEquals(consent[0].organization_id, "org-alpha");
  assertEquals(consent[0].status, "opted_out");
});

// ── r2 review B-3(b) / M-3: the STOP must reach every record on the number ──

// studiosHoldingPhone() reads project_parties only. A studio that holds a
// consent record but no seat — the seat was removed (G-10 is still a hard
// delete), or, once W2 lands, the consent was recorded against a rolodex card
// that never had one — was invisible to it, so its record sat at `granted` for
// ever while the number had said STOP. The send gate now acts on that fact.
Deno.test("STOP reaches a studio that holds a consent record but no party row", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110030", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
    ],
    studio_channel_consent: [
      {
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551110030",
        status: "granted",
        origin_project_id: "53100000-0000-4000-8000-000000000003",
      },
      {
        // Beta holds a record on this number with no seat left anywhere.
        organization_id: "org-beta",
        channel_kind: "sms",
        channel_value: "+15551110030",
        status: "granted",
        origin_project_id: "projB",
      },
    ],
  }));
  const res = await processInbound(
    params({ From: "+15551110030", Body: "STOP", MessageSid: "SMstopseatless" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{
    organization_id: string; status: string; origin_project_id: string | null;
  }>;
  assertEquals(consent.length, 2, "no record is duplicated");
  assert(
    consent.every((c) => c.status === "opted_out"),
    "a STOP must reach every record on the number, seat or no seat",
  );
  assertEquals(
    consent.find((c) => c.organization_id === "org-beta")!.origin_project_id,
    "projB",
    "a seatless studio keeps the origin it already had",
  );
});

// A START lifts the refusals it mirrors — including a seatless record — but it
// does not manufacture a grant for a studio whose record never left not_asked.
Deno.test("START lifts a seatless opted_out record but leaves a seatless not_asked one alone", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110031", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "opted_out" },
    ],
    studio_channel_consent: [
      { organization_id: "org-alpha", channel_kind: "sms", channel_value: "+15551110031", status: "opted_out" },
      { organization_id: "org-beta", channel_kind: "sms", channel_value: "+15551110031", status: "opted_out" },
      { organization_id: "org-gamma", channel_kind: "sms", channel_value: "+15551110031", status: "not_asked" },
    ],
  }));
  const res = await processInbound(
    params({ From: "+15551110031", Body: "START", MessageSid: "SMstartseatless" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  const byOrg = Object.fromEntries(
    ((fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>)
      .map((c) => [c.organization_id, c.status]),
  );
  assertEquals(byOrg["org-alpha"], "granted");
  assertEquals(byOrg["org-beta"], "granted", "the seatless refusal is lifted too");
  assertEquals(
    byOrg["org-gamma"],
    "not_asked",
    "a START must not manufacture consent for a studio that never asked",
  );
});

// M-3: the origin follows the CURRENT verdict, in both writers. Taking the
// prior made R-Q's sentence name the grant's job after a STOP.
Deno.test("a STOP re-homes origin_project_id onto the job it came from", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "proj9", name: "Lindqvist kitchen", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110032", project_id: "proj9", party_kind: "sub", sms_consent_status: "granted" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551110032",
      status: "granted",
      origin_project_id: "proj-old",
    }],
  }));
  const res = await processInbound(
    params({ From: "+15551110032", Body: "STOP", MessageSid: "SMstoporigin" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{
    status: string; origin_project_id: string | null;
  }>;
  assertEquals(consent[0].status, "opted_out");
  assertEquals(
    consent[0].origin_project_id,
    "proj9",
    "the verdict on the books names the job it came from",
  );
});

// ── r3 R-AJ: a START is a RE-subscription, never a first grant ──────────────
//
// studiosHoldingPhone() returns every studio with a seat on the number,
// without looking at what that studio's record says. Unioned into the START
// targets, a studio that holds a seat, has never invited the number and sits
// at `not_asked` was written `granted` with source `inbound_sms` — after which
// the send gate's `allow` branch authorised it to text. The target set is now
// the studios whose own record is `opted_out` (the refusal the START lifts) or
// `pending` (the invite it answers).

Deno.test("START does not grant a seat-holding studio whose record never left not_asked", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [
      { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110040", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "opted_out" },
      { id: "53100000-0000-4000-8000-000000000002", phone_e164: "+15551110040", project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "not_asked" },
    ],
    studio_channel_consent: [
      { organization_id: "org-alpha", channel_kind: "sms", channel_value: "+15551110040", status: "opted_out" },
      { organization_id: "org-beta", channel_kind: "sms", channel_value: "+15551110040", status: "not_asked" },
    ],
  }));
  const res = await processInbound(
    params({ From: "+15551110040", Body: "START", MessageSid: "SMstartnotasked" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  const byOrg = Object.fromEntries(
    ((fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>)
      .map((c) => [c.organization_id, c.status]),
  );
  assertEquals(byOrg["org-alpha"], "granted", "the studio that was refused is re-subscribed");
  assertEquals(
    byOrg["org-beta"],
    "not_asked",
    "a seat is not an invitation: a studio that never asked gains no consent",
  );
  // The seats are frozen legacy and neither of them moves (R-AS).
  const parties = fake._data.project_parties as Array<{ id: string; sms_consent_status: string }>;
  assertEquals(parties.find((p) => p.id === "53100000-0000-4000-8000-000000000001")!.sms_consent_status, "opted_out");
  assertEquals(parties.find((p) => p.id === "53100000-0000-4000-8000-000000000002")!.sms_consent_status, "not_asked");
});

Deno.test("START creates a fresh YES code and leaves the pending studio ungranted", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110041", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "pending" },
    ],
    studio_channel_consent: [
      { organization_id: "org-alpha", channel_kind: "sms", channel_value: "+15551110041", status: "pending" },
    ],
  }), { sms_create_prompt: () => ({ data: [{ id: "optin-new", short_code: "17" }], error: null }) });
  const res = await processInbound(
    params({ From: "+15551110041", Body: "START", MessageSid: "SMstartpending" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>;
  assertEquals(consent.length, 1);
  assertEquals(consent[0].status, "pending");
  assertEquals(res.replies?.[0].vars?.code, "17");
  assert(res.replies?.[0].message.includes("YES 17"));
});

Deno.test("START mints no consent record for a seat-holding studio that has none", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110042", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "not_asked" },
    ],
  }));
  const res = await processInbound(
    params({ From: "+15551110042", Body: "START", MessageSid: "SMstartnorecord" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  assertEquals(
    ((fake._data.studio_channel_consent ?? []) as unknown[]).length,
    0,
    "a START with no record on the books manufactures none",
  );
  const parties = fake._data.project_parties as Array<{ id: string; sms_consent_status: string }>;
  assertEquals(parties.find((p) => p.id === "53100000-0000-4000-8000-000000000001")!.sms_consent_status, "not_asked");
});

// ── r4 review fixes ─────────────────────────────────────────────────────────

// M-2, restated for the single source (R-AS). The consent record is per studio,
// not per seat, so a YES on one of a studio's two seats grants that studio ONCE,
// for the number — and a studio that never invited is still untouched. The
// sibling-seat problem this test was written for cannot exist any more: there
// are no seats to move.
Deno.test("YES grants the inviting studio once, whatever its other seats say", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [
      { id: "projA", name: "Job A", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "projB", name: "Job B", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "projC", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    project_parties: [
      { id: "pA", phone_e164: "+15551110050", project_id: "projA", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
      { id: "pB", phone_e164: "+15551110050", project_id: "projB", party_kind: "sub", sms_consent_status: "not_asked", display_name: "Sal Sub" },
      { id: "pC", phone_e164: "+15551110050", project_id: "projC", party_kind: "sub", sms_consent_status: "not_asked", display_name: "Sal Sub" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551110050",
      status: "pending",
      origin_project_id: "projA",
    }],
  }));
  const res = await processInbound(
    params({ From: "+15551110050", Body: "YES", MessageSid: "SMyessibling" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "granted");
  const parties = fake._data.project_parties as Array<{ id: string; sms_consent_status: string }>;
  assertEquals(parties.find((p) => p.id === "pA")!.sms_consent_status, "pending");
  assertEquals(parties.find((p) => p.id === "pB")!.sms_consent_status, "not_asked");
  assertEquals(parties.find((p) => p.id === "pC")!.sms_consent_status, "not_asked");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<
    { organization_id: string; status: string; origin_project_id: string | null }
  >;
  assertEquals(consent.length, 1, "only the inviting studio gets a record");
  assertEquals(consent[0].organization_id, "org-alpha");
  assertEquals(
    consent[0].origin_project_id,
    "projA",
    "R-Q: the origin is the job the invite actually went out on",
  );
});

// B-1: 00594 refuses `granted` while refusal_unanswered stands, because a
// refusal is routinely dateless. The rail is the writer that raises it on a STOP
// and the only writer that lowers it — the recipient's own YES/START.
Deno.test("STOP records the refusal as unanswered; a START lowers the flag", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110051", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
    ],
  }));
  await processInbound(
    params({ From: "+15551110051", Body: "STOP", MessageSid: "SMstopflag" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  let consent = (fake._data.studio_channel_consent ?? []) as Array<
    { status: string; refusal_unanswered: boolean }
  >;
  assertEquals(consent.length, 1);
  assertEquals(consent[0].status, "opted_out");
  assertEquals(consent[0].refusal_unanswered, true, "a STOP stands unanswered");

  await processInbound(
    params({ From: "+15551110051", Body: "START", MessageSid: "SMstartflag" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  consent = (fake._data.studio_channel_consent ?? []) as Array<
    { status: string; refusal_unanswered: boolean }
  >;
  assertEquals(consent.length, 1);
  assertEquals(consent[0].status, "granted");
  assertEquals(
    consent[0].refusal_unanswered,
    false,
    "only the recipient's own answer lowers it — this is what reopens the studio's door",
  );
});

// ── r7 R7-M1: the rail is held to the record's own invariant ─────────────────
//
// "A REFUSAL WRITES NONE OF THE CONSENT'S FIVE" (00594:159-170) was closed
// inside record_channel_consent (00594:1469-1479) and left open in the rail —
// the writer that handles every REAL stop. Writing source/evidence/recorded_at
// unconditionally, one ordinary STOP over a number the studio holds a signed
// grant for restated that grant as "arrived by text, today": R-Q's grant
// sentence read "Consent by text, 2 May 2025", recorded_at contradicted
// consented_at on one row, recorded_by still named the studio member who wrote
// the paperwork down, and nothing anywhere held the original. Unrecoverable —
// reconsent() writes the studio's NEW paperwork onto that side.
Deno.test("a STOP keeps the grant's own evidence and restates only the refusal's", async () => {
  const fake = createFakeSupabase(baseSeed({
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110060", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: "+15551110060",
      status: "granted",
      consented_at: "2025-05-02T15:00:00Z",
      source: "written",
      evidence: "Signed the Lindqvist kickoff form",
      recorded_at: "2025-05-02T15:00:00Z",
      disclosure_version: "field-sms-v1",
      recorded_by: "dz1",
      refusal_unanswered: false,
    }],
  }));
  const res = await processInbound(
    params({ From: "+15551110060", Body: "STOP", MessageSid: "SMstopevidence" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  const rec = ((fake._data.studio_channel_consent ?? []) as Array<{
    status: string; consented_at: string | null; source: string | null;
    evidence: string | null; recorded_at: string | null;
    disclosure_version: string | null; recorded_by: string | null;
    refusal_unanswered: boolean; opt_out_source: string | null;
    opt_out_evidence: string | null; opt_out_recorded_at: string | null;
    opt_out_recorded_by: string | null;
  }>)[0];
  assertEquals(rec.status, "opted_out");
  assertEquals(rec.refusal_unanswered, true);
  // The grant's own 10DLC artifact, untouched.
  assertEquals(rec.source, "written", "the consent still says how it arrived");
  assertEquals(rec.evidence, "Signed the Lindqvist kickoff form");
  assertEquals(rec.recorded_at, "2025-05-02T15:00:00Z");
  assertEquals(rec.consented_at, "2025-05-02T15:00:00Z");
  assertEquals(rec.disclosure_version, "field-sms-v1");
  assertEquals(rec.recorded_by, "dz1");
  // The refusal's own four, and only those.
  assertEquals(rec.opt_out_source, "inbound_sms");
  assertEquals(rec.opt_out_evidence, "Inbound STOP");
  assert(rec.opt_out_recorded_at, "the refusal is dated on its own set");
  assertEquals(rec.opt_out_recorded_by, null, "the recipient refused, not the studio");
});

// The other leg, matched to record_channel_consent's own split (00594:1396): a
// STOP that MINTS the record has no grant to protect, so it names itself.
Deno.test("a STOP that mints the record writes itself onto the consent side", async () => {
  const fake = createFakeSupabase(baseSeed({
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: "+15551110061", project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
    ],
  }));
  await processInbound(
    params({ From: "+15551110061", Body: "STOP", MessageSid: "SMstopmint" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  const rec = ((fake._data.studio_channel_consent ?? []) as Array<{
    source: string | null; evidence: string | null; recorded_at: string | null;
    disclosure_version: string | null; recorded_by: string | null;
  }>)[0];
  assertEquals(rec.source, "inbound_sms");
  assertEquals(rec.evidence, "Inbound STOP");
  assert(rec.recorded_at);
  assertEquals(rec.disclosure_version ?? null, null, "the rail invents no disclosure");
  assertEquals(rec.recorded_by ?? null, null, "nobody in the studio recorded this");
});

// ── r7 R7-M3: a STOP that was not fully recorded is not acknowledged ─────────
//
// The STOP branch's targets come from three reads; two of them swallowed their
// error, so one failed query produced an empty target list, no consent record
// at all, and a 200 to Twilio. A studio holding a record WITHOUT a seat has no
// backstop by construction — that is why studiosHoldingRecord() exists — so its
// record sat at `granted` after the number had said STOP, which is the send
// gate's positive branch.
const READ_DENIED = { message: "permission denied", code: "42501" };

function denyTable(fake: FakeSupabase, table: string) {
  const denied = Promise.resolve({ data: null, error: READ_DENIED });
  // deno-lint-ignore no-explicit-any
  const failing: any = {
    select: () => failing,
    eq: () => failing,
    neq: () => failing,
    in: () => failing,
    is: () => failing,
    order: () => failing,
    limit: () => failing,
    insert: () => failing,
    update: () => failing,
    upsert: () => failing,
    maybeSingle: () => denied,
    single: () => denied,
    // deno-lint-ignore no-explicit-any
    then: (cb: any) => denied.then(cb),
  };
  return {
    ...fake,
    from: (t: string) => (t === table ? failing : fake.from(t)),
  } as unknown as FakeSupabase;
}

function seatlessRecordSeed(phone: string) {
  return baseSeed({
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
    ],
    studio_channel_consent: [
      { organization_id: "org-alpha", channel_kind: "sms", channel_value: phone, status: "granted" },
      // org-beta holds a record and no seat anywhere: nothing else can reach it.
      { organization_id: "org-beta", channel_kind: "sms", channel_value: phone, status: "granted" },
    ],
  });
}

Deno.test("a STOP whose consent-record read fails is not acknowledged, and the retry completes it", async () => {
  const fake = createFakeSupabase(seatlessRecordSeed("+15551110062"));
  const res = await processInbound(
    params({ From: "+15551110062", Body: "STOP", MessageSid: "SMstopblind" }),
    { supabase: denyTable(fake, "studio_channel_consent") as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.status, 500, "Twilio must not be told a STOP landed when it did not");
  assertEquals(res.disposition, "opt_out_incomplete");
  // Nothing landed anywhere: the record is the only thing a keyword writes, and
  // the seats are frozen legacy (R-AS). That is why the STOP is not acknowledged.
  assert(
    ((fake._data.project_parties ?? []) as Array<{ sms_consent_status: string }>)
      .every((p) => p.sms_consent_status === "granted"),
    "the frozen seats are untouched",
  );
  // The idempotency claim is released, or the retry would answer `duplicate`
  // and the seatless record would keep saying granted for ever.
  const inbound = ((fake._data.sms_messages ?? []) as Array<{ twilio_sid: string | null; direction: string }>)
    .filter((m) => m.direction === "inbound");
  assertEquals(inbound.length, 1);
  assertEquals(inbound[0].twilio_sid, null, "the MessageSid claim is released for the retry");

  // Twilio retries the same MessageSid — now it goes through.
  const retry = await processInbound(
    params({ From: "+15551110062", Body: "STOP", MessageSid: "SMstopblind" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(retry.status, 200);
  assertEquals(retry.disposition, "opted_out");
  const byOrg = Object.fromEntries(
    ((fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>)
      .map((c) => [c.organization_id, c.status]),
  );
  assertEquals(byOrg["org-alpha"], "opted_out");
  assertEquals(byOrg["org-beta"], "opted_out", "the seatless record is reached on the retry");
});

// close-review r1 BLOCKING-1: the WRITE is load-bearing too, now the record is
// the only copy. An upsert that errors used to leave `failed` false — Twilio got
// a 200, the idempotency claim stood so no retry came, and the studio's record
// still said granted for a number that had texted STOP.
const WRITE_DENIED = { message: "could not serialize access due to concurrent update", code: "40001" };

/** Reads pass, the upsert fails — the shape a transient write error takes. */
function denyUpsert(fake: FakeSupabase, table: string) {
  return {
    ...fake,
    from: (t: string) => {
      const real = fake.from(t);
      if (t !== table) return real;
      const denied = Promise.resolve({ data: null, error: WRITE_DENIED });
      // deno-lint-ignore no-explicit-any
      const shim: any = Object.create(real);
      shim.upsert = () => ({
        select: () => shim.upsert(),
        single: () => denied,
        maybeSingle: () => denied,
        // deno-lint-ignore no-explicit-any
        then: (cb: any, rj: any) => denied.then(cb, rj),
      });
      return shim;
    },
  } as unknown as FakeSupabase;
}

Deno.test("a STOP whose consent-record WRITE fails is not acknowledged, and the retry completes it", async () => {
  const fake = createFakeSupabase(seatlessRecordSeed("+15551110065"));
  const res = await processInbound(
    params({ From: "+15551110065", Body: "STOP", MessageSid: "SMstopwrite" }),
    { supabase: denyUpsert(fake, "studio_channel_consent") as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.status, 500, "a STOP the record did not take is not a STOP that landed");
  assertEquals(res.disposition, "opt_out_incomplete");
  // Nothing moved: the record is the only copy and its write was refused.
  assert(
    ((fake._data.studio_channel_consent ?? []) as Array<{ status: string }>)
      .every((c) => c.status === "granted"),
    "no record was written",
  );
  assert(
    ((fake._data.project_parties ?? []) as Array<{ sms_consent_status: string }>)
      .every((p) => p.sms_consent_status === "granted"),
    "the frozen seats are untouched — there is no second copy to fall back on",
  );
  const inbound = ((fake._data.sms_messages ?? []) as Array<{ twilio_sid: string | null; direction: string }>)
    .filter((m) => m.direction === "inbound");
  assertEquals(inbound.length, 1);
  assertEquals(inbound[0].twilio_sid, null, "the MessageSid claim is released for the retry");

  // Twilio retries the same MessageSid — now the write goes through.
  const retry = await processInbound(
    params({ From: "+15551110065", Body: "STOP", MessageSid: "SMstopwrite" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(retry.status, 200);
  assertEquals(retry.disposition, "opted_out");
  const byOrg = Object.fromEntries(
    ((fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>)
      .map((c) => [c.organization_id, c.status]),
  );
  assertEquals(byOrg["org-alpha"], "opted_out");
  assertEquals(byOrg["org-beta"], "opted_out");
});

Deno.test("a STOP whose party read fails is not acknowledged either", async () => {
  const fake = createFakeSupabase(seatlessRecordSeed("+15551110063"));
  const res = await processInbound(
    params({ From: "+15551110063", Body: "STOP", MessageSid: "SMstopblindparties" }),
    { supabase: denyTable(fake, "project_parties") as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.status, 500);
  assertEquals(res.disposition, "opt_out_incomplete");
  // The record-only leg still read clean, so those records did land.
  assert(
    ((fake._data.studio_channel_consent ?? []) as Array<{ status: string }>)
      .every((c) => c.status === "opted_out"),
    "every write that could land, did",
  );
});

// The control: with both reads clean the STOP is acknowledged as before.
Deno.test("a STOP with every read clean still answers Twilio 200", async () => {
  const fake = createFakeSupabase(seatlessRecordSeed("+15551110064"));
  const res = await processInbound(
    params({ From: "+15551110064", Body: "STOP", MessageSid: "SMstopclean" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.status, 200);
  assertEquals(res.disposition, "opted_out");
  const inbound = ((fake._data.sms_messages ?? []) as Array<{ twilio_sid: string | null; direction: string }>)
    .filter((m) => m.direction === "inbound");
  assertEquals(inbound[0].twilio_sid, "SMstopclean", "a recorded STOP keeps its claim");
});

// ── close-out r4 BLOCKING-1: the fourth read the STOP gate did not ask about ─
//
// studiosHoldingPhone() got orgsOfProjects()'s `failed` flag, logged it, and
// dropped it. orgsOfProjects() returns an EMPTY map when the `projects` select
// errors, so a transient failure there looked exactly like "no seat belongs to
// any studio": the STOP was written only for the studios that happen to hold a
// RECORD on the number, Twilio was answered 200, and the twilio_sid claim stood
// so the retry came back `duplicate` and the branch never ran again. A studio
// holding a seat and NO record — the ordinary case, "text updates" unticked —
// lost the refusal outright, and could later tick "text updates" and send an
// opt-in invite to a number that had replied STOP to the platform. R-AS deleted
// the phone-global party write that used to cover it.
Deno.test("a STOP whose studio-attribution read fails is not acknowledged, and the retry records the seat-only studio", async () => {
  const phone = "+15551110066";
  const seed = () =>
    createFakeSupabase(baseSeed({
      projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
      project_parties: [
        // org-alpha holds a seat and NO record: "text updates" was never
        // ticked, so record_channel_invite was never called. The attribution
        // read is the only leg that can reach it.
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "not_asked" },
      ],
      studio_channel_consent: [
        // org-beta holds a record and no seat: reached by studiosHoldingRecord().
        { organization_id: "org-beta", channel_kind: "sms", channel_value: phone, status: "granted" },
      ],
    }));

  const fake = seed();
  const res = await processInbound(
    params({ From: phone, Body: "STOP", MessageSid: "SMstopattr" }),
    { supabase: denyTable(fake, "projects") as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.status, 500, "a STOP whose studio could not be READ is not a STOP that landed");
  assertEquals(res.disposition, "opt_out_incomplete");
  // The record-only leg read clean, so that write did land — every write that
  // could, did, and each one moves only toward refusal.
  const byOrgFirst = Object.fromEntries(
    ((fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>)
      .map((c) => [c.organization_id, c.status]),
  );
  assertEquals(byOrgFirst["org-beta"], "opted_out");
  assertEquals(
    byOrgFirst["org-alpha"],
    undefined,
    "the seat-only studio was never reached — which is exactly why this is not a 200",
  );
  // The claim is released, or the retry answers `duplicate` and org-alpha's
  // refusal is lost for ever.
  const inbound = ((fake._data.sms_messages ?? []) as Array<{ twilio_sid: string | null; direction: string }>)
    .filter((m) => m.direction === "inbound");
  assertEquals(inbound.length, 1);
  assertEquals(inbound[0].twilio_sid, null, "the MessageSid claim is released for the retry");

  // Twilio retries the same MessageSid — now the attribution read succeeds.
  const retry = await processInbound(
    params({ From: phone, Body: "STOP", MessageSid: "SMstopattr" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(retry.status, 200);
  assertEquals(retry.disposition, "opted_out");
  const byOrg = Object.fromEntries(
    ((fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>)
      .map((c) => [c.organization_id, c.status]),
  );
  assertEquals(byOrg["org-alpha"], "opted_out", "the retry records the studio the failed read hid");
  assertEquals(byOrg["org-beta"], "opted_out");
});

// The control: the same seed with every read clean is a 200, and BOTH studios
// are recorded — so the 500 above is the flag, not the shape of the fixture.
Deno.test("a STOP with a clean studio-attribution read records the seat-only studio and answers 200", async () => {
  const phone = "+15551110067";
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "not_asked" },
    ],
    studio_channel_consent: [
      { organization_id: "org-beta", channel_kind: "sms", channel_value: phone, status: "granted" },
    ],
  }));
  const res = await processInbound(
    params({ From: phone, Body: "STOP", MessageSid: "SMstopattrclean" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.status, 200);
  assertEquals(res.disposition, "opted_out");
  const byOrg = Object.fromEntries(
    ((fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>)
      .map((c) => [c.organization_id, c.status]),
  );
  assertEquals(byOrg["org-alpha"], "opted_out");
  assertEquals(byOrg["org-beta"], "opted_out");
});

// ── close-out r5 BLOCKING-1: a STOP no studio can be resolved for ───────────
//
// `projects.studio_id` is nullable, and 00317 backfilled it from
// _primary_studio_for(designer_id) — so what is left on a live book is exactly
// the designers with no active design_studio membership. For those projects
// COALESCE(studio_id, primary studio) is NULL on both legs. Nothing ERRORS, so
// none of the four r4 flags fire; 00594's fold skipped the project too
// (`WHERE org IS NOT NULL`), so studiosHoldingRecord() has nothing to union in
// either. The STOP was therefore written for NOBODY, acknowledged Twilio 200
// with its twilio_sid claim kept, and the next send went out: the gate's
// no-studio branch finds no record and — R-AS having deleted the phone-global
// seat write — no opted_out seat, answers `unknown`, and the frozen `granted`
// seat carries the field-daily cron and sendPartySms's legacy leg. Both room
// readers printed "Not asked" for the same person the rail kept texting.
Deno.test("a STOP on a project no studio can be resolved for is not acknowledged", async () => {
  const phone = "+15551110069";
  const seed = () =>
    createFakeSupabase(baseSeed({
      // No studio_id, and dz9 holds no organization_members row at all — the
      // population 00317's backfill could not reach.
      projects: [{ id: "proj9", name: "Orphan job", designer_id: "dz9", studio_id: null }],
      project_parties: [
        { id: "p9", phone_e164: phone, project_id: "proj9", party_kind: "sub", sms_consent_status: "granted" },
      ],
    }));

  const fake = seed();
  const res = await processInbound(
    params({ From: phone, Body: "STOP", MessageSid: "SMstoporphan" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(
    res.status,
    500,
    "a refusal this rail cannot record is not a refusal it may acknowledge",
  );
  assertEquals(res.disposition, "opt_out_incomplete");
  assertEquals(
    ((fake._data.studio_channel_consent ?? []) as unknown[]).length,
    0,
    "there is no studio to write a ledger for — which is the whole finding",
  );
  assert(
    (fake._data.project_parties as Array<{ sms_consent_status: string }>)
      .every((p) => p.sms_consent_status === "granted"),
    "and the frozen seat is still not a second copy",
  );
  // The claim is released, so the retry runs the branch again rather than
  // answering `duplicate`.
  const inbound = ((fake._data.sms_messages ?? []) as Array<{ twilio_sid: string | null; direction: string }>)
    .filter((m) => m.direction === "inbound");
  assertEquals(inbound.length, 1, "the inbound STOP itself survives — it is a 10DLC artifact");
  assertEquals(inbound[0].twilio_sid, null, "the MessageSid claim is released for the retry");
});

// The control: the SAME shape, once the designer's primary studio resolves, is
// a 200 with the record written — so the 500 above is the fifth flag, not the
// fixture. (A studio-less project is the only difference between the two.)
Deno.test("the same STOP is acknowledged once a studio resolves for the project", async () => {
  const phone = "+15551110070";
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "proj9", name: "Orphan job", designer_id: "dz9", studio_id: null }],
    organization_members: [
      { user_id: "dz9", organization_id: "org-alpha", role: "owner", status: "active", joined_at: "2025-01-01T00:00:00Z" },
    ],
    organizations: [{ id: "org-alpha", type: "design_studio" }],
    project_parties: [
      { id: "p9", phone_e164: phone, project_id: "proj9", party_kind: "sub", sms_consent_status: "granted" },
    ],
  }));
  const res = await processInbound(
    params({ From: phone, Body: "STOP", MessageSid: "SMstoporphanclean" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.status, 200);
  assertEquals(res.disposition, "opted_out");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{
    organization_id: string;
    status: string;
  }>;
  assertEquals(consent.length, 1);
  assertEquals(consent[0].organization_id, "org-alpha");
  assertEquals(consent[0].status, "opted_out");
});

// A START on the same studio-less shape is NOT gated: a studio-less seat can
// hold no record, so there is no refusal to lift and nothing is lost by
// granting nobody. The fail-closed direction stays 200.
Deno.test("a START on a project no studio can be resolved for still answers 200 and grants nobody", async () => {
  const phone = "+15551110071";
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "proj9", name: "Orphan job", designer_id: "dz9", studio_id: null }],
    project_parties: [
      { id: "p9", phone_e164: phone, project_id: "proj9", party_kind: "sub", sms_consent_status: "opted_out" },
    ],
  }));
  const res = await processInbound(
    params({ From: phone, Body: "START", MessageSid: "SMstartorphan" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.status, 200);
  assertEquals(res.disposition, "resubscribed");
  assertEquals(
    ((fake._data.studio_channel_consent ?? []) as unknown[]).length,
    0,
    "no studio, no record, no manufactured grant",
  );
});

// ── close-out r4 MAJOR-1: the START filter asks the VERDICT, not the column ──
//
// The fold mints records at status='granted' and at status='not_asked' with
// refusal_unanswered=true on purpose (00594:655-666, the r8 W4-M1 shape).
// channel_consent_status() reads both as `opted_out` and every studio-side door
// refuses them, so the design's whole answer is the recipient's own START. The
// START target filter read the raw `status` column, so it reached neither: the
// number was unsendable for ever while the party sheet told the designer "Only
// they can rejoin by replying START" (use-coordination.ts:585, :870), and
// record_channel_reconsent() answered no_opt_out_to_supersede.
Deno.test("START lifts an unanswered refusal standing on a record whose status column still says granted", async () => {
  const phone = "+15551110068";
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: phone,
      status: "granted",
      refusal_unanswered: true,
      opt_out_at: "2025-11-16T00:00:00.000Z",
      opt_out_source: "verbal",
      opt_out_evidence: "told the PM on site",
      consented_at: "2025-03-02T00:00:00.000Z",
      source: "written",
      evidence: "signed trade sheet",
    }],
  }));
  const res = await processInbound(
    params({ From: phone, Body: "START", MessageSid: "SMstartflaggranted" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  const rec = ((fake._data.studio_channel_consent ?? []) as Array<{
    status: string;
    refusal_unanswered: boolean | null;
    opt_out_at: string | null;
    opt_out_evidence: string | null;
    source: string | null;
    evidence: string | null;
  }>)[0];
  // The status column already said `granted`, so the proof the record was
  // REACHED is the flag and the grant's own fresh evidence.
  assertEquals(rec.refusal_unanswered, false, "the one writer that can lower the flag, lowered it");
  assertEquals(rec.status, "granted");
  assertEquals(rec.source, "inbound_sms");
  assertEquals(rec.evidence, "Inbound START");
  // …and the refusal that was answered is still a fact the carrier audit asks
  // about (r8 W4-M2).
  assertEquals(rec.opt_out_at, "2025-11-16T00:00:00.000Z");
  assertEquals(rec.opt_out_evidence, "told the PM on site");
});

Deno.test("START lifts an unanswered refusal standing on a record whose status column says not_asked", async () => {
  const phone = "+15551110069";
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "53100000-0000-4000-8000-000000000001", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "not_asked" },
    ],
    studio_channel_consent: [{
      organization_id: "org-alpha",
      channel_kind: "sms",
      channel_value: phone,
      status: "not_asked",
      refusal_unanswered: true,
      opt_out_at: "2025-11-16T00:00:00.000Z",
      opt_out_source: "verbal",
    }],
  }));
  const res = await processInbound(
    params({ From: phone, Body: "START", MessageSid: "SMstartflagnotasked" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  const rec = ((fake._data.studio_channel_consent ?? []) as Array<
    { status: string; refusal_unanswered: boolean | null }
  >)[0];
  assertEquals(rec.status, "granted");
  assertEquals(rec.refusal_unanswered, false);
});

// ── W4 r5 F3 / MAJOR-2: the touch names the seat the message answered ───────
//
// sms_conversations is keyed on (twilio_number, phone_e164) and the rail sends
// from one platform-wide TWILIO_FROM_NUMBER, so there is ONE conversation row
// per phone across every studio and conv.party_id is whichever seat the first
// outbound send stamped. Filing the consent-keyword touches there left, on a
// shared number, the studio whose record actually moved with no touch at all —
// its card, seat line, roster row and touchSentence kept printing the previous
// contact while its Directory row already showed the new verdict.

Deno.test("an inbound STOP files a touch for EVERY studio's seat on the number, not just the conversation's", async () => {
  const phone = "+15551110098";
  const touches: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      projects: [
        { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
        { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
      ],
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "granted" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_conversations: [
        {
          id: "convS2", twilio_number: TO, phone_e164: phone, state: "idle",
          active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001", state_context: {},
        },
      ],
    }),
    { record_touch: (args) => { touches.push(args); return { data: "touch", error: null }; } },
  );
  const res = await processInbound(
    params({ From: phone, Body: "STOP", MessageSid: "SMstoptouch2" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  assertEquals(touches.length, 2, "one touch per answering seat");
  assertEquals(
    touches.map((t) => t.p_subject_id).sort().join(","),
    "53100000-0000-4000-8000-000000000001,53100000-0000-4000-8000-000000000002",
    "org-beta's seat is touched too — its record just moved",
  );
  assert(touches.every((t) => t.p_subject_type === "engagement"));
  assert(touches.every((t) => t.p_direction === "in"));
  assert(touches.every((t) => t.p_authority_check === "n/a"));
});

Deno.test("a STOP that reaches only a record-only studio still files the conversation's seat", async () => {
  const phone = "+15551110099";
  const touches: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      project_parties: [],
      studio_channel_consent: [{
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: phone,
        status: "granted",
      }],
      sms_conversations: [
        {
          id: "convS3", twilio_number: TO, phone_e164: phone, state: "idle",
          active_project_id: null, party_id: "pOld", state_context: {},
        },
      ],
    }),
    { record_touch: (args) => { touches.push(args); return { data: "touch", error: null }; } },
  );
  const res = await processInbound(
    params({ From: phone, Body: "STOP", MessageSid: "SMstoptouch3" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "opted_out");
  assertEquals(touches.length, 1, "no seat answered, so the conversation's seat stands in");
  assertEquals(touches[0].p_subject_id, "pOld");
});

Deno.test("an inbound START files a touch for every studio it re-grants, not just the conversation's", async () => {
  const phone = "+15551110100";
  const touches: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      projects: [
        { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
        { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
      ],
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "opted_out" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "opted_out" },
      ],
      studio_channel_consent: [
        { organization_id: "org-alpha", channel_kind: "sms", channel_value: phone, status: "opted_out" },
        { organization_id: "org-beta", channel_kind: "sms", channel_value: phone, status: "opted_out" },
      ],
      sms_conversations: [
        {
          id: "convS4", twilio_number: TO, phone_e164: phone, state: "idle",
          active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001", state_context: {},
        },
      ],
    }),
    { record_touch: (args) => { touches.push(args); return { data: "touch", error: null }; } },
  );
  const res = await processInbound(
    params({ From: phone, Body: "START", MessageSid: "SMstarttouch2" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  assertEquals(touches.map((t) => t.p_subject_id).sort().join(","), "53100000-0000-4000-8000-000000000001,53100000-0000-4000-8000-000000000002");
});

Deno.test("an inbound YES files a touch only for the studio whose invite it answered", async () => {
  const phone = "+15551110101";
  const touches: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      projects: [
        { id: "53100000-0000-4000-8000-000000000003", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
        { id: "53100000-0000-4000-8000-000000000004", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
      ],
      project_parties: [
        { id: "53100000-0000-4000-8000-000000000001", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000003", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
        { id: "53100000-0000-4000-8000-000000000002", phone_e164: phone, project_id: "53100000-0000-4000-8000-000000000004", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
      ],
      // Only org-beta has an invite in flight, and the conversation's stamped
      // seat is org-alpha's — the exact disagreement this fix closes.
      studio_channel_consent: [
        { organization_id: "org-beta", channel_kind: "sms", channel_value: phone, status: "pending" },
      ],
      sms_conversations: [
        {
          id: "convS5", twilio_number: TO, phone_e164: phone, state: "idle",
          active_project_id: "53100000-0000-4000-8000-000000000003", party_id: "53100000-0000-4000-8000-000000000001", state_context: {},
        },
      ],
    }),
    { record_touch: (args) => { touches.push(args); return { data: "touch", error: null }; } },
  );
  const res = await processInbound(
    params({ From: phone, Body: "YES", MessageSid: "SMyestouch2" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "granted");
  assertEquals(touches.length, 1);
  assertEquals(touches[0].p_subject_id, "53100000-0000-4000-8000-000000000002", "the seat whose studio was actually granted");
});


// ── The trade rail's reading and its renewal (00645, contract P3/S6/P11) ────

const PROJ = "53100000-0000-4000-8000-000000000003";
const PARTY = "53100000-0000-4000-8000-000000000001";
const TRADE_PHONE = "+15551110777";

Deno.test("P3: the trade words are read exactly as the cards print them", () => {
  const cases: Array<[string, string, string]> = [
    ["ON MY WAY", "HERE", "report_arrival"],
    ["on my way!", "HERE", "report_arrival"],
    ["HERE", "HERE", "report_arrival"],
    ["here.", "HERE", "report_arrival"],
    ["LATE 20", "LATE", "report_delay"],
    ["late 45 min", "LATE", "report_delay"],
    ["Late 5 minutes", "LATE", "report_delay"],
    ["PROBLEM", "PROBLEM", "report_condition"],
    ["PROBLEM gate is locked", "PROBLEM", "report_condition"],
    ["problem: no water on site", "PROBLEM", "report_condition"],
    ["DONE", "DONE", "report_departure"],
    ["done!", "DONE", "report_departure"],
  ];
  for (const [body, verb, intent] of cases) {
    const shape = tradeShape(body);
    assert(shape, `"${body}" is one of the printed words`);
    assertEquals(shape!.verb, verb, body);
    assertEquals(shape!.intent, intent, body);
    // NONE of these is a receipt for goods. That is the whole point of reading
    // them here instead of letting a parser decide.
    assert(
      !["confirm_delivery", "mark_done"].includes(shape!.intent),
      `"${body}" must never say goods arrived or work is closed`,
    );
  }

  // The number after LATE is MINUTES, in the note, and it schedules nothing.
  const late = tradeShape("LATE 20")!;
  assertEquals(late.note, "Running about 20 minutes late.");
  assertEquals(late.condition, undefined);

  // A problem is a not-ok condition carrying what the crew actually said.
  const problem = tradeShape("PROBLEM gate is locked")!;
  assertEquals(problem.condition, { ok: false, note: "gate is locked" });
  assertEquals(problem.note, "gate is locked");
  // And with nothing after it, the rail says so rather than filing an empty note.
  assertEquals(tradeShape("PROBLEM")!.condition, {
    ok: false,
    note: "Something is wrong on site.",
  });

  // Everything else is NOT a trade word, and still reaches the reader it always did.
  for (
    const body of [
      "late",
      "late tomorrow",
      "LATE 1234",
      "problematic",
      "done deal",
      "DONE 2",
      "here we go",
      "YES 17",
      "20",
      "on my way to the other job",
      "",
    ]
  ) {
    assertEquals(tradeShape(body), null, `"${body}" is not a printed word`);
  }
});

/** A consenting field party on one project, plus a mint counter. */
function renewWorld(tokens: Array<Record<string, unknown>>) {
  const mints: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      project_parties: [{
        id: PARTY,
        phone_e164: TRADE_PHONE,
        project_id: PROJ,
        party_kind: "sub",
        display_name: "Sal Sub",
        sms_consent_status: "granted",
      }],
      studio_channel_consent: [{
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: TRADE_PHONE,
        status: "granted",
        refusal_unanswered: false,
      }],
      field_link_tokens: tokens,
    }),
    {
      create_field_link: (args: Record<string, unknown>) => {
        mints.push(args);
        return { data: [{ id: `link-${mints.length}`, token: "b".repeat(64) }], error: null };
      },
    },
  );
  return { fake, mints };
}

// 1pm in America/Chicago: inside the send window, so a renewal that is
// allowed actually goes out instead of waiting for the morning.
const RENEW_NOW = new Date("2026-09-18T18:00:00.000Z");

const RENEW_DEPS = {
  now: RENEW_NOW,
  getEnv: (key: string) => key === "FIELD_LINE_PHASE" ? "1" : NO_POSTHOG(key),
  parseFn: async (): Promise<FieldParseResult> => ({
    intent: "note",
    target_ref: null,
    new_date: null,
    note: "fixture",
    confidence: 0,
  }),
};

/** The wire, for the one test here that actually sends. */
function renewWire(sent: string[]) {
  return {
    getEnv: (key: string) =>
      ({
        FIELD_LINE_PHASE: "1",
        SMS_DEV_MODE: "off",
        TWILIO_FROM_NUMBER: TO,
        SMS_CONVERSATION_NUMBER: TO,
        TWILIO_ACCOUNT_SID: "ACfixture",
        TWILIO_AUTH_TOKEN: "fixture-token",
      } as Record<string, string>)[key] ?? NO_POSTHOG(key),
    fetchImpl: ((_url: string, init: RequestInit) => {
      sent.push(new URLSearchParams(String(init.body)).get("Body") ?? "");
      return Promise.resolve(
        new Response(JSON.stringify({ sid: `SM${sent.length}`, status: "queued" }), { status: 201 }),
      );
    }) as unknown as typeof fetch,
    parseFn: RENEW_DEPS.parseFn,
    now: RENEW_NOW,
  };
}

/** The lapsed token every renewal probe below starts from. */
const LAPSED = {
  id: "expired",
  party_id: PARTY,
  project_id: PROJ,
  token_hash: "d".repeat(64),
  status: "active",
  expires_at: "2026-08-01T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
};

Deno.test("S6: a lapsed link is renewed on any reply, once, with the link minted at send", async () => {
  // The positive control for the two refusals below: this world CAN renew, so
  // when it does not, the refusal is what stopped it.
  const { fake, mints } = renewWorld([{ ...LAPSED }]);
  fake._data.email_templates.push({
    slug: "sms_field_link_renew",
    is_active: true,
    html_content:
      "{{studio_name}}: here is your {{project_name}} link. {{link}} " +
      "Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
  });
  const sent: string[] = [];
  const res = await processInbound(
    params({ From: TRADE_PHONE, Body: "can you send that link again", MessageSid: "SMrenew1" }),
    { supabase: fake as never, ...renewWire(sent) },
  );
  assertEquals(res.disposition, "link_renewed");
  assertEquals(mints.length, 1, "exactly one link, minted at the moment it was dialled");
  assertEquals(mints[0].p_party_id, PARTY);
  assertEquals(sent.length, 1, "and exactly one text");
  assert(sent[0].includes("b".repeat(64)), `the live wire carries the token: ${sent[0]}`);
  const stored = JSON.stringify(fake._data.sms_messages ?? []);
  assert(!stored.includes("b".repeat(64)), "and the stored thread copy does not");
});

Deno.test("S6: a link that still works is never re-minted by a reply", async () => {
  // Renewal cures a LAPSE. A party who can already open their link is not
  // missing anything, and a fresh credential for every "thanks" is a credential
  // factory nobody asked for.
  const { fake, mints } = renewWorld([{
    id: "live",
    party_id: PARTY,
    project_id: PROJ,
    token_hash: "c".repeat(64),
    status: "active",
    expires_at: "2027-01-01T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
  }]);
  const res = await processInbound(
    params({ From: TRADE_PHONE, Body: "thanks", MessageSid: "SMlivelink" }),
    { supabase: fake as never, ...RENEW_DEPS },
  );
  assert(res.disposition !== "link_renewed", `got ${res.disposition}`);
  assertEquals(mints.length, 0, "nothing was minted for a working link");
});

Deno.test("P11: an unknown sender is never renewed — there is no party to scope a link to", async () => {
  // A link is scoped to a party on a project. A number the studio has no seat
  // for cannot be given one, whatever it asks for and whoever forwarded it.
  const { fake, mints } = renewWorld([{
    id: "expired",
    party_id: PARTY,
    project_id: PROJ,
    token_hash: "d".repeat(64),
    status: "active",
    expires_at: "2026-08-01T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
  }]);
  const res = await processInbound(
    params({ From: "+15550009999", Body: "can you resend my link", MessageSid: "SMstranger" }),
    { supabase: fake as never, ...RENEW_DEPS },
  );
  assert(res.disposition !== "link_renewed", `got ${res.disposition}`);
  assertEquals(mints.length, 0, "an unknown number mints nothing");
});

// ── LATE NN is minutes only where a card actually asked (SQ-95 check 6) ─────
//
// The trade reading of "LATE 20" is an EXCEPTION carved out of Phase 0's live
// `<VERB> NN` reference grammar, and an exception that fires unconditionally is
// not an exception — it is a removal. Suppressing the reference match for every
// LATE body re-attributed "LATE 17" on a closed reference to whatever single
// prompt happened to be open and handed it to a designer as needs_review, while
// "DELAY 17" — the synonym both 00641 and 00645 map to report_delay — correctly
// answered that the reference is closed. The four worlds below are the ones
// SQ-95's probe walked, pinned at the pipeline level: minutes require BOTH the
// running rail (FIELD_LINE_PHASE >= 1) and exactly one open site_card/day_of on
// the pair, so each conjunct has a world that fails only it.

/** The stamped inbound rows — what the designer's review queue would see. */
function inboundStamps(f: ReturnType<typeof inboundFixture>): Array<Record<string, unknown>> {
  return (f.h.fake._data.sms_messages ?? []).filter((m: Record<string, unknown>) => m.direction === "inbound");
}

/** Ref 17 answered yesterday; ref 18 the one open prompt, and not a trade one. */
function closedRefWorld() {
  const f = inboundFixture(undefined, undefined, { FIELD_LINE_PHASE: "1" });
  f.prompt({ answered_at: "2026-10-31T12:00:00.000Z" });
  f.prompt({ id: "prompt-new", version: 2, short_code: "18", kind: "report_delay" });
  return f;
}

Deno.test("R1(a): LATE 17 on a closed reference says so, exactly as DELAY 17 and HERE 17 do", async () => {
  // Phase 1 is ON here: nothing but the absence of an open card keeps the
  // number a reference, which is the half of the rule this world isolates.
  for (const body of ["DELAY 17", "HERE 17", "LATE 17"]) {
    const tag = `[${body}]`;
    const f = closedRefWorld();
    const res = await f.h.processInbound({ Body: body, MessageSid: "SMr1a" + body.replace(/\W/g, "") });
    assertEquals(res.disposition, "ref_closed", `${tag} a closed reference is answered as closed`);
    const stamps = inboundStamps(f);
    assertEquals(stamps.length, 1, `${tag} one inbound row`);
    assert(!stamps[0].needs_review, `${tag} never becomes the designer's problem`);
    assertEquals(stamps[0].owner_user_id ?? null, null, `${tag} owns nobody`);
    assertEquals(f.effects.length, 0, `${tag} files nothing`);
    const other = (f.h.fake._data.sms_prompts ?? []).find((p: Record<string, unknown>) => p.short_code === "18");
    assertEquals(other?.answered_at ?? null, null, `${tag} did not answer ref 18 on the party's behalf`);
  }
});

Deno.test("R1(b): with two open non-trade prompts, LATE 18 names prompt 18 exactly as DELAY 18 does", async () => {
  const seen: Array<Record<string, unknown>> = [];
  for (const body of ["DELAY 18", "LATE 18"]) {
    const f = inboundFixture(undefined, undefined, { FIELD_LINE_PHASE: "1" });
    f.prompt({ short_code: "17", kind: "report_delay" });
    f.prompt({ id: "prompt-new", version: 2, short_code: "18", kind: "report_delay" });
    const res = await f.h.processInbound({ Body: body, MessageSid: "SMr1b" + body.replace(/\W/g, "") });
    const parsed = inboundStamps(f)[0]?.parsed_intent as Record<string, unknown> | null;
    // The code identified the prompt, so the reply was never a clarification.
    assertEquals(parsed?.path, "ref", `[${body}] resolved a reference`);
    assertEquals(parsed?.prompt_id, "prompt-new", `[${body}] resolved reference 18`);
    assertEquals(parsed?.version, 2, `[${body}] and that prompt's version`);
    seen.push({ disposition: res.disposition, prompt_id: parsed?.prompt_id, version: parsed?.version });
  }
  // The claim is not "LATE 18 is handled" — it is "handled IDENTICALLY to DELAY 18".
  assertEquals(seen[1], seen[0], "LATE NN and DELAY NN read the same reference");
});

Deno.test("R1(c): at phase 1 with one open site card, LATE 20 is twenty MINUTES on that card", async () => {
  const f = inboundFixture(undefined, undefined, { FIELD_LINE_PHASE: "1" });
  // The card's own reference is 21, and no prompt in this world is numbered 20,
  // so a minutes reading and a reference reading cannot be confused for each other.
  const card = f.prompt({ id: "prompt-card", short_code: "21", kind: "site_card" });
  assert(
    (f.h.fake._data.sms_prompts ?? []).every((p: Record<string, unknown>) => p.short_code !== "20"),
    "there is no reference 20 in this world",
  );
  const res = await f.h.processInbound({ Body: "LATE 20", MessageSid: "SMr1c" });
  assertEquals(res.disposition, "ref_applied", "the card got the answer it asked for");
  assertEquals(f.effects.length, 1, "one delay filed");
  const effect = f.effects[0].p_effect as { type: string; note: string };
  assertEquals(effect.type, "report_delay");
  assertEquals(effect.note, "Running about 20 minutes late.", "20 is minutes, and it is in the note");
  assertEquals(f.effects[0].p_party_id, "party-a");
  assert(card.answered_at, "the prompt it answered is the card that printed the words");
});

Deno.test("R1(d): the same world with the rail off reads LATE 20 as reference 20, never as minutes", async () => {
  // FIELD_LINE_PHASE absent = 0. A site_card row cannot be minted by the phase-0
  // rail at all, so this world isolates the phase conjunct: even with the card
  // sitting open, the server that is not running the rail does not read its words.
  const f = inboundFixture();
  const card = f.prompt({ id: "prompt-card", short_code: "21", kind: "site_card" });
  const res = await f.h.processInbound({ Body: "LATE 20", MessageSid: "SMr1d" });
  assertEquals(res.disposition, "ref_closed", "reference 20 does not exist, and is answered as a reference");
  assertEquals(f.effects.length, 0, "no delay is filed off a rail that is switched off");
  assertEquals(card.answered_at ?? null, null, "and the card was not consumed");
});

// ── A WITHDRAWN prompt is not a question, so it is never offered back ───────
//
// SQ-101's residues. 00644 withdraws an open challenge by stamping voided_at and
// nothing else: expires_at is immutable under sms_prompts_guard_binding, so a
// withdrawn row keeps a future expiry beside its NULL answered_at. 00646 taught
// sms_resolve_prompt and sms_grant_optin_prompt to skip exactly that shape, so
// every TS read that decides which prompts are open has to skip it too — or the
// pipeline offers, counts and binds codes SQL will not resolve (contract P14).

/** The withdrawn stamp, written the way 00644's trigger writes it. */
const WITHDRAWN = { voided_at: "2026-11-01T09:00:00.000Z", void_reason: "phone_corrected" };
/** A challenge that ran out unanswered: what makes the texted code a closed ref. */
const RAN_OUT = { short_code: "17", version: 1, expires_at: "2026-10-25T14:00:00.000Z" };
/** The challenge shape 00644's void trigger acts on: kind optin, no subject. */
const CHALLENGE = { kind: "optin", subject_id: null };

Deno.test("with only a withdrawn challenge left, the closed-ref reply offers nothing rather than a dead code", async () => {
  // SQ-101's MINOR residue, in the shape the rail actually produces. The first
  // challenge ran out unanswered, the re-invite's replacement was WITHDRAWN when
  // the seat's phone was corrected and reverted, and the crew — still holding the
  // first text — answers with its code. sms_resolve_prompt has nothing for that
  // code, so the reply is a closed-ref reply; without the voided_at clause the
  // `latest` read hands back Ref 19, which 00646's grant refuses, so the one
  // number in the reply is the one number that cannot work.
  const f = inboundFixture(undefined, undefined, { FIELD_LINE_PHASE: "1" });
  f.prompt({ ...CHALLENGE, ...RAN_OUT });
  f.prompt({ ...CHALLENGE, id: "prompt-void", version: 2, short_code: "19", ...WITHDRAWN });
  const res = await f.h.processInbound({ Body: "HERE 17", MessageSid: "SMvoidonly" });
  assertEquals(res.disposition, "ref_closed", "a closed reference is answered as closed");
  assert(
    res.twiml.includes("Please ask your designer for the latest reference"),
    `nothing live means no reference to offer: ${res.twiml}`,
  );
  assert(!res.twiml.includes("Ref 19"), `and certainly not the withdrawn one: ${res.twiml}`);
  assertEquals(f.effects.length, 0, "and nothing was applied");
});

Deno.test("a withdrawn challenge never wins the closed-ref reply's `latest` ordering", async () => {
  // The other half of the same clause. On the opt-in rail a withdrawn row cannot
  // currently OUTRANK a live sibling — sms_void_stale_optin_challenges() closes
  // every open challenge on the seat at once, and version/expires_at are both
  // immutable under sms_prompts_guard_binding, so anything minted afterwards
  // takes a higher generation. This world pins the ordering anyway: whoever
  // writes voided_at next, `order by version desc` must step over it and offer
  // the newest code a reply can still resolve.
  const f = inboundFixture(undefined, undefined, { FIELD_LINE_PHASE: "1" });
  f.prompt({ ...CHALLENGE, ...RAN_OUT });
  f.prompt({ ...CHALLENGE, id: "prompt-live", version: 2, short_code: "18" });
  f.prompt({ ...CHALLENGE, id: "prompt-void", version: 3, short_code: "19", ...WITHDRAWN });
  const res = await f.h.processInbound({ Body: "HERE 17", MessageSid: "SMvoidlatest" });
  assertEquals(res.disposition, "ref_closed");
  assert(
    res.twiml.includes("Latest: Ref 18"),
    `the newest ANSWERABLE challenge is the one offered: ${res.twiml}`,
  );
  assert(
    !res.twiml.includes("Ref 19"),
    `the withdrawn code is never handed back: ${res.twiml}`,
  );
});

Deno.test("P14: a withdrawn challenge does not make a bare answer ambiguous", async () => {
  // The open-prompt set in promptReply IS sms_resolve_prompt's predicate minus
  // the code, and everything downstream counts it. A withdrawn opt-in challenge
  // sitting in it made the codeless door see TWO open questions where SQL sees
  // one, so a bare "HERE" against the single live prompt asked which was meant.
  const f = inboundFixture();
  const live = f.prompt({ short_code: "18" });
  f.prompt({
    id: "prompt-void", version: 2, short_code: "19", kind: "optin",
    subject_id: "party-a", ...WITHDRAWN,
  });
  const res = await f.h.processInbound({ Body: "HERE", MessageSid: "SMvoidbare" });
  assertEquals(res.disposition, "ref_applied", "the one live prompt is the one answered");
  assertEquals(f.effects.length, 1, "one arrival filed");
  assertEquals((f.effects[0].p_effect as { type: string }).type, "report_arrival");
  assert(live.answered_at, "and it is the live prompt that was consumed");
  const voided = (f.h.fake._data.sms_prompts ?? [])
    .find((p: Record<string, unknown>) => p.id === "prompt-void")!;
  assertEquals(voided.answered_at ?? null, null, "the withdrawn challenge was not touched");
});

// ── Two open cards: digits in a trade word are a question, not an answer ────
//
// SQ-97 MINOR-1. At phase 1 with a site card at 20 and the morning ask at 22
// both open on the pair, "LATE 20" was read as BOTH readings at once: the code
// picked the card, and the trade reading then filed twenty minutes against it.
// 00645's sms_prompt_reply_verb reads it as NEITHER — its trade branch keys on
// the resolved prompt's KIND, so it never reaches its own VERB NN code check,
// and it then demands exactly one open trade prompt — so that apply came back
// 23514 and the crew's answer landed on a designer's desk as a handoff. The
// pipeline now asks which card, before a code is bound and before an effect
// exists. The boundary is narrow on purpose: "HERE 20" is not a trade shape,
// and SQL answers it by code before it ever counts open cards.

/** A site card at 20 and the morning ask at 22, both open on the same pair. */
function twoCardWorld(env: Record<string, string> = { FIELD_LINE_PHASE: "1" }) {
  const f = inboundFixture(undefined, undefined, env);
  const card = f.prompt({ id: "prompt-card", short_code: "20", kind: "site_card" });
  const dayOf = f.prompt({ id: "prompt-dayof", version: 2, short_code: "22", kind: "day_of" });
  return { f, card, dayOf };
}

/** Asked, not answered: nothing applied, nobody paged, both cards still open. */
function assertClarified(f: ReturnType<typeof inboundFixture>, cards: Array<Record<string, unknown>>,
  res: { disposition?: string }, tag: string) {
  assertEquals(res.disposition, "ref_clarify", `${tag} asks which prompt is meant`);
  const stamps = inboundStamps(f);
  assertEquals(stamps.length, 1, `${tag} one inbound row`);
  const parsed = stamps[0].parsed_intent as Record<string, unknown> | null;
  assertEquals(parsed?.path ?? null, null, `${tag} bound no reference`);
  const selection = (parsed?.selection_intent ?? null) as { options?: Array<{ promptId: string }> } | null;
  assertEquals((selection?.options ?? []).map((o) => o.promptId).sort(), ["prompt-card", "prompt-dayof"],
    `${tag} both open cards are offered`);
  assert(!stamps[0].needs_review, `${tag} never becomes the designer's problem`);
  assertEquals(stamps[0].owner_user_id ?? null, null, `${tag} owns nobody`);
  assertEquals(f.effects.length, 0, `${tag} files nothing`);
  for (const card of cards) assertEquals(card.answered_at ?? null, null, `${tag} ${card.id} is still waiting`);
}

Deno.test("P1-06(a): two open cards and LATE 20 asks which card, and applies nothing", async () => {
  // 20 IS an open code here, which is exactly what used to make this apply:
  // the reference read it as the card and the trade read it as minutes, and
  // 00645 would have refused the pair of readings it never makes.
  const { f, card, dayOf } = twoCardWorld();
  const res = await f.h.processInbound({ Body: "LATE 20", MessageSid: "SMp106a" });
  assertClarified(f, [card, dayOf], res, "[LATE 20]");
});

Deno.test("P1-06(b): two open cards and LATE 30 asks too, rather than calling 30 a dead reference", async () => {
  // No prompt is numbered 30. Answering "that reference is closed" would be an
  // answer to a question the crew did not ask: with two cards open, 30 was
  // never a reference in the first place. The ambiguity is the same ambiguity.
  const { f, card, dayOf } = twoCardWorld();
  assert((f.h.fake._data.sms_prompts ?? []).every((p: Record<string, unknown>) => p.short_code !== "30"),
    "there is no reference 30 in this world");
  const res = await f.h.processInbound({ Body: "LATE 30", MessageSid: "SMp106b" });
  assertClarified(f, [card, dayOf], res, "[LATE 30]");
});

Deno.test("P1-06(c): one open card still reads LATE 20 as minutes, even when its own code is 20", async () => {
  const f = inboundFixture(undefined, undefined, { FIELD_LINE_PHASE: "1" });
  const card = f.prompt({ id: "prompt-card", short_code: "20", kind: "site_card" });
  const res = await f.h.processInbound({ Body: "LATE 20", MessageSid: "SMp106c" });
  assertEquals(res.disposition, "ref_applied", "the card got the answer it asked for");
  assertEquals(f.effects.length, 1, "one delay filed");
  const effect = f.effects[0].p_effect as { type: string; note: string };
  assertEquals(effect.type, "report_delay");
  assertEquals(effect.note, "Running about 20 minutes late.", "20 is minutes, and it is in the note");
  assert(card.answered_at, "the card that printed the words is the one consumed");
});

Deno.test("P1-06(d): with the rail off, the same two cards read LATE NN as a reference", async () => {
  // Phase 0 is untouched: NN names a prompt. LATE 22 is the proof that it is a
  // reference and not minutes — no minutes reading could ever pick the second card.
  for (const [body, promptId] of [["LATE 20", "prompt-card"], ["LATE 22", "prompt-dayof"]]) {
    const tag = `[${body}]`;
    const { f, card, dayOf } = twoCardWorld({});
    const res = await f.h.processInbound({ Body: body, MessageSid: "SMp106d" + promptId });
    assertEquals(res.disposition, "ref_applied", `${tag} the reference was answered`);
    const parsed = inboundStamps(f)[0]?.parsed_intent as Record<string, unknown> | null;
    assertEquals(parsed?.path, "ref", `${tag} resolved a reference`);
    assertEquals(parsed?.prompt_id, promptId, `${tag} NN is the code, and 22 can only be the day_of`);
    assertEquals([card, dayOf].filter((p) => p.answered_at).map((p) => p.id), [promptId],
      `${tag} only the prompt it named was consumed`);
  }
});

Deno.test("P1-06(e): HERE 20 with two open cards still resolves by reference, matching 00645", async () => {
  // Not a trade shape ("HERE" alone is; "HERE 20" is not), so sms_prompt_reply_verb
  // takes its VERB NN branch and returns on the matching code WITHOUT counting
  // open cards. TS must not clarify a shape SQL answers.
  const { f, card, dayOf } = twoCardWorld();
  const res = await f.h.processInbound({ Body: "HERE 20", MessageSid: "SMp106e" });
  assertEquals(res.disposition, "ref_applied", "the code identified the card");
  const parsed = inboundStamps(f)[0]?.parsed_intent as Record<string, unknown> | null;
  assertEquals(parsed?.path, "ref");
  assertEquals(parsed?.prompt_id, "prompt-card");
  assertEquals((f.effects[0]?.p_effect as { type: string }).type, "report_arrival");
  assert(card.answered_at, "card 20 was consumed");
  assertEquals(dayOf.answered_at ?? null, null, "and card 22 was left alone");
});

Deno.test("P1-06(f): PROBLEM 20 with two open cards asks as well, because 00645 refuses it too", async () => {
  // The other trade word that can carry digits: 00645 reads ^PROBLEM(...)$ as a
  // trade reply on either card's kind, so it reaches the same one-open-card
  // count and the same 23514. Same refusal, same answer here.
  const { f, card, dayOf } = twoCardWorld();
  const res = await f.h.processInbound({ Body: "PROBLEM 20", MessageSid: "SMp106f" });
  assertClarified(f, [card, dayOf], res, "[PROBLEM 20]");
});

// ── …but a live NON-card reference is not ambiguous, and LATE must not lose it ──
//
// SQ-99 check 3, on SQ-98's rejected 5f9c697db. The clarify above was keyed on
// "a trade word carrying digits with two cards open" and never asked what the
// digits NAME. On one handset serving two projects — a site card at 20, the
// morning ask at 22, and yesterday's delay prompt still open at 17 — "LATE 17"
// therefore stopped answering a reference that "DELAY 17", the synonym 00641 and
// 00645 both map to report_delay, still answers, and that 00645's
// sms_prompt_reply_verb also answers (it resolves 17 by code and returns verb
// LATE without ever counting open cards). That is the asymmetry class SQ-95
// check 6 rejected and SQ-96 R1(b) pinned. The four worlds below are SQ-99's
// probe world, at both phases, with the synonym asserted equal rather than
// merely "handled".
//
// PROBLEM 17 is deliberately NOT exempted: sms_apply_prompt admits verb PROBLEM
// only for site_card/day_of, so binding that reference would send an apply SQL
// refuses with 23514. (g2) pins the safe direction AND the absence of the apply.

/** SQ-99's probe world: a card on project-a, the morning ask on project-b, and
 *  a live non-card reference 17 open on the same handset. */
function twoCardsAndLiveRefWorld(env: Record<string, string> = { FIELD_LINE_PHASE: "1" }) {
  const f = inboundFixture(undefined, undefined, env);
  const card = f.prompt({ id: "prompt-card", short_code: "20", kind: "site_card" });
  const dayOf = f.prompt({ id: "prompt-dayof", version: 2, short_code: "22", kind: "day_of",
    project_id: "project-b", party_id: "party-b" });
  const ref = f.prompt({ id: "prompt-digest", version: 3, short_code: "17", kind: "report_delay" });
  return { f, card, dayOf, ref };
}

/** No trade word maps LATE or DELAY to an intent on a NON-card prompt, so both
 *  bodies reach the LLM parser, and the harness's own parser answers everything
 *  with confidence 0 — which turns every bound reference into a handoff and
 *  would hide exactly the difference these cases are about. A deployed parser
 *  reads both words as a delay, so this pinned stub does, identically for both.
 *  Stubbing the parse and calling processInbound directly is this file's own
 *  idiom (the llmScenario cases above); nothing else about the call changes. */
const pinnedDelayParse = (): Promise<FieldParseResult> => Promise.resolve({
  intent: "report_delay", target_ref: null, new_date: null,
  note: "Running late.", confidence: 1,
});

async function inboundWithPinnedParse(f: ReturnType<typeof inboundFixture>, body: string, sid: string) {
  const signed = await f.h.signedInbound({ Body: body, MessageSid: sid });
  return await processInbound(signed.inbound, {
    supabase: f.h.fake as never, getEnv: f.h.env, fetchImpl: f.h.provider.fetch,
    now: f.h.clock, parseFn: pinnedDelayParse,
  });
}

Deno.test("P1-06(g): two open cards and LATE 17 still answers the live non-card reference 17", async () => {
  const { f, card, dayOf, ref } = twoCardsAndLiveRefWorld();
  const res = await inboundWithPinnedParse(f, "LATE 17", "SMp106g");
  assertEquals(res.disposition, "ref_applied", "the reference the crew named was answered");
  const stamp = inboundStamps(f)[0];
  const parsed = stamp?.parsed_intent as Record<string, unknown> | null;
  assertEquals(parsed?.path, "ref", "it resolved a reference, it did not ask a question");
  assertEquals(parsed?.prompt_id, "prompt-digest", "17 is the code, and prompt 17 is not a card");
  assertEquals(parsed?.version, 3, "and that prompt's version");
  assertEquals(f.effects.length, 1, "one delay filed");
  assertEquals((f.effects[0].p_effect as { type: string }).type, "report_delay");
  assertEquals(f.effects[0].p_party_id, "party-a", "against the party whose prompt 17 is");
  assert(ref.answered_at, "prompt 17 was consumed");
  assertEquals(card.answered_at ?? null, null, "the site card was left alone");
  assertEquals(dayOf.answered_at ?? null, null, "and so was the other project's morning ask");
  assert(!stamp.needs_review, "nobody was paged");
  assertEquals(stamp.owner_user_id ?? null, null, "and nobody owns it");
});

Deno.test("P1-06(g-syn): DELAY 17 in that world is read identically, so the synonym asymmetry is gone", async () => {
  const seen: Array<Record<string, unknown>> = [];
  for (const body of ["DELAY 17", "LATE 17"]) {
    const { f } = twoCardsAndLiveRefWorld();
    const res = await inboundWithPinnedParse(f, body, "SMp106gsyn" + body.replace(/\W/g, ""));
    const parsed = inboundStamps(f)[0]?.parsed_intent as Record<string, unknown> | null;
    seen.push({ disposition: res.disposition, path: parsed?.path ?? null,
      prompt_id: parsed?.prompt_id ?? null, version: parsed?.version ?? null,
      effects: f.effects.map((e) => (e.p_effect as { type: string }).type),
      needs_review: !!inboundStamps(f)[0]?.needs_review });
  }
  // The claim is not "LATE 17 is handled" — it is "handled IDENTICALLY to DELAY 17".
  assertEquals(seen[1], seen[0], "LATE 17 and DELAY 17 read the same live reference");
  assertEquals(seen[0].disposition, "ref_applied", "and both of them answered it");
});

Deno.test("P1-06(g2): PROBLEM 17 in that world still asks, and sends no apply 00645 would refuse", async () => {
  const { f, card, dayOf, ref } = twoCardsAndLiveRefWorld();
  const rpcNames: string[] = [];
  const rpc = f.h.fake.rpc;
  f.h.fake.rpc = (name: string, args?: Record<string, unknown>) => {
    rpcNames.push(name);
    return rpc(name, args);
  };
  const res = await inboundWithPinnedParse(f, "PROBLEM 17", "SMp106g2");
  assertEquals(res.disposition, "ref_clarify", "PROBLEM 17 asks which prompt is meant");
  const stamps = inboundStamps(f);
  assertEquals(stamps.length, 1, "one inbound row");
  const parsed = stamps[0].parsed_intent as Record<string, unknown> | null;
  assertEquals(parsed?.path ?? null, null, "it bound no reference");
  const selection = (parsed?.selection_intent ?? null) as { options?: Array<{ promptId: string }> } | null;
  assertEquals((selection?.options ?? []).map((o) => o.promptId).sort(),
    ["prompt-card", "prompt-dayof", "prompt-digest"], "every open prompt is offered");
  assert(!stamps[0].needs_review, "never becomes the designer's problem");
  assertEquals(stamps[0].owner_user_id ?? null, null, "owns nobody");
  assertEquals(f.effects.length, 0, "files nothing");
  assertEquals(rpcNames.filter((n) => n === "sms_apply_prompt"), [],
    "and no apply is sent, so 00645 never raises 23514 on it");
  for (const p of [card, dayOf, ref]) assertEquals(p.answered_at ?? null, null, `${p.id} is still waiting`);
});

Deno.test("P1-06(g3): with the rail off, LATE 17 in that world reads the reference exactly as before", async () => {
  // FIELD_LINE_PHASE absent = 0, which is what both new terms sit behind.
  const { f, card, dayOf, ref } = twoCardsAndLiveRefWorld({});
  const res = await inboundWithPinnedParse(f, "LATE 17", "SMp106g3");
  assertEquals(res.disposition, "ref_applied", "Phase 0 reference grammar is untouched");
  const parsed = inboundStamps(f)[0]?.parsed_intent as Record<string, unknown> | null;
  assertEquals(parsed?.prompt_id, "prompt-digest", "NN is the code at phase 0 too");
  assertEquals(f.effects.length, 1, "one delay filed");
  assert(ref.answered_at, "prompt 17 was consumed");
  assertEquals([card, dayOf].filter((p) => p.answered_at).map((p) => p.id), [], "no card was touched");
});

// The exact inbound verifier includes Phase 0 reference/transport regressions.
import "./field-line/inbound-protocol.test.ts";

import "./field-line/inbound-completion.test.ts";
import "./field-line/inbound-completion-boundaries.test.ts";

import "./field-line/inbound-project-context.test.ts";

// ═══════════════════════════════════════════════════════════════════════════
// The homeowner's two answers (US-3 P23/P24)
// ═══════════════════════════════════════════════════════════════════════════
// "YES 31" approves the list she was shown, at the version she was shown it.
// "A 31" / "B 31" / "C 31" records when she can be there. Nothing else she says
// is acted on, and every refusal apply_client_effect can raise has a decided
// answer here — that agreement IS contract P14.

const CLIENT_SID = "SMclient";

function clientStamps(f: ReturnType<typeof clientFixture>): Array<Record<string, unknown>> {
  return (f.h.fake._data.sms_messages ?? []).filter((m: Record<string, unknown>) =>
    m.direction === "inbound" || m.direction == null
  );
}

/** The row the pipeline stamped for her inbound. */
function clientStamp(f: ReturnType<typeof clientFixture>, sid: string): Record<string, unknown> {
  const row = (f.h.fake._data.sms_messages ?? []).find((m: Record<string, unknown>) =>
    m.twilio_sid === sid
  );
  assert(row, `no inbound row for ${sid}`);
  return row as Record<string, unknown>;
}

Deno.test("YES NN approves the batch she was shown, at the version she was shown it", async () => {
  const f = clientFixture();
  const batch = f.batch();
  const ask = f.ask();
  const res = await f.inbound("YES 31", CLIENT_SID);

  assertEquals(res.disposition, "client_selection_approved");
  assertEquals(res.effectApplied, true);
  assertEquals(batch.closed_at !== null, true, "the ask is closed by the answer");
  const decision = f.h.fake._data.client_decisions.find((d: Record<string, unknown>) => d.id === "dec-1")!;
  assertEquals(decision.status, "responded");
  assertEquals(decision.answer, "opt-1", "the option she was shown is the one applied");
  assertEquals(decision.selected_by, null, "a seat is never forged into auth.users");
  assertEquals(ask.answered_at !== null, true, "and her reference is spent");
  assertEquals(ask.consumed_sid, CLIENT_SID);

  // LOW-4: two decision_events rows exist — ours and 00171's status mirror — and
  // exactly one of them names the actor. The pipeline reads neither as a second
  // action; this asserts the shape the fixture models so a future reader of
  // decision_events cannot mistake the twin for one.
  const events = f.h.fake._data.decision_events.filter((e: Record<string, unknown>) =>
    e.decision_id === "dec-1"
  );
  assertEquals(events.length, 2, "one actor row and one status mirror");
  assertEquals(
    events.filter((e: Record<string, unknown>) => e.actor_party_id === "party-c").length,
    1,
    "exactly one row names the party that answered",
  );
  assertEquals(
    events.every((e: Record<string, unknown>) => e.changed_by === null),
    true,
    "and nobody's user id is on either",
  );

  const reply = res.replies?.[0];
  assert(reply, "she is answered");
  assert(/confirmed/i.test(String(reply.message)), `plain words: "${reply.message}"`);
  assertEquals(reply.partyId, "party-c");
  const stamp = clientStamp(f, CLIENT_SID);
  assert(!stamp.needs_review, "an answer the rail could apply is nobody's handoff");
  const parsed = stamp.parsed_intent as Record<string, unknown>;
  assertEquals(parsed.path, "client_ref");
  assertEquals(parsed.effect, "approve_selection");
  assertEquals((parsed.payload as Record<string, unknown>).version, 1);
  assertEquals(f.effects.length, 0, "and the field effect door was never opened");
});

Deno.test("the same inbound delivered twice applies once", async () => {
  const f = clientFixture();
  f.batch();
  f.ask();
  await f.inbound("YES 31", CLIENT_SID);
  const decision = f.h.fake._data.client_decisions.find((d: Record<string, unknown>) => d.id === "dec-1")!;
  const firstAnswer = decision.responded_at;
  const again = await f.inbound("YES 31", CLIENT_SID);
  assertEquals(again.disposition, "already_completed");
  assertEquals(again.effectApplied, true);
  assertEquals(decision.responded_at, firstAnswer, "nothing was applied a second time");
  assertEquals((again.replies ?? []).length, 0, "and she is not told twice");
});

Deno.test("an old reference never changes target: a moved list is refused and handed over", async () => {
  // The batch was re-versioned after the text went out (an option changed). Her
  // reply is written against a list that no longer exists, so NOTHING is applied
  // and the ask stays open for the studio to present again.
  const f = clientFixture();
  const batch = f.batch();
  const ask = f.ask();
  batch.version = 2;
  const res = await f.inbound("YES 31", CLIENT_SID);

  assertEquals(res.disposition, "client_stale_version");
  assertEquals(res.effectApplied ?? false, false);
  assertEquals(batch.closed_at, null, "the ask is still open");
  assertEquals(ask.answered_at ?? null, null, "and so is her reference");
  const decision = f.h.fake._data.client_decisions.find((d: Record<string, unknown>) => d.id === "dec-1")!;
  assertEquals(decision.status, "pending", "no selection was applied");
  const stamp = clientStamp(f, CLIENT_SID);
  assertEquals(stamp.needs_review, true, "the studio is told the list needs re-sending");
  assertEquals(stamp.owner_user_id, "studio-a");
  const parsed = stamp.parsed_intent as Record<string, unknown>;
  assertEquals(parsed.refusal, "stale_version");
  assertEquals((parsed.current as Record<string, unknown>).current_version, 2);
  const reply = res.replies?.[0];
  assert(/changed/i.test(String(reply?.message)), `the truth, plainly: "${reply?.message}"`);
});

/**
 * Her delivery card, and the reference it is answered with. The version is the
 * producer's frozen local YYYYMMDD, because that is what field-daily writes on a
 * window_pick (00645's convention) and what the reply path reads the card's own
 * day off. The proposals are seeded through the fixture's `delivery()`, the one
 * place a window is ever proposed (field_delivery_reports, 00641).
 */
const WINDOW_ASK_DAY = 20261101;
function windowAsk(f: ReturnType<typeof clientFixture>, subjectId: string) {
  return f.ask({
    id: "prompt-w",
    kind: "window_pick",
    subject_id: subjectId,
    short_code: "42",
    version: WINDOW_ASK_DAY,
  });
}

Deno.test("A, B and C on a delivery card record availability and nothing else", async () => {
  // The labels are the ones the card composes from the fixture's two proposals
  // (Nov 3 "2-4" and Nov 5 "morning"), and C names no window at all.
  for (const [option, expected] of [["A", "Nov 3 2-4"], ["B", "Nov 5 morning"], ["C", null]] as const) {
    const f = clientFixture();
    const truck = f.delivery();
    windowAsk(f, truck.subjectId);
    const res = await f.inbound(`${option} 42`, `SMwin${option}`);
    assertEquals(res.disposition, "client_window_recorded", `[${option}]`);
    const rows = f.h.fake._data.delivery_availability;
    assertEquals(rows.length, 1, `[${option}] one availability row`);
    assertEquals(rows[0].option, option);
    assertEquals(rows[0].window_label, expected, `[${option}] the window she was offered`);
    assertEquals(rows[0].subject_kind, "delivery");
    assertEquals(rows[0].subject_id, truck.subjectId, `[${option}] against the delivery`);
    assertEquals(rows[0].recorded_by_party_id, "party-c");
    assertEquals(rows[0].source_sid, `SMwin${option}`);
    // HER ANSWER CARRIES NO VERSION. select_window has no stale door in 00651
    // and wants none: availability against a delivery cannot go out of date the
    // way a reply to a list of picks can.
    const payload = (clientStamp(f, `SMwin${option}`).parsed_intent as Record<string, unknown>)
      .payload as Record<string, unknown>;
    assertEquals(payload.option, option);
    assertEquals("version" in payload, false, `[${option}] nothing about it can go stale`);
    assertEquals(
      "label_drift" in (clientStamp(f, `SMwin${option}`).parsed_intent as Record<string, unknown>),
      false,
      `[${option}] and the label needed no apology`,
    );
    // NOT A CONFIRMATION. Her availability is not the crew saying the sofa
    // arrived: no field effect is filed, no delivery event is touched, and the
    // receiver's own sms_delivery_confirm leg is left exactly where it is.
    assertEquals(f.effects.length, 0, `[${option}] no field effect`);
    assertEquals((f.h.fake._data.delivery_events ?? []).length, 0, `[${option}] no delivery touched`);
    const reply = String(res.replies?.[0]?.message ?? "");
    if (option === "C") {
      assert(/neither/i.test(reply), `C says what it means: "${reply}"`);
    } else {
      assert(reply.includes(expected!), `[${option}] names the window she picked: "${reply}"`);
    }
  }
});

Deno.test("the window recorded for her reply is the one her card printed", async () => {
  // THE PARITY THE DUPLICATION IS HELD TO. field-daily/core.ts's issueWindowPick
  // composes the card and sms-inbound/pipeline.ts's offeredWindows composes it
  // again; this runs BOTH on one fixture and asserts the string recorded for her
  // reply is the string that went down the wire. If the copy ever drifts from
  // core.ts, this fails.
  for (const option of ["A", "B"] as const) {
    const f = clientFixture();
    f.delivery();
    const summary = await f.h.daily();
    assertEquals(summary.client_window_picks_sent, 1, `[${option}] the card went out`);
    const ask = (f.h.fake._data.sms_prompts ?? []).find((row: Record<string, unknown>) =>
      row.kind === "window_pick"
    )!;
    assert(ask, `[${option}] there is a reference to answer`);
    const card = f.h.provider.requests
      .filter((r) => r.url.includes("/Messages.json"))
      .map((r) => new URLSearchParams(String(r.init?.body ?? "")))
      .filter((p) => p.get("To") === CLIENT_PHONE)
      .map((p) => p.get("Body") ?? "")
      .find((body) => body.includes("delivery for"))!;
    assert(card, `[${option}] a card reached her`);

    const res = await f.inbound(`${option} ${ask.short_code}`, `SMparity${option}`);
    assertEquals(res.disposition, "client_window_recorded", `[${option}]`);
    const recorded = String(
      f.h.fake._data.delivery_availability.find((row: Record<string, unknown>) =>
        row.source_sid === `SMparity${option}`
      )!.window_label,
    );
    assert(
      card.includes(`Reply A (`) && card.includes(`), or C for neither`),
      `the card prints both windows: "${card}"`,
    );
    assert(
      card.includes(option === "A" ? `Reply A (${recorded})` : `B (${recorded})`),
      `[${option}] recorded "${recorded}", card said "${card}"`,
    );
  }
});

Deno.test("proposals that changed since the card record the letter and admit the label is unknown", async () => {
  // SHE IS NOT RECORDED AGAINST A WINDOW SHE NEVER READ. Each shape below breaks
  // the card's composition in one way AFTER it went out; her letter is still
  // recorded, window_label is NULL, and the receipt says why.
  const shapes: Array<{
    name: string;
    break: (f: ReturnType<typeof clientFixture>) => void;
    drift: string;
  }> = [
    {
      name: "a window withdrawn",
      drift: "proposals_changed",
      break: (f) => {
        f.h.fake._data.field_delivery_reports = f.h.fake._data.field_delivery_reports
          .filter((row: Record<string, unknown>) => row.id !== "fdr-task-delivery-2");
      },
    },
    {
      name: "a window re-worded in place after the card",
      drift: "proposals_changed",
      break: (f) => {
        const row = f.h.fake._data.field_delivery_reports
          .find((r: Record<string, unknown>) => r.id === "fdr-task-delivery-1")!;
        // apply_field_effect stamps availability_at whenever it rewrites a
        // proposal (00641:432-436), so a proposal younger than the reference is
        // one the card cannot have printed.
        row.proposed_window = "3-5";
        row.availability_at = "2026-11-01T15:00:00.000Z";
      },
    },
    {
      name: "two proposals that now print the same words",
      drift: "proposals_changed",
      break: (f) => {
        const row = f.h.fake._data.field_delivery_reports
          .find((r: Record<string, unknown>) => r.id === "fdr-task-delivery-2")!;
        row.proposed_date = "2026-11-03";
        row.proposed_window = "2-4";
      },
    },
  ];

  for (const shape of shapes) {
    const f = clientFixture();
    const truck = f.delivery();
    windowAsk(f, truck.subjectId);
    shape.break(f);
    const res = await f.inbound("A 42", "SMdrift");
    assertEquals(res.disposition, "client_window_recorded", `[${shape.name}] she is still answered`);
    assertEquals(res.effectApplied, true, `[${shape.name}] and her letter is on the record`);
    const rows = f.h.fake._data.delivery_availability;
    assertEquals(rows.length, 1, `[${shape.name}] one availability row`);
    assertEquals(rows[0].option, "A", `[${shape.name}] the letter she sent`);
    assertEquals(rows[0].window_label, null, `[${shape.name}] and no invented window`);
    const parsed = clientStamp(f, "SMdrift").parsed_intent as Record<string, unknown>;
    assertEquals(parsed.label_drift, shape.drift, `[${shape.name}] the receipt says why`);
    assertEquals(
      "window_label" in (parsed.payload as Record<string, unknown>),
      false,
      `[${shape.name}] nothing was sent for SQL to record`,
    );
    // She is told what she picked in the only words that are still true.
    assert(
      /option A/.test(String(res.replies?.[0]?.message ?? "")),
      `[${shape.name}] "${res.replies?.[0]?.message}"`,
    );
  }
});

Deno.test("a reference that is not a delivery card's cannot name a window either", async () => {
  // A window_pick whose version is not the producer's frozen YYYYMMDD names no
  // day to compose against, so there is nothing to read and nothing is guessed.
  const f = clientFixture();
  const truck = f.delivery();
  f.ask({
    id: "prompt-w",
    kind: "window_pick",
    subject_id: truck.subjectId,
    short_code: "42",
    version: 1,
  });
  const res = await f.inbound("B 42", "SMnoday");
  assertEquals(res.disposition, "client_window_recorded");
  assertEquals(f.h.fake._data.delivery_availability[0].option, "B");
  assertEquals(f.h.fake._data.delivery_availability[0].window_label, null);
  assertEquals(
    (clientStamp(f, "SMnoday").parsed_intent as Record<string, unknown>).label_drift,
    "proposals_changed",
  );
});

Deno.test("anything else a homeowner says goes to a person, not a parser", async () => {
  // Two shapes: a word the card never printed on an open reference, and a
  // sentence with no reference at all.
  const onRef = clientFixture();
  onRef.batch();
  onRef.ask();
  const odd = await onRef.inbound("MAYBE 31", "SMmaybe");
  assertEquals(odd.disposition, "needs_review");
  const oddStamp = clientStamp(onRef, "SMmaybe");
  assertEquals(oddStamp.needs_review, true);
  assertEquals((oddStamp.parsed_intent as Record<string, unknown>).path, "client_unreadable");
  assertEquals(onRef.h.fake._data.client_decisions[0].status, "pending", "nothing applied");

  const freeform = clientFixture();
  const chat = await freeform.inbound("Can we talk about the rug?", "SMchat");
  assertEquals(chat.disposition, "needs_review");
  const chatStamp = clientStamp(freeform, "SMchat");
  assertEquals(chatStamp.needs_review, true);
  assertEquals(chatStamp.owner_user_id, "studio-a");
  assertEquals((chatStamp.parsed_intent as Record<string, unknown>).path, "client_freeform");
  assertEquals(freeform.effects.length, 0, "the field parser never saw it");
  assert(
    /get back to you/i.test(String(chat.replies?.[0]?.message ?? "")),
    "and she is told a person has it",
  );
});

// ── P14: every refusal apply_client_effect can raise has a decided answer ────
//
// Each row below breaks the world in ONE way, and asserts three things: she gets
// a truthful line, nothing is applied, and the studio is handed the thread with
// the SQLSTATE on the row when the refusal is not one the rail can explain.

Deno.test("P14: the refusal set of apply_client_effect and the pipeline agree", async () => {
  const cases: Array<{
    name: string;
    disposition: string;
    named: boolean;
    reply: RegExp;
    break: (f: ReturnType<typeof clientFixture>) => void;
  }> = [
    {
      name: "no_capability",
      disposition: "client_no_capability",
      named: true,
      reply: /isn't working/i,
      break: (f) => { f.h.fake._data.client_links = []; },
    },
    {
      name: "capability_wrong_project",
      disposition: "client_wrong_project",
      named: true,
      reply: /another project/i,
      break: (f) => {
        const link = f.h.fake._data.client_links[0];
        link.project_id = "project-b";
        (link.scope as { project_id: string }).project_id = "project-b";
      },
    },
    {
      name: "capability_expired_or_revoked",
      disposition: "client_capability_expired",
      named: true,
      reply: /expired/i,
      break: (f) => { f.h.fake._data.client_links[0].status = "revoked"; },
    },
    {
      name: "letter_revoked",
      disposition: "client_letter_revoked",
      named: true,
      reply: /replaced/i,
      break: (f) => { f.h.fake._data.client_invitations[0].revoked_at = "2026-10-30T00:00:00.000Z"; },
    },
    {
      name: "letter_superseded",
      disposition: "client_letter_revoked",
      named: true,
      reply: /replaced/i,
      break: (f) => { f.h.fake._data.client_invitations[0].superseded_by = "inv-d"; },
    },
    {
      name: "batch_not_addressed",
      disposition: "client_not_addressed",
      named: true,
      reply: /isn't yours/i,
      break: (f) => { f.h.fake._data.client_decision_batches[0].party_id = "party-a"; },
    },
    {
      name: "decision_other_household",
      disposition: "client_other_household",
      named: true,
      reply: /another client/i,
      break: (f) => { f.h.fake._data.client_decisions[0].designer_client_id = "household-2"; },
    },
    {
      name: "decision_other_project",
      disposition: "client_effect_failed",
      named: false,
      reply: /didn't save/i,
      break: (f) => { f.h.fake._data.client_decisions[0].project_id = "project-b"; },
    },
    {
      name: "not_a_client_selection",
      disposition: "client_effect_failed",
      named: false,
      reply: /didn't save/i,
      break: (f) => { f.h.fake._data.client_decisions[0].court = "designer"; },
    },
    {
      name: "approval_contract_not_textable",
      disposition: "client_effect_failed",
      named: false,
      reply: /didn't save/i,
      break: (f) => { f.h.fake._data.client_decisions[0].approval_contract = "contract-1"; },
    },
    {
      name: "no_single_presented_option",
      disposition: "client_effect_failed",
      named: false,
      reply: /didn't save/i,
      break: (f) => { f.h.fake._data.client_decision_options[1].is_recommended = true; },
    },
    {
      name: "batch missing",
      disposition: "client_effect_failed",
      named: false,
      reply: /didn't save/i,
      break: (f) => { f.h.fake._data.client_decision_batches = []; },
    },
  ];

  for (const testCase of cases) {
    const tag = `[${testCase.name}]`;
    const f = clientFixture();
    f.batch();
    f.ask();
    testCase.break(f);
    const sid = `SMp14${testCase.name.replace(/\W/g, "")}`;
    const res = await f.inbound("YES 31", sid);
    assertEquals(res.disposition, testCase.disposition, `${tag} disposition`);
    assertEquals(res.effectApplied ?? false, false, `${tag} nothing was applied`);
    const reply = String(res.replies?.[0]?.message ?? "");
    assert(testCase.reply.test(reply), `${tag} the line she gets: "${reply}"`);
    assert(
      !/42501|23514|22023|capability|scope|batch_|SQLSTATE/i.test(reply),
      `${tag} she is never shown the plumbing: "${reply}"`,
    );
    const stamp = clientStamp(f, sid);
    assertEquals(stamp.needs_review, true, `${tag} the studio is handed the thread`);
    assertEquals(stamp.owner_user_id, "studio-a", `${tag} and it has an owner`);
    const parsed = stamp.parsed_intent as Record<string, unknown>;
    if (testCase.named) {
      assertEquals(parsed.path, "client_refused", `${tag} recorded as a named refusal`);
      assert(parsed.refusal, `${tag} the refusal is named on the row`);
    } else {
      assertEquals(parsed.path, "client_effect_failed", `${tag} recorded as a failure`);
      assert(parsed.sqlstate, `${tag} with the SQLSTATE the database gave`);
      assert(parsed.sql_message, `${tag} and what it said`);
    }
    assertEquals(f.effects.length, 0, `${tag} the field door stayed shut`);
  }
});

Deno.test("P14: a closed or expired reference is answered as itself", async () => {
  const closed = clientFixture();
  closed.batch({ closed_at: "2026-11-01T13:00:00.000Z" });
  closed.ask();
  const closedRes = await closed.inbound("YES 31", "SMclosed");
  assertEquals(closedRes.disposition, "ref_closed");
  assertEquals(closed.effects.length, 0);
  assert(!clientStamp(closed, "SMclosed").needs_review, "a closed ask is nobody's handoff");

  // A reference that ran out is answered as CLOSED, one gate earlier: every read
  // that decides which prompts are open carries expires_at > now (contract P14),
  // so sms_resolve_prompt hands back nothing and the rail's own closed-ref reply
  // names the newest reference she CAN answer. apply_client_effect's `expired`
  // is therefore only reachable as a race — the reference running out between
  // that read and the apply — and the branch that answers it exists for exactly
  // that. Either way nothing is applied and nobody is paged.
  const expired = clientFixture();
  const expiredBatch = expired.batch();
  expired.ask({ expires_at: "2026-10-01T00:00:00.000Z" });
  const expiredRes = await expired.inbound("YES 31", "SMexpired");
  assertEquals(expiredRes.disposition, "ref_closed");
  assertEquals(expiredBatch.closed_at, null, "and the ask is left open");
  assertEquals(expired.h.fake._data.client_decisions[0].status, "pending");
  assert(!clientStamp(expired, "SMexpired").needs_review, "a run-out reference pages nobody");
});

Deno.test("P14: an inbound with no provider id is retried, never guessed at", async () => {
  // apply_client_effect refuses without a SID because it cannot be made
  // idempotent; answering 503 keeps the inbound identity and lets Twilio
  // redeliver, which is the only outcome that applies her answer exactly once.
  const f = clientFixture();
  f.batch();
  f.ask();
  const res = await f.h.processInbound({ Body: "YES 31", MessageSid: "", From: CLIENT_PHONE });
  assertEquals(res.status, 503);
  assertEquals(f.h.fake._data.client_decisions[0].status, "pending", "nothing applied");
});

// ── SQ-114: the rail she is on is not always running ─────────────────────────
//
// The all-client freeform branch and the consent pre-check are BOTH phase-2
// behaviour, and the acknowledgement each of them composes is itself a
// client-kind send. Three states have to be told apart: the rail live (above),
// the rail not live yet, and the rail stopped by its own switch.

Deno.test("below phase 2 a client seat keeps the rail it has always been on", async () => {
  // A `client` seat can predate this rail by a year (00419) — and at phase 0/1
  // GATE 3b refuses every text to one, the pipeline's own acknowledgement
  // included. Taking her off the trade path here would trade the line she used
  // to get for a handoff and silence, so below phase 2 the client branch does
  // not run: her message goes down exactly the path it went down before the
  // homeowner rail existed.
  const f = clientFixture({ env: { FIELD_LINE_PHASE: "1" } });
  const res = await f.inbound("Can we talk about the rug?", "SMphase1");
  const stamp = clientStamp(f, "SMphase1");
  const parsed = stamp.parsed_intent as Record<string, unknown>;
  assertEquals(parsed.path, "llm", `the pre-client path took it: ${JSON.stringify(parsed)}`);
  assertEquals(res.disposition, "needs_review");
  assert(
    /get back to you/i.test(String(res.replies?.[0]?.message ?? "")),
    `and it answers her as it always did: "${res.replies?.[0]?.message}"`,
  );
  assertEquals(f.effects.length, 0, "no effect either way");
});

Deno.test("with the campaign flag down her message is handed over, naming the gate", async () => {
  // FIELD_LINE_CAMPAIGN_APPROVED down is how the homeowner rail is stopped
  // mid-flight (P24). Nothing may be texted to her — but her message must not
  // vanish: the needs_review row says which gate withheld the answer, so the
  // person reading it knows she is waiting.
  const f = clientFixture({ env: { FIELD_LINE_CAMPAIGN_APPROVED: "0" } });
  const res = await f.inbound("Can we talk about the rug?", "SMflagdown");
  assertEquals(res.disposition, "client_reply_withheld");
  assertEquals((res.replies ?? []).length, 0, "no text is composed for a gate that refuses it");
  const stamp = clientStamp(f, "SMflagdown");
  assertEquals(stamp.needs_review, true, "a person still has it");
  assertEquals(stamp.owner_user_id, "studio-a");
  const parsed = stamp.parsed_intent as Record<string, unknown>;
  assertEquals(parsed.path, "client_freeform");
  assertEquals(parsed.reply_withheld, "campaign_not_approved", "and the row names the gate");
  assertEquals(f.effects.length, 0);
});

Deno.test("a reply her consent no longer carries is handed over, never answered", async () => {
  // Two shapes of refusal, and one control. In both refusals NOTHING is applied
  // and NOTHING is texted back — answering a withdrawn consent by text is the
  // one thing that must not happen — and in both the thread is handed to the
  // person who owns the project with the reason on it (SQ-111 LOW-3: it used to
  // be dropped with no handoff at all).
  const refusals: Array<[string, string, (f: ReturnType<typeof clientFixture>) => void]> = [
    ["opted_out", "SMoptout", (f) => {
      f.h.fake._data.studio_channel_consent
        .find((row: Record<string, unknown>) => row.channel_value === CLIENT_PHONE)!.status = "opted_out";
    }],
    ["consent_evidence_required", "SMunsigned", (f) => {
      const row = f.h.fake._data.studio_channel_consent
        .find((r: Record<string, unknown>) => r.channel_value === CLIENT_PHONE)!;
      delete row.source;
      delete row.recorded_by;
    }],
  ];
  for (const [refusal, sid, breakIt] of refusals) {
    const f = clientFixture();
    const batch = f.batch();
    const ask = f.ask();
    breakIt(f);
    const res = await f.inbound("YES 31", sid);
    assertEquals(res.disposition, "not_consented", refusal);
    assertEquals((res.replies ?? []).length, 0, `[${refusal}] she is not answered by text`);
    assertEquals(f.h.fake._data.client_decisions[0].status, "pending", `[${refusal}] nothing applied`);
    assertEquals(batch.closed_at, null, `[${refusal}] the ask is untouched`);
    assertEquals(ask.answered_at ?? null, null, `[${refusal}] and so is her reference`);
    const stamp = clientStamp(f, sid);
    assertEquals(stamp.needs_review, true, `[${refusal}] a person has it`);
    assertEquals(stamp.owner_user_id, "studio-a", `[${refusal}] and it has an owner`);
    const parsed = stamp.parsed_intent as Record<string, unknown>;
    assertEquals(parsed.path, "client_consent_refused", refusal);
    assertEquals(parsed.refusal, refusal, `[${refusal}] the row says which refusal it was`);
    assertEquals(parsed.prompt_kind, "selection_batch", `[${refusal}] and what she was answering`);
  }

  // The kickoff tick, witnessed: the same reply applies and she IS answered.
  const ok = clientFixture();
  ok.batch();
  ok.ask();
  const good = await ok.inbound("YES 31", "SMconsented");
  assertEquals(good.disposition, "client_selection_approved");
  assertEquals(ok.h.fake._data.client_decisions[0].status, "responded");
});
