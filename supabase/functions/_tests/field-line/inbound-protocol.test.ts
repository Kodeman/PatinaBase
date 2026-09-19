import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound, type InboundDeps, type InboundParams } from "../../sms-inbound/pipeline.ts";
import { dispatchInboundReplies, replyParam } from "../../sms-inbound/index.ts";
import { inboundFixture, selectionFixture } from "./inbound-fixture.ts";
import type { FieldParseResult } from "../../_shared/field-parse.ts";

function deps(h: ReturnType<typeof inboundFixture>["h"]): InboundDeps {
  return { supabase: h.fake as never, now: h.clock, getEnv: h.env, fetchImpl: h.provider.fetch,
    parseFn: async () => { throw new Error("deterministic path reached parser"); } };
}
function inbound(h: ReturnType<typeof inboundFixture>["h"], Body: string, MessageSid = "SMprotocol"): InboundParams {
  return { From: h.recipient, To: h.sender, Body, MessageSid, NumMedia: "0" };
}

Deno.test("plain-language stops suppress and assign review without parser", async () => {
  for (const body of ["stop texting me", "wrong number", "WRONG"]) {
    const { h } = inboundFixture();
    const result = await processInbound(inbound(h, body), deps(h));
    assertEquals(result.disposition, "opted_out");
    assertEquals(h.fake._data.sms_suppressions[0].lifted_at, null);
    const row = h.fake._data.sms_messages.find((r) => r.direction === "inbound")!;
    assertEquals(row.needs_review, true);
    assertEquals(row.owner_user_id, "triage-owner", "two-studio phone does not select an arbitrary designer");
  }
});

Deno.test("carrier STOP confirmation is not duplicated; HELP remains immediate during quiet hours", async () => {
  for (const body of ["STOP", "HELP"]) {
    const { h } = inboundFixture(undefined, new Date("2026-11-01T06:30:00Z"));
    const params = { ...inbound(h, body), ...(body === "STOP" ? { OptOutType: "STOP" } : {}) };
    const result = await processInbound(params, deps(h));
    const dispatched = await dispatchInboundReplies(params, result, deps(h));
    assertEquals(dispatched.twiml, result.twiml);
    assertEquals(dispatched.twiml.includes("<Message>"), body === "HELP");
    assertEquals(h.provider.requests.length, 0);
  }
});

Deno.test("bare and coded YES cannot bypass suppression or an unreadable suppression gate", async () => {
  for (const body of ["YES", "YES 17"]) for (const unreadable of [false, true]) {
    const { h, prompt } = inboundFixture();
    h.fake._data.studio_channel_consent.forEach((r) => r.status = "pending");
    prompt({ kind: "optin", subject_id: null });
    h.fake._data.sms_suppressions = [{ sender_number: h.sender, recipient_phone: h.recipient, lifted_at: null }];
    if (unreadable) {
      const rpc = h.fake.rpc;
      h.fake.rpc = (name, args) => name === "sms_is_suppressed"
        ? Promise.resolve({ data: null, error: { message: "read failed" } }) : rpc(name, args);
    }
    const result = await processInbound(inbound(h, body), deps(h));
    assertEquals(result.status, unreadable ? 503 : 200);
    assertEquals(h.fake._data.studio_channel_consent.map((r) => r.status), ["pending", "pending"]);
    assertEquals(h.fake._data.sms_prompts[0].answered_at, null);
    if (unreadable) assertEquals(h.fake._data.sms_messages[0].twilio_sid, null);
  }
});

Deno.test("bare YES still grants all pending studio records", async () => {
  const { h, effects } = inboundFixture();
  h.fake._data.studio_channel_consent.forEach((r) => r.status = "pending");
  const result = await processInbound(inbound(h, "YES"), deps(h));
  assertEquals(result.disposition, "granted");
  assertEquals(h.fake._data.studio_channel_consent.map((r) => r.status), ["granted", "granted"]);
  assertEquals(effects.length, 0);
});

