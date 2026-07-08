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
    projects: [{ id: "proj1", name: "Maple St", designer_id: "dz1" }],
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

Deno.test("STOP opts out every party row on the phone (no reply)", async () => {
  const fake = createFakeSupabase(baseSeed({
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
  const parties = fake._data.project_parties as Array<{ sms_consent_status: string }>;
  assert(parties.every((p) => p.sms_consent_status === "opted_out"), "all rows opted out");
  // STOP does not reply (Twilio Advanced Opt-Out already did).
  assert(!res.twiml.includes("<Message>"));
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
  const p1 = (fake._data.project_parties as Array<{ id: string; sms_consent_status: string }>).find((p) => p.id === "p1")!;
  assertEquals(p1.sms_consent_status, "granted");
  assert(res.twiml.includes("<Message>"));
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
