// Deno test for the sms-inbound pipeline (compliance keywords, idempotency,
// menu replies, and the LLM confidence gate with a stubbed parser).
// Run: deno test --no-check -A supabase/functions/_tests/sms-inbound.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound, type InboundParams } from "../sms-inbound/pipeline.ts";
import type { FieldParseResult } from "../_shared/field-parse.ts";
import { createFakeSupabase, type FakeSupabase } from "./fake-supabase.ts";

const TO = "+15559990000";
const NO_POSTHOG = () => undefined; // keep captureServerEvent off the network

function baseSeed(extra: Record<string, unknown[]> = {}) {
  return {
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    profiles: [{ id: "dz1", full_name: "Dana Designer" }],
    email_templates: [
      { slug: "sms_optin_confirm", is_active: true, html_content: "You're set {{party_first_name}} for {{project_name}}." },
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
      { id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "proj2", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551110000", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
      { id: "p2", phone_e164: "+15551110000", project_id: "proj2", party_kind: "installer", sms_consent_status: "granted" },
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
  // STOP does not reply (Twilio Advanced Opt-Out already did).
  assert(!res.twiml.includes("<Message>"));
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
        id: "p1",
        phone_e164: "+15551110044",
        project_id: "proj1",
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
    .find((p) => p.id === "p1")!;
  assertEquals(p1.sms_consent_status, "granted");
  assertEquals(p1.sms_consent_source, "written");
  assertEquals(p1.sms_consent_evidence, "Signed the Lindqvist kickoff form");
});

// The keyword the person actually sent is the words on the record.
Deno.test("an UNSUBSCRIBE stamps its own keyword on the record, not a generic STOP", async () => {
  const fake = createFakeSupabase(baseSeed({
    project_parties: [
      { id: "p1", phone_e164: "+15551110045", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
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
      { id: "p1", phone_e164: "+15551110001", project_id: "proj1", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
    ],
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
  const p1 = (fake._data.project_parties as Array<{ id: string; sms_consent_status: string }>).find((p) => p.id === "p1")!;
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
        id: "p1",
        phone_e164: "+15551110033",
        project_id: "proj1",
        party_kind: "sub",
        sms_consent_status: "pending",
        display_name: "Sal Sub",
        sms_consent_source: "written",
        sms_consent_evidence: "Signed the studio's field-SMS form",
        sms_consent_disclosure_version: "field-sms-v1",
        sms_consent_recorded_by: "dz1",
      },
    ],
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
        { id: "p1", phone_e164: "+15551110002", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_conversations: [
        {
          id: "conv1", twilio_number: TO, phone_e164: "+15551110002", state: "idle",
          active_project_id: "proj1", party_id: "p1",
          state_context: { menu: [{ n: 1, kind: "task", id: "task1", project_id: "proj1" }], menu_created_at: now.toISOString() },
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: 'Marked "Vanity" done.', remaining_count: 2 }, error: null }; } },
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

// ── LLM confidence gate ──────────────────────────────────────────────────────
function llmScenario(confidence: number) {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake = createFakeSupabase(
    baseSeed({
      project_parties: [
        { id: "p1", phone_e164: "+15551110003", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
      ],
      project_tasks: [
        { id: "task1", title: "Install vanity", due_date: null, owner_party_id: "p1", status: "todo", project_id: "proj1" },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Marked done.", remaining_count: 0 }, error: null }; } },
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
  const conv = (fake._data.sms_conversations as Array<{ state: string; state_context: { pending_effect?: unknown } }>)[0];
  assertEquals(conv.state, "awaiting_confirmation");
  assert(conv.state_context.pending_effect, "effect parked");
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
      { id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "proj2", name: "Feldman", designer_id: "dz1", studio_id: "org-alpha" },
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551110004", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
      { id: "p2", phone_e164: "+15551110004", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
    ],
    project_tasks: [
      { id: "task1", title: "Set the vanity", due_date: null, owner_party_id: "p1", status: "todo", project_id: "proj1" },
      { id: "task2", title: "Confirm the number", due_date: null, owner_party_id: "p2", status: "todo", project_id: "proj2" },
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
      id: "conv1", twilio_number: TO, phone_e164: "+15551110004", state: "idle",
      active_project_id: null, party_id: "p2",
      state_context: { project_pin: { project_id: "proj2", at: "2026-08-12T11:00:00.000Z" } },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Got it.", remaining_count: 0 }, error: null }; } },
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
  assertEquals(rpcCalls[0].p_party_id, "p2");
  assertEquals(seenItems.map((i) => i.id), ["task2"], "candidate items scoped to the pinned project");
});

Deno.test("a stale project_pin (>4h) falls back to the chooser", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "conv1", twilio_number: TO, phone_e164: "+15551110004", state: "idle",
      active_project_id: "proj2", party_id: "p2",
      state_context: { project_pin: { project_id: "proj2", at: "2026-08-12T04:00:00.000Z" } },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Got it.", remaining_count: 0 }, error: null }; } },
  );
  const res = await processInbound(
    params({ From: "+15551110004", Body: "framing's roughed in", MessageSid: "SMstale" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn: chooserTriggeringParse() as never, now: PIN_NOW },
  );
  assertEquals(res.disposition, "project_chooser");
  assertEquals(rpcCalls.length, 0);
  assert(res.twiml.includes("Which project?"));
});

Deno.test("chooser resolution processes the stashed triggering text and preserves state_context.menu", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "conv1", twilio_number: TO, phone_e164: "+15551110004", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
        pending_body: "cant get the number until Thursday",
        menu: [{ n: 1, kind: "task", id: "digest1", project_id: "proj1" }],
        menu_created_at: "2026-08-12T00:00:00.000Z",
      },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Got it.", remaining_count: 0 }, error: null }; } },
  );
  const parseFn = (): Promise<FieldParseResult> =>
    Promise.resolve({ intent: "note", target_ref: null, new_date: null, note: "cant get the number until Thursday", confidence: 0.9 });
  const res = await processInbound(
    params({ From: "+15551110004", Body: "2", MessageSid: "SMchoice" }),
    { supabase: fake as never, getEnv: NO_POSTHOG, parseFn },
  );
  // The chosen project's stashed freeform text is processed now — not a
  // second "text me your update" brush-off — and the pipeline never asks
  // "which project" again.
  assertEquals(res.disposition, "applied");
  assertEquals(rpcCalls.length, 1);
  assert(!res.twiml.includes("Text me your update"));
  assert(!res.twiml.includes("Which project?"));
  const conv = (fake._data.sms_conversations as Array<{ state: string; active_project_id: string; state_context: { menu?: unknown; chooser?: unknown; pending_body?: unknown } }>)[0];
  assertEquals(conv.state, "idle");
  assertEquals(conv.active_project_id, "proj2");
  assert(conv.state_context.menu, "digest menu preserved through the chooser resolution");
  assertEquals(conv.state_context.chooser, undefined);
  assertEquals(conv.state_context.pending_body, undefined);
  assertEquals(
    (conv.state_context as { project_pin?: { project_id?: string } }).project_pin?.project_id,
    "proj2",
    "the explicit pick writes the pin",
  );
});

Deno.test("an MMS with no caption replays the stashed media, not a brush-off", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "conv1", twilio_number: TO, phone_e164: "+15551110004", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/m1/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Logged the photo.", remaining_count: 0 }, error: null }; } },
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
  assertEquals(effect.media, ["project/proj2/sms/m1/0.jpg"], "stashed media carried into the effect, re-homed");
  assertEquals(rpcCalls[0].p_party_id, "p2");
});

Deno.test("STOP while awaiting a project choice still opts out", async () => {
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "conv1", twilio_number: TO, phone_e164: "+15551110004", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
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
      id: "conv1", twilio_number: TO, phone_e164: "+15551110004", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
        pending_body: "cant get the number until Thursday",
      },
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Got it.", remaining_count: 0 }, error: null }; } },
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
      id: "conv1", twilio_number: TO, phone_e164: "+15551110005", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/m1/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "p1", phone_e164: "+15551110005", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
        { id: "p2", phone_e164: "+15551110005", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
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
  assert(effect.media?.includes("project/proj2/sms/m1/0.jpg"), "stashed media survives (re-homed)");
  assertEquals(effect.media?.length, 2, "merged, not overwritten");
  const ownPath = effect.media?.find((p) => p !== "project/proj2/sms/m1/0.jpg");
  assert(
    ownPath?.startsWith("project/proj2/sms/") && !ownPath.startsWith("holding/"),
    "the pick-reply's own MMS is ALSO re-homed, not stranded at its ingest-time holding/ path",
  );
});

Deno.test("MMS storage path prefers a fresh project_pin over active_project_id and the single-project fallback", async () => {
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      // active_project_id is deliberately the OTHER project — a stale value
      // that must not win over the fresh, explicit pin.
      id: "conv1", twilio_number: TO, phone_e164: "+15551110006", state: "idle",
      active_project_id: "proj1", party_id: "p2",
      state_context: { project_pin: { project_id: "proj2", at: "2026-08-12T11:00:00.000Z" } },
    }, {
      project_parties: [
        { id: "p1", phone_e164: "+15551110006", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
        { id: "p2", phone_e164: "+15551110006", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
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
  assert(upload.path.startsWith("project/proj2/"), `expected proj2 (the pin), got ${upload.path}`);
});

Deno.test("MMS storage path falls back to holding/ when multi-project and no fresh pin", async () => {
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "conv1", twilio_number: TO, phone_e164: "+15551110007", state: "idle",
      active_project_id: "proj1", party_id: null,
      state_context: {},
    }, {
      project_parties: [
        { id: "p1", phone_e164: "+15551110007", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
        { id: "p2", phone_e164: "+15551110007", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
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
      id: "conv1", twilio_number: TO, phone_e164: "+15551110008", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/origmsg1/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "p1", phone_e164: "+15551110008", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
        { id: "p2", phone_e164: "+15551110008", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        {
          id: "origmsg1", conversation_id: "conv1", direction: "inbound", body: "",
          media: [{ path: "holding/conv1/origmsg1/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
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
  assertEquals(fake._moves[0].to, "project/proj2/sms/origmsg1/0.jpg");
  const effect = rpcCalls[0].p_effect as { media?: string[] };
  assertEquals(effect.media, ["project/proj2/sms/origmsg1/0.jpg"], "the effect carries the NEW path");
  const origRow = (fake._data.sms_messages as Array<{ id: string; media: Array<{ path: string }> }>)
    .find((m) => m.id === "origmsg1")!;
  assertEquals(origRow.media[0].path, "project/proj2/sms/origmsg1/0.jpg", "originating row's media path is re-homed too");
});

Deno.test("a re-home move failure keeps the holding path and still replies (does not crash)", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "conv1", twilio_number: TO, phone_e164: "+15551110009", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/origmsg2/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "p1", phone_e164: "+15551110009", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
        { id: "p2", phone_e164: "+15551110009", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        {
          id: "origmsg2", conversation_id: "conv1", direction: "inbound", body: "",
          media: [{ path: "holding/conv1/origmsg2/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
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
      id: "conv1", twilio_number: TO, phone_e164: "+15551110011", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/origmsgA/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "p1", phone_e164: "+15551110011", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
        { id: "p2", phone_e164: "+15551110011", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        {
          id: "origmsgA", conversation_id: "conv1", direction: "inbound", body: "",
          media: [{ path: "holding/conv1/origmsgA/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
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
    { bucket: "field-media", from: "holding/conv1/origmsgA/0.jpg", to: "project/proj2/sms/origmsgA/0.jpg" },
  );
  assertEquals(
    fake._moves[1],
    { bucket: "field-media", from: "project/proj2/sms/origmsgA/0.jpg", to: "holding/conv1/origmsgA/0.jpg" },
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
      id: "conv1", twilio_number: TO, phone_e164: "+15551110012", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
        pending_body: "",
        pending_media: [{ path: "holding/conv1/origmsgB/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
      },
    }, {
      project_parties: [
        { id: "p1", phone_e164: "+15551110012", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
        { id: "p2", phone_e164: "+15551110012", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        {
          id: "origmsgB", conversation_id: "conv1", direction: "inbound", body: "",
          // A prior attempt already moved the object but its repoint crashed
          // before landing — the row still (stale-ly) points at holding/.
          media: [{ path: "holding/conv1/origmsgB/0.jpg", content_type: "image/jpeg", twilio_url: "https://x/0" }],
        },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
  );
  fake._missingSourceFor!.add("holding/conv1/origmsgB/0.jpg");
  fake._storageFiles!.add("field-media:project/proj2/sms/origmsgB/0.jpg");
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
    ["project/proj2/sms/origmsgB/0.jpg"],
    "treated as already-moved; the effect carries the project path",
  );
  const origRow = (fake._data.sms_messages as Array<{ id: string; media: Array<{ path: string }> }>)
    .find((m) => m.id === "origmsgB")!;
  assertEquals(
    origRow.media[0].path,
    "project/proj2/sms/origmsgB/0.jpg",
    "the stale row is finally repointed on this retry",
  );
});

Deno.test("attribution on replay: parsed_intent/confidence stamp the ORIGINAL stashed message, not the digit reply", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const fake: FakeSupabase = createFakeSupabase(
    multiProjectSeed({
      id: "conv1", twilio_number: TO, phone_e164: "+15551110010", state: "awaiting_project_choice",
      active_project_id: null, party_id: null,
      state_context: {
        chooser: [{ n: 1, project_id: "proj1", party_id: "p1" }, { n: 2, project_id: "proj2", party_id: "p2" }],
        pending_body: "roof leak in the attic",
        pending_message_id: "origmsg3",
      },
    }, {
      project_parties: [
        { id: "p1", phone_e164: "+15551110010", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
        { id: "p2", phone_e164: "+15551110010", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
      ],
      sms_messages: [
        { id: "origmsg3", conversation_id: "conv1", direction: "inbound", body: "roof leak in the attic", created_at: "2026-08-12T11:59:00.000Z" },
      ],
    }),
    { apply_field_effect: (args) => { rpcCalls.push(args); return { data: { summary_text: "Logged.", remaining_count: 0 }, error: null }; } },
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
  assertEquals(rpcCalls[0].p_sms_message_id, "origmsg3", "apply_field_effect provenance points at the original message");

  const messages = fake._data.sms_messages as Array<
    { id: string; twilio_sid?: string; parsed_intent?: unknown; confidence?: number; body: string }
  >;
  const origRow = messages.find((m) => m.id === "origmsg3")!;
  assert(origRow.parsed_intent, "the ORIGINAL stashed message is stamped");
  assertEquals(origRow.confidence, 0.9);

  const digitRow = messages.find((m) => m.twilio_sid === "SMattrib")!;
  assertEquals(digitRow.parsed_intent, undefined, "the digit reply is never stamped");

  assert(
    !seenRecent.some((m) => m.body === "roof leak in the attic"),
    "the replayed original text is excluded from the LLM's recent-history feed",
  );
});

// ── studio-scoped consent records (migration 00594) ─────────────────────────

Deno.test("STOP writes an opted_out consent record for every studio holding the phone", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [
      { id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "proj2", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
      { id: "proj3", name: "Alpha job 2", designer_id: "dz1", studio_id: "org-alpha" },
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551110010", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
      { id: "p2", phone_e164: "+15551110010", project_id: "proj2", party_kind: "sub", sms_consent_status: "granted" },
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
      { id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "proj2", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551110011", project_id: "proj1", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
      { id: "p2", phone_e164: "+15551110011", project_id: "proj2", party_kind: "sub", sms_consent_status: "not_asked", display_name: "Sal Sub" },
    ],
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

Deno.test("START re-grants per studio and keeps the earlier opt-out date", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "p1", phone_e164: "+15551110012", project_id: "proj1", party_kind: "sub", sms_consent_status: "opted_out" },
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
      origin_project_id: "proj1",
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
      { id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "proj2", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551110020", project_id: "proj1", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
      { id: "p2", phone_e164: "+15551110020", project_id: "proj2", party_kind: "sub", sms_consent_status: "pending", display_name: "Sal Sub" },
    ],
  }));
  // Only org-alpha's row is pending at the moment of the YES.
  (fake._data.project_parties as Array<{ id: string; sms_consent_status: string }>)
    .find((p) => p.id === "p2")!.sms_consent_status = "not_asked";

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
  assertEquals(parties.find((p) => p.id === "p1")!.sms_consent_status, "pending");
  assertEquals(parties.find((p) => p.id === "p2")!.sms_consent_status, "not_asked");
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
        { id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: null },
      ],
      organization_members: [
        { user_id: "dz1", organization_id: "org-alpha", role: "owner", status: "active", joined_at: "2025-01-01T00:00:00Z" },
      ],
      organizations: [{ id: "org-alpha", type: "design_studio" }],
      project_parties: [
        { id: "p1", phone_e164: "+15551110021", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
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
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "p1", phone_e164: "+15551110030", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
    ],
    studio_channel_consent: [
      {
        organization_id: "org-alpha",
        channel_kind: "sms",
        channel_value: "+15551110030",
        status: "granted",
        origin_project_id: "proj1",
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
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "p1", phone_e164: "+15551110031", project_id: "proj1", party_kind: "sub", sms_consent_status: "opted_out" },
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
      { id: "p1", phone_e164: "+15551110032", project_id: "proj9", party_kind: "sub", sms_consent_status: "granted" },
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
      { id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" },
      { id: "proj2", name: "Beta job", designer_id: "dz2", studio_id: "org-beta" },
    ],
    project_parties: [
      { id: "p1", phone_e164: "+15551110040", project_id: "proj1", party_kind: "sub", sms_consent_status: "opted_out" },
      { id: "p2", phone_e164: "+15551110040", project_id: "proj2", party_kind: "sub", sms_consent_status: "not_asked" },
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
  assertEquals(parties.find((p) => p.id === "p1")!.sms_consent_status, "opted_out");
  assertEquals(parties.find((p) => p.id === "p2")!.sms_consent_status, "not_asked");
});

Deno.test("START grants a studio whose record is pending (the invite it answers)", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "p1", phone_e164: "+15551110041", project_id: "proj1", party_kind: "sub", sms_consent_status: "pending" },
    ],
    studio_channel_consent: [
      { organization_id: "org-alpha", channel_kind: "sms", channel_value: "+15551110041", status: "pending" },
    ],
  }));
  const res = await processInbound(
    params({ From: "+15551110041", Body: "START", MessageSid: "SMstartpending" }),
    { supabase: fake as never, getEnv: NO_POSTHOG },
  );
  assertEquals(res.disposition, "resubscribed");
  const consent = (fake._data.studio_channel_consent ?? []) as Array<{ organization_id: string; status: string }>;
  assertEquals(consent.length, 1);
  assertEquals(consent[0].status, "granted");
});

Deno.test("START mints no consent record for a seat-holding studio that has none", async () => {
  const fake = createFakeSupabase(baseSeed({
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "p1", phone_e164: "+15551110042", project_id: "proj1", party_kind: "sub", sms_consent_status: "not_asked" },
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
  assertEquals(parties.find((p) => p.id === "p1")!.sms_consent_status, "not_asked");
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
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "p1", phone_e164: "+15551110051", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
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
      { id: "p1", phone_e164: "+15551110060", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
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
      { id: "p1", phone_e164: "+15551110061", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
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
      { id: "p1", phone_e164: phone, project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
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
      projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
      project_parties: [
        // org-alpha holds a seat and NO record: "text updates" was never
        // ticked, so record_channel_invite was never called. The attribution
        // read is the only leg that can reach it.
        { id: "p1", phone_e164: phone, project_id: "proj1", party_kind: "sub", sms_consent_status: "not_asked" },
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
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "p1", phone_e164: phone, project_id: "proj1", party_kind: "sub", sms_consent_status: "not_asked" },
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
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "p1", phone_e164: phone, project_id: "proj1", party_kind: "sub", sms_consent_status: "granted" },
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
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1", studio_id: "org-alpha" }],
    project_parties: [
      { id: "p1", phone_e164: phone, project_id: "proj1", party_kind: "sub", sms_consent_status: "not_asked" },
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