Deno.test("explicit ref and single-open no-code verbs bind the prompt subject and version before parsing", async () => {
  for (const body of ["HERE 17", "HERE", "LEAVING 17"]) {
    const { h, prompt, effects, touches } = inboundFixture();
    prompt({ version: 4 });
    h.fake._data.sms_conversations = [{ id: "conv", phone_e164: h.recipient, twilio_number: h.sender,
      party_id: "party-b", active_project_id: "project-b", state: "idle", state_context: {} }];
    const result = await processInbound(inbound(h, body), deps(h));
    assertEquals(result.disposition, "ref_applied");
    assertEquals(effects[0].p_party_id, "party-a");
    assertEquals((effects[0].p_effect as Record<string, unknown>).target, { kind: "task", id: "task-a" });
    assertEquals((effects[0].p_effect as Record<string, unknown>).type, body.startsWith("LEAVING") ? "report_departure" : "report_arrival");
    const row = h.fake._data.sms_messages.find((r) => r.direction === "inbound")!;
    assertEquals((row.parsed_intent as Record<string, unknown>).version, 4);
    assertEquals(h.fake._data.sms_prompts[0].answered_at, h.clock.toISOString());
    assert(touches.length > 0);
  }
});

Deno.test("availability payload survives parsing while the prompt overrides parser target", async () => {
  const { h, prompt, effects } = inboundFixture();
  prompt({ kind: "confirm_availability" });
  const availability = { date: "2026-11-03", window: "09:00-11:00" };
  const result = await processInbound(inbound(h, "AVAILABLE 17"), { ...deps(h), parseFn: async (input) => {
    assertEquals(input.body, "AVAILABLE", "reference is resolved before parser input");
    return { intent: "confirm_availability", target_ref: { kind: "task", id: "task-b" }, availability,
      new_date: null, note: "available", confidence: 0.95 } as FieldParseResult;
  } });
  assertEquals(result.disposition, "ref_applied");
  assertEquals((effects[0].p_effect as Record<string, unknown>).availability, availability);
  assertEquals((effects[0].p_effect as Record<string, unknown>).target, { kind: "task", id: "task-a" });
});

Deno.test("condition payload atomically applies with the immutable task subject", async () => {
  const { h, prompt, effects } = inboundFixture();
  prompt({ kind: "report_condition" });
  const condition = { ok: false, note: "dented corner" };
  const result = await processInbound(inbound(h, "DAMAGED 17"), { ...deps(h), parseFn: async () => ({
    intent: "report_condition", target_ref: null, condition, new_date: null, note: "dented corner", confidence: 0.95,
  }) });
  assertEquals(result.disposition, "ref_applied");
  assertEquals(effects.length, 1);
  assertEquals((effects[0].p_effect as any).condition, condition);
  assertEquals((effects[0].p_effect as any).target, {kind: "task", id: "task-a"});
  assert(h.fake._data.sms_prompts[0].consumption_result);
  assertEquals(h.fake._data.sms_prompts[0].answered_at, h.clock.toISOString());
});

Deno.test("ambiguous no-code verb clarifies once then hands off to owned triage", async () => {
  const { h, prompt, effects } = selectionFixture();
  prompt();
  prompt({ id: "prompt-b", project_id: "project-b", party_id: "party-b", subject_id: "task-b", short_code: "18" });
  const first = inbound(h, "HERE", "SMambiguous1");
  const question = await dispatchInboundReplies(first, await processInbound(first, deps(h)), deps(h));
  assertEquals(question.disposition, "selection_pending", "provider queued is not yet asked");
  const row = h.fake._data.sms_messages.find(r => r.template_key === "sms_selection")!;
  row.twilio_status = "delivered";
  assertEquals((await processInbound(inbound(h, "HERE", "SMambiguous2"), deps(h))).disposition, "needs_review");
  const review = h.fake._data.sms_messages.find((r) => r.twilio_sid === "SMambiguous2")!;
  assertEquals(review.owner_user_id, "triage-owner");
  assertEquals(review.project_id, null);
  assertEquals(effects.length, 0);
});

Deno.test("expired ref never files the effect or invokes the parser", async () => {
  const { h, prompt, effects } = inboundFixture();
  prompt({ expires_at: "2026-10-31T12:00:00Z" });
  assertEquals((await processInbound(inbound(h, "HERE 17"), deps(h))).disposition, "ref_closed");
  assertEquals(effects.length, 0);
});

Deno.test("authority refusal is owned; transport ambiguity stays retryable without false not-saved copy", async () => {
  for (const thrown of [false, true]) {
    const { h, prompt } = inboundFixture({ code: "42501", details: "field_effect_no_authority", message: "refused" });
    prompt();
    if (thrown) {
      const rpc = h.fake.rpc;
      h.fake.rpc = (name, args) => { if (name === "apply_field_effect") throw new Error("fixture transport failure"); return rpc(name, args); };
    }
    const result = await processInbound(inbound(h, "HERE 17"), deps(h));
    if (thrown) {
      assertEquals(result.status, 503);
      assertEquals(result.disposition, "prompt_commit_unknown");
      assertEquals(result.replies, undefined, "ambiguous commit must not claim failure or success");
      assertEquals(h.fake._data.sms_messages[0].twilio_sid, "SMprotocol");
      assertEquals(h.fake._data.sms_prompts[0].answered_at, null);
      continue;
    }
    assertEquals(result.disposition, "failed_no_authority");
    assert(result.replies?.[0].message.includes("approval"));
    const row = h.fake._data.sms_messages.find((r) => r.direction === "inbound")!;
    assertEquals(row.owner_user_id, "studio-a");
    assertEquals(row.needs_review, true);
    assertEquals(h.fake._data.sms_prompts[0].answered_at, null);
  }
});

Deno.test("unknown sender without configured triage is retryable, never falsely handed off", async () => {
  const { h } = inboundFixture();
  const result = await processInbound({ ...inbound(h, "hello"), From: "+15550108888" }, { ...deps(h), getEnv: () => undefined });
  assertEquals(result.status, 503);
  assertEquals(result.disposition, "triage_unconfigured");
  assertEquals(h.fake._data.sms_messages[0].twilio_sid, null);
  assertEquals(h.fake._invocations.length, 0);
});

Deno.test("ordinary truthful receipt defers with a credential-free recipe and reconstructs exact studio-first copy", async () => {
  const { h, prompt } = inboundFixture({ code: "P0001", message: "database failed" }, new Date("2026-11-01T06:30:00Z"));
  prompt();
  const params = inbound(h, "HERE 17");
  const result = await processInbound(params, deps(h));
  const dispatched = await dispatchInboundReplies(params, result, deps(h));
  assert(!dispatched.twiml.includes("<Message>"), "ordinary reply must not bypass gates as TwiML");
  assertEquals(h.provider.requests.length, 0);
  const row = h.fake._data.sms_messages.find((r) => r.twilio_status === "deferred")!;
  assert(row, "quiet hours create a deferred row");
  const recipe = row.recipe as Record<string, unknown>;
  assert(recipe, "deferred ordinary reply retains its template recipe");
  assert(!JSON.stringify(recipe).includes("/field/"));
  h.advanceTo(new Date("2026-11-01T14:00:00Z"));
  assertEquals((await h.flush()).flushed, 1);
  const request = h.provider.requests.find((r) => r.url.includes("/Messages.json"))!;
  const text = new URLSearchParams(String(request.init?.body)).get("Body")!;
  assertEquals(text, `Studio A: ${replyParam(result.replies![0].message, 216)} Msg&data rates may apply. Reply HELP for help, STOP to opt out.`);
  assertEquals(text.match(/Reply HELP/g)?.length, 1);
});

Deno.test("reply parameter budget counts GSM extension characters and refuses credentials without truncation", () => {
  assertEquals(replyParam("[".repeat(108), 216), "[".repeat(108));
  assertThrows(() => replyParam("[".repeat(109), 216), Error, "reply_over_budget");
  for (const value of ["https://fixture.test", `/field/${"a".repeat(64)}`, "Bearer secret", "雪"]) {
    assertThrows(() => replyParam(value, 216));
  }
});


/** Fail only the requested query operation, without changing the shared harness. */
function failQuery(h: ReturnType<typeof inboundFixture>["h"], table: string, operation: string) {
  const from = h.fake.from.bind(h.fake);
  h.fake.from = ((name: string) => {
    const builder = from(name);
    let op = "select";
    const failure = { data: null, error: { message: `fixture ${table} ${operation} failed` } };
    const proxy = new Proxy(builder, { get(target, key) {
      if (["update", "upsert", "insert"].includes(String(key))) return (...args: unknown[]) => {
        op = String(key); (target as any)[key](...args); return proxy;
      };
      if (name === table && op === operation) {
        if (key === "then") return Promise.resolve(failure).then.bind(Promise.resolve(failure));
        if (key === "single" || key === "maybeSingle") return () => Promise.resolve(failure);
      }
      const value = (target as any)[key];
      return typeof value === "function" ? (...args: unknown[]) => {
        const result = value.apply(target, args); return result === target ? proxy : result;
      } : value;
    } });
    return proxy;
  }) as typeof h.fake.from;
}

Deno.test("START and YES fail closed on unreadable records or seat attribution", async () => {
  for (const Body of ["START", "YES", "YES 17"]) for (const table of ["studio_channel_consent", "project_parties", "projects"]) {
    const { h, prompt, effects } = inboundFixture();
    h.fake._data.studio_channel_consent.forEach((r) => r.status = "pending");
    prompt({ kind: "optin", subject_id: null });
    if (Body === "YES 17") {
      // Coded consent reads are inside the SQL transaction, not client queries.
      const rpc = h.fake.rpc;
      h.fake.rpc = (name, args) => name === "sms_grant_optin_prompt"
        ? Promise.resolve({ data: null, error: { message: `atomic ${table} read unavailable` } }) : rpc(name, args);
    } else failQuery(h, table, "select");
    const result = await processInbound(inbound(h, Body), deps(h));
    assertEquals(result.status, 503, `${Body} must not acknowledge unreadable ${table}`);
    assertEquals(h.fake._data.studio_channel_consent.map((r) => r.status), ["pending", "pending"]);
    assertEquals(h.fake._data.sms_messages[0].twilio_sid, Body === "YES 17" ? "SMprotocol" : null);
    assertEquals(effects.length, 0);
  }
});

Deno.test("record-only pending START gets owned triage without inventing an engagement or grant", async () => {
  const { h } = inboundFixture();
  h.fake._data.project_parties = [];
  h.fake._data.studio_channel_consent.forEach((r) => r.status = "pending");
  const result = await processInbound(inbound(h, "START"), deps(h));
  assertEquals(result.disposition, "needs_review");
  assertEquals(h.fake._data.studio_channel_consent.map((r) => r.status), ["pending", "pending"]);
  assertEquals(h.fake._data.sms_prompts, undefined);
  assertEquals(h.fake._data.sms_messages[0].owner_user_id, "triage-owner");
  assertEquals(h.fake._data.sms_messages[0].project_id, null);
  assertEquals((h.fake._data.sms_messages[0].parsed_intent as any).organizations, ["studio-a", "studio-b"]);
});

Deno.test("START challenge creation and close failures remain retryable and never grant pending studios", async () => {
  for (const fail of ["create", "close"]) {
    const { h, prompt } = inboundFixture();
    h.fake._data.studio_channel_consent.forEach((r) => r.status = "pending");
    prompt({ kind: "optin", subject_id: null });
    if (fail === "close") failQuery(h, "sms_prompts", "update");
    else {
      const rpc = h.fake.rpc;
      h.fake.rpc = (name, args) => name === "sms_create_prompt"
        ? Promise.resolve({ data: null, error: { message: "challenge insert failed" } }) : rpc(name, args);
    }
    const result = await processInbound(inbound(h, "START"), deps(h));
    assertEquals(result.status, 503);
    assertEquals(result.replies, undefined);
    assertEquals(h.fake._data.studio_channel_consent.map((r) => r.status), ["pending", "pending"]);
    assertEquals(h.fake._data.sms_messages[0].twilio_sid, null);
    assertEquals(h.fake._data.sms_messages[0].needs_review, true);
  }
});

Deno.test("failed review ownership or notification is not a successful handoff", async () => {
  for (const mode of ["condition", "missing_subject", "unbound", "low_confidence"]) {
    const { h, prompt, effects } = inboundFixture();
    if (mode === "condition" || mode === "missing_subject") prompt({ kind: "report_condition",
      ...(mode === "missing_subject" ? { subject_id: "missing" } : {}) });
    h.fake.functions.invoke = async () => ({ data: null, error: { message: "notify unavailable" } });
    const result = await processInbound(inbound(h, mode === "condition" || mode === "missing_subject" ? "DAMAGED 17" : "please help"), {
      ...deps(h), parseFn: async () => ({ intent: mode === "unbound" ? "report_condition" : "note",
        target_ref: { kind: "task", id: "task-a" }, new_date: null, note: "test", confidence: 0.4 }),
    });
    assertEquals(result.status, 503, mode);
    assertEquals(result.replies, undefined);
    assertEquals(h.fake._data.sms_messages[0].twilio_sid, null);
    assertEquals(effects.length, 0);
  }
});

Deno.test("failure receipt names the assigned project lead, not another designer", async () => {
  const { h, prompt } = inboundFixture({ code: "P0001", message: "write failed" });
  prompt();
  h.fake._data.profiles.push({ id: "actual-lead", full_name: "Leah Lead" });
  const rpc = h.fake.rpc;
  h.fake.rpc = (name, args) => name === "field_project_lead_user"
    ? Promise.resolve({ data: "actual-lead", error: null }) : rpc(name, args);
  const result = await processInbound(inbound(h, "HERE 17"), deps(h));
  assert(result.replies![0].message.includes("Leah will follow up"));
  assertEquals(h.fake._data.sms_messages[0].owner_user_id, "actual-lead");
  assertEquals((h.fake._invocations.at(-1)!.body as any).user_id, "actual-lead");
});

Deno.test("saved effect or consent with failed context follow-up keeps SID and replays only its receipt", async () => {
  for (const consent of [false, true]) for (const notifyFails of [false, true]) {
    const { h, prompt, effects } = inboundFixture();
    prompt(consent ? { kind: "optin", subject_id: null } : {});
    if (consent) h.fake._data.studio_channel_consent[0].status = "pending";
    failQuery(h, "sms_conversation_context", "update");
    if (notifyFails) h.fake.functions.invoke = async () => ({ data: null, error: { message: "notify failed" } });
    const params = inbound(h, consent ? "YES 17" : "HERE 17");
    const result = await processInbound(params, deps(h));
    assertEquals(result.status, notifyFails ? 503 : 200);
    assertEquals(result.effectApplied, true);
    assertEquals(h.fake._data.sms_messages[0].twilio_sid, params.MessageSid);
    assertEquals(h.fake._data.sms_messages[0].needs_review, true);
    if (!notifyFails) {
      assert(result.replies![0].message.includes(consent ? "consent was recorded" : "update was saved"));
      assert(!result.replies![0].message.includes("didn't save"));
    }
    const replay = await processInbound(params, deps(h));
    assertEquals(replay.effectApplied, true, "stored receipt survives failed follow-up");
    assertEquals(replay.status, notifyFails ? 503 : 200);
    assertEquals(effects.length, consent ? 0 : 1);
    assertEquals(h.fake._data.sms_prompts[0].consumed_sid, params.MessageSid);
  }
});

Deno.test("failed receipt handoff preserves an applied SID and exposes failure", async () => {
  const { h, prompt, effects } = inboundFixture();
  prompt();
  const params = inbound(h, "HERE 17");
  const result = await processInbound(params, deps(h));
  h.provider.setOutcome({ kind: "fail", code: 30007 });
  h.fake.functions.invoke = async () => ({ data: null, error: { message: "notify failed" } });
  const sent = await dispatchInboundReplies(params, result, deps(h));
  assertEquals(sent.status, 503);
  assertEquals(sent.disposition, "reply_handoff_failed");
  assertEquals(h.fake._data.sms_messages[0].twilio_sid, params.MessageSid);
  assertEquals((await processInbound(params, deps(h))).disposition, "ref_applied");
  assertEquals(effects.length, 1, "receipt replay never reapplies the effect");
});

Deno.test("medium-confidence confirmation retains original proposal and immutable ref target", async () => {
  const { h, effects } = inboundFixture();
  const result = await processInbound(inbound(h, "the mantel will be late", "SMproposal"), {
    ...deps(h), parseFn: async () => ({ intent: "report_delay", target_ref: { kind: "task", id: "task-a" },
      new_date: "2026-11-04", note: "delayed", confidence: 0.65 }),
  });
  assertEquals(result.disposition, "clarify");
  const prompt = h.fake._data.sms_prompts[0];
  assert(result.replies![0].message.includes(`YES ${prompt.short_code}`));
  const confirmed = await processInbound(inbound(h, `YES ${prompt.short_code}`, "SMconfirm"), deps(h));
  assertEquals(confirmed.disposition, "ref_applied");
  assertEquals(effects.length, 1);
  assertEquals(effects[0].p_party_id, "party-a");
  assertEquals((effects[0].p_effect as any).target, { kind: "task", id: "task-a" });
  assertEquals((effects[0].p_effect as any).new_date, "2026-11-04");
  assertEquals((effects[0].p_effect as any).note, "delayed");
  assertEquals(h.fake._data.sms_conversation_context.find(c => c.project_id === "project-a")!.state, "idle");
  assertEquals((h.fake._data.sms_conversation_context.find(c => c.project_id === "project-a")!.state_context as any).pending_effect, undefined);
});

Deno.test("one-open freeform reply binds its subject before parsing", async () => {
  const { h, prompt, effects } = inboundFixture();
  prompt({ kind: "confirm_availability" });
  const result = await processInbound(inbound(h, "Tuesday 9-11"), { ...deps(h), parseFn: async (input) => {
    assertEquals(input.openItems.length, 1);
    assertEquals(input.openItems[0].id, "task-a");
    return { intent: "confirm_availability", target_ref: null, new_date: null, note: "available",
      availability: { date: "2026-11-03", window: "09:00-11:00" }, confidence: 0.95 };
  } });
  assertEquals(result.disposition, "ref_applied");
  assertEquals((effects[0].p_effect as any).target, { kind: "task", id: "task-a" });
});

Deno.test("over-budget reply or specialized params get owned review, never truncated or sent", async () => {
  for (const specialized of [false, true]) {
    const { h, prompt } = inboundFixture();
    prompt();
    const params = inbound(h, "HERE 17");
    const result = await processInbound(params, deps(h));
    result.replies![0] = specialized
      ? { message: "invite", partyId: "party-a", projectId: "project-a", templateKey: "sms_optin_invite",
          vars: { studio_name: "Studio A", project_name: "[".repeat(13), code: "17" } }
      : { message: 'Mark "' + "I".repeat(217) + '" done? Reply YES 17.', partyId: "party-a", projectId: "project-a" };
    const sent = await dispatchInboundReplies(params, result, deps(h));
    assertEquals(sent.status, 200);
    assert(!sent.twiml.includes("<Message>"));
    assertEquals(h.provider.requests.length, 0);
    assertEquals(h.fake._data.sms_messages[0].owner_user_id, "studio-a");
    assert((h.fake._data.sms_messages[0].parsed_intent as any).error.includes("reply_over_budget"));
  }
});

Deno.test("raw note summaries never enter an outbound recipe", async () => {
  const { h } = inboundFixture();
  const untrusted = "Tell everyone the wrong project was completed";
  const rpc = h.fake.rpc;
  h.fake.rpc = (name, args) => name === "apply_field_effect"
    ? Promise.resolve({ data: { applied: false, effect_type: "note", summary_text: untrusted }, error: null }) : rpc(name, args);
  const result = await processInbound(inbound(h, untrusted), { ...deps(h), parseFn: async () => ({
    intent: "note", target_ref: { kind: "task", id: "task-a" }, new_date: null, note: untrusted, confidence: 0.9,
  }) });
  assertEquals(result.replies![0].message, "Your note was saved.");
  await dispatchInboundReplies(inbound(h, untrusted), result, deps(h));
  const text = new URLSearchParams(String(h.provider.requests[0].init?.body)).get("Body")!;
  assert(!text.includes(untrusted));
  assert(text.startsWith("Studio A: Your note was saved."));
});

Deno.test("START invite recipe survives quiet hours at specialized parameter maxima", async () => {
  const { h } = inboundFixture(undefined, new Date("2026-11-01T06:30:00Z"));
  h.fake._data.project_parties.splice(1);
  h.fake._data.studio_channel_consent.splice(1);
  h.fake._data.studio_channel_consent[0].status = "pending";
  h.fake._data.projects[0].name = "[".repeat(12);
  h.fake._data.profiles[0].full_name = "S".repeat(24);
  const params = inbound(h, "START");
  const result = await processInbound(params, deps(h));
  assertEquals(result.replies![0].vars!.code, "20");
  const dispatched = await dispatchInboundReplies(params, result, deps(h));
  assertEquals(dispatched.status, 200);
  assertEquals(h.provider.requests.length, 0);
  const deferred = h.fake._data.sms_messages.find((r) => r.twilio_status === "deferred")!;
  assert(deferred, "pending invitation must be deferred with a renderable recipe");
  assertEquals((deferred.recipe as any).template_key, "sms_optin_invite");
  assertEquals((deferred.recipe as any).params.project_name, "[".repeat(12));
  h.advanceTo(new Date("2026-11-01T14:00:00Z"));
  assertEquals((await h.flush()).flushed, 1);
  const text = new URLSearchParams(String(h.provider.requests[0].init?.body)).get("Body")!;
  assertEquals(text, `${"S".repeat(24)} sends ${"[".repeat(12)} updates by text through Patina. Reply YES 20 to confirm (~1 msg/day). Msg&data rates may apply. Reply HELP for help, STOP to opt out.`);
  assertEquals(h.fake._data.studio_channel_consent[0].status, "pending");
});

Deno.test("thrown postcommit context update and missing owner never release a committed effect SID", async () => {
  const { h, prompt, effects } = inboundFixture();
  prompt();
  const rpc = h.fake.rpc;
  h.fake.rpc = async (name, args) => {
    if (name === "field_project_lead_user") return { data: null, error: null };
    const result = await rpc(name, args);
    if (name === "sms_apply_prompt") {
      failQuery(h, "sms_conversation_context", "update");
      h.fake._data.projects.forEach((p) => p.designer_id = null);
    }
    return result;
  };
  const params = inbound(h, "HERE 17");
  const result = await processInbound(params, { ...deps(h), getEnv: () => undefined });
  assertEquals(result.status, 503);
  assertEquals(result.effectApplied, true);
  assertEquals(h.fake._data.sms_messages[0].twilio_sid, params.MessageSid);
  const retry = await processInbound(params, { ...deps(h), getEnv: () => undefined });
  assertEquals(retry.status, 503);
  assertEquals(retry.effectApplied, true);
  assertEquals(effects.length, 1);
});
