import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound, bindInboundSelection } from "../../sms-inbound/pipeline.ts";
import { dispatchInboundReplies } from "../../sms-inbound/index.ts";
import { inboundFixture, selectionFixture } from "./inbound-fixture.ts";
const input = (h: any, Body: string, MessageSid: string) => ({ From: h.recipient, To: h.sender, Body, MessageSid, NumMedia: "0" });
const deps = (h: any, parseFn: any = async () => { throw Error("parser must not run"); }) => ({ supabase: h.fake, now: h.clock, getEnv: h.env, fetchImpl: h.provider.fetch, parseFn });
function seedContext(h: any, project: string | null, context = {}, state = "idle", backfilled: string | null = null) {
  h.fake._data.sms_conversations = [{ id: "54000000-0000-4000-8000-000000000001", phone_e164: h.recipient, twilio_number: h.sender, active_project_id: null, party_id: null }];
  const row = { conversation_id: "54000000-0000-4000-8000-000000000001", project_id: project,
    party_id: h.fake._data.project_parties.find((p: any) => p.project_id === project)?.id ?? null,
    state, state_context: context, paused_until: null as string | null, backfilled_at: backfilled };
  (h.fake._data.sms_conversation_context ??= []).push(row);
  return row;
}

Deno.test("paused A stores an owned silent review while B's explicit Ref remains operational", async () => {
  const { h, prompt, effects } = inboundFixture();
  const a = seedContext(h, "project-a", { project_pin: { project_id: "project-a", at: h.clock.toISOString() } });
  a.paused_until = "2026-11-02T14:00:00Z";
  const b = seedContext(h, "project-b", { menu: [{ n: 1, id: "task-b", kind: "task", project_id: "project-b" }] });
  const before = structuredClone(b);
  prompt(); prompt({ id: "prompt-b", party_id: "party-b", project_id: "project-b", subject_id: "task-b", short_code: "18" });
  const paused = await processInbound(input(h, "HERE 17", "SMpauseA"), deps(h));
  assertEquals(paused.disposition, "paused"); assertEquals(paused.replies, undefined); assertEquals(effects.length, 0);
  const row = h.fake._data.sms_messages.find((r: any) => r.twilio_sid === "SMpauseA")!;
  assertEquals(row.needs_review, true); assertEquals(row.owner_user_id, "studio-a"); assertEquals(row.project_id, "project-a");
  const freeform = await processInbound(input(h, "a plain update", "SMpauseText"), deps(h));
  assertEquals(freeform.disposition, "paused", "pinned paused context bypasses parsing and replies");
  assertEquals(b, before, "A pause must not mutate B's context");
  const working = await processInbound(input(h, "HERE 18", "SMworkingB"), deps(h));
  assertEquals(working.disposition, "ref_applied"); assertEquals(effects.length, 1); assertEquals(effects[0].p_party_id, "party-b");
  assertEquals((effects[0].p_effect as any).target.id, "task-b", "A's pin cannot override B's Ref");
});

Deno.test("PO delivery Ref atomically consumes once across distinct SIDs and replays its receipt", async () => {
  const { h, prompt, effects } = inboundFixture();
  const ref = prompt({ kind: "confirm_delivery", subject_id: "po-a" });
  h.fake._data.purchase_orders = [{ id: "po-a", project_id: "project-a", po_number: "PO test" }];
  const first = input(h, "OK 17", "SMpo1");
  const results = await Promise.all([processInbound(first, deps(h)), processInbound(input(h, "OK 17", "SMpo2"), deps(h))]);
  assert(results.some(r => r.disposition === "ref_applied"));
  assertEquals(effects.length, 1, "PO refs use one atomic business effect");
  assertEquals((effects[0].p_effect as any).target, {kind: "purchase_order", id: "po-a"});
  assert(ref.consumption_result, "PO prompt retains immutable receipt");
  const receipt = structuredClone(ref.consumption_result);
  await processInbound(first, deps(h));
  await processInbound(input(h, "OK 17", "SMpoLater"), deps(h));
  assertEquals(effects.length, 1, "retries and closed ref never reapply");
  assertEquals(ref.consumption_result, receipt);
});

Deno.test("backfilled holding without active project discards old chooser and preserves body/media through fresh choice", async () => {
  const { h, id, effects } = selectionFixture();
  const media = [{ path: "holding/54000000-0000-4000-8000-000000000001/54000000-0000-4000-8000-000000000002/0.jpg", content_type: "image/jpeg", twilio_url: "https://media.fixture/photo" }];
  const held = seedContext(h, null, { pending_message_id: "54000000-0000-4000-8000-000000000002", pending_body: "the original photo", pending_media: media,
    chooser: [{ n: 1, party_id: id("party-b"), project_id: id("project-b") }],
    pending_effect: { type: "mark_done", target: { kind: "task", id: id("task-b") } },
    menu: [{ n: 1, id: id("task-b"), kind: "task", project_id: id("project-b") }] }, "awaiting_confirmation", h.clock.toISOString());
  h.fake._data.sms_messages.push({ id: "54000000-0000-4000-8000-000000000002", direction: "inbound", conversation_id: "54000000-0000-4000-8000-000000000001", twilio_sid: "SMoriginal", created_at: "2026-09-01T00:00:00Z", body: "the original photo", media });
  const p = input(h, "YES", "SMlegacy");
  const result = await processInbound(p, deps(h));
  assertEquals(result.disposition, "project_chooser"); assertEquals(effects.length, 0, "legacy confirmation cannot apply old pending_effect");
  const dispatched = await dispatchInboundReplies(p, result, deps(h));
  assertEquals(dispatched.status, 200);
  const fresh = h.fake._data.sms_messages.find((m:any) => m.id === result.messageId)!;
  assertEquals(fresh.parsed_intent.held_origin_id, "54000000-0000-4000-8000-000000000002");
  assert(result.messageId !== fresh.parsed_intent.held_origin_id, "fresh question never borrows the expired root timestamp");
  const question = h.fake._data.sms_messages.find((m: any) => m.recipe?.selection)!; question.twilio_status = "delivered";
  assertEquals(held.backfilled_at, null, "live question is no longer stamped as a migration snapshot");
  const done = await processInbound(input(h, "1", "SMlegacyPick"), deps(h, async (x: any) => {
    assertEquals(x.body, "the original photo"); assertEquals(x.hasMedia, true);
    return { intent: "note", target_ref: null, note: x.body, new_date: null, confidence: 0.95 };
  }));
  assertEquals(done.disposition, "applied"); assertEquals(effects.length, 1); assertEquals(effects[0].p_party_id, id("party-a"));
  assertEquals((effects[0].p_effect as any).type, "note", "parsed fresh, never replay old pending_effect");
  assertEquals(effects[0].p_sms_message_id, "54000000-0000-4000-8000-000000000002", "only the root owns the effect receipt");
  assertEquals(fresh.parsed_intent.legacy_choice_closed, true);
  assertEquals(fresh.applied_effect, undefined, "chooser is never a second effect source");
  assertEquals((await processInbound(input(h, "1", "SMlegacyPick"), deps(h))).disposition, "already_completed");
  assertEquals((await processInbound(input(h, "1", "SMlegacyPickAgain"), deps(h))).disposition, "already_completed");
  assertEquals(effects.length, 1);
  assertEquals(h.fake._data.sms_conversation_context.some((c: any) => c.project_id === null), false);
  const context = h.fake._data.sms_conversation_context.find((c: any) => c.project_id === id("project-a"))!;
  assertEquals(context.state_context.menu, undefined, "old held menu never becomes project authority");
  assertEquals((effects[0].p_effect as any).media, [`project/${id("project-a")}/sms/54000000-0000-4000-8000-000000000002/0.jpg`]);
});

Deno.test("rerun legacy snapshot of a completed target is silently discarded on each read", async () => {
  const { h, effects } = inboundFixture();
  h.fake._data.project_tasks[0].status = "done";
  // Models exactly the backfill's verbatim replacement, not its SQL execution.
  for (const sid of ["SMbackfill1", "SMbackfill2"]) {
    seedContext(h, null, { pending_effect: { type: "mark_done", target: { kind: "task", id: "task-a" } }, pending_body: "done" }, "awaiting_confirmation", h.clock.toISOString());
    const result = await processInbound(input(h, "YES", sid), deps(h));
    assertEquals(result.disposition, "legacy_already_completed"); assertEquals(result.replies, undefined);
    assertEquals(h.fake._data.sms_conversation_context.length, 0); assertEquals(effects.length, 0);
  }
});

Deno.test("re-ask of a re-ask flattens the root pointer and completed root blocks dispatch and binder", async () => {
  const { h, id, effects } = selectionFixture();
  const rootId = "54000000-0000-4000-8000-000000000002";
  const held = seedContext(h, null, { pending_message_id: rootId, pending_body: "blocked" }, "awaiting_project_choice", h.clock.toISOString());
  const root = { id: rootId, direction: "inbound", conversation_id: held.conversation_id, twilio_sid: "SMroot", body: "blocked", created_at: "2026-09-01T00:00:00Z", applied_effect: null as any };
  h.fake._data.sms_messages.push(root);
  const firstParams = input(h, "old digit", "SMfirstReask");
  const first = await processInbound(firstParams, deps(h));
  assertEquals(first.disposition, "project_chooser");
  assertEquals((await dispatchInboundReplies(firstParams, first, deps(h))).status, 200);
  // Backfill replacement of the old handset state can point at an earlier re-ask.
  held.state_context = { pending_message_id: first.messageId!, pending_body: "blocked" };
  held.backfilled_at = h.clock.toISOString();
  const secondParams = input(h, "another old digit", "SMsecondReask");
  const second = await processInbound(secondParams, deps(h));
  const current = h.fake._data.sms_messages.find((m:any) => m.id === second.messageId)!;
  assertEquals(current.parsed_intent.held_origin_id, rootId, "pointer stays at root, never at prior chooser");
  const firstQuestion = h.fake._data.sms_messages.find((m:any) => m.recipe?.selection?.inboundMessageId === first.messageId)!;
  const beforeBinder = structuredClone(h.fake._data.sms_conversation_context);
  const wires = h.provider.requests.length;
  root.applied_effect = { applied: false, effect_type: "note" };
  assertEquals((await dispatchInboundReplies(secondParams, second, deps(h))).disposition, "already_completed");
  assertEquals(h.provider.requests.length, wires, "dispatch checks root before sending a new chooser");
  assertEquals(await bindInboundSelection(h.fake as never, first.messageId!, {
    manifest: firstQuestion.recipe.selection, usable: true, deliveryStatus: "delivered",
  }, firstQuestion.id), true);
  assertEquals(h.fake._data.sms_conversation_context, beforeBinder, "late binder checks completed root before any context CAS");
  assertEquals((await processInbound(secondParams, deps(h))).disposition, "already_completed", "retry reads root, not fresh chooser completion");
  held.backfilled_at = h.clock.toISOString(); held.state_context = { pending_message_id: rootId };
  assertEquals((await processInbound(input(h, "YES", "SMrootAlreadyDone"), deps(h))).disposition, "already_completed");
  assertEquals(h.fake._data.sms_conversation_context.length, 0); assertEquals(effects.length, 0);
});

Deno.test("legacy root-pointer write failure sends no chooser and leaves the holding snapshot untouched", async () => {
  const { h, effects } = selectionFixture();
  const rootId = "54000000-0000-4000-8000-000000000002";
  const held = seedContext(h, null, { pending_message_id: rootId, pending_body: "blocked" }, "awaiting_project_choice", h.clock.toISOString());
  h.fake._data.sms_messages.push({ id: rootId, direction: "inbound", conversation_id: held.conversation_id,
    twilio_sid: "SMrootFail", body: "blocked", created_at: "2026-09-01T00:00:00Z", applied_effect: null });
  const snapshot = structuredClone(held);
  const from = h.fake.from.bind(h.fake);
  h.fake.from = (table: string) => {
    const q = from(table), update = q.update.bind(q);
    q.update = (patch: any) => {
      if (table === "sms_messages" && patch.parsed_intent?.held_origin_id) {
        q.eq = () => q;
        q.then = (resolve: any) => Promise.resolve({ data: null, error: { message: "root pointer unavailable" } }).then(resolve);
        return q;
      }
      return update(patch);
    };
    return q;
  };
  const params = input(h, "YES", "SMpointerFailure");
  const result = await processInbound(params, deps(h));
  assertEquals(result.status, 503); assertEquals(result.disposition, "selection_unrecorded");
  assertEquals(result.selection, undefined); assertEquals(result.retainSid, true);
  await dispatchInboundReplies(params, result, deps(h));
  assertEquals(h.provider.requests.length, 0, "no chooser without its durable root pointer");
  assertEquals(held, snapshot, "failed pointer write cannot consume or replace holding authority");
  assertEquals(effects.length, 0);
});

Deno.test("saved digit origin outranks a later completed legacy-choice context", async () => {
  const { h, id, effects } = selectionFixture();
  const params = input(h, "original blocked", "SMearlierOrigin");
  const original = await processInbound(params, deps(h, async () => ({ intent: "flag_blocker", target_ref: null, note: "blocked", new_date: null, confidence: 0.95 })));
  assertEquals(original.disposition, "project_chooser");
  await dispatchInboundReplies(params, original, deps(h));
  const question = h.fake._data.sms_messages.find((m:any) => m.recipe?.selection?.inboundMessageId === original.messageId)!;
  question.twilio_status = "delivered";
  const conversationId = question.conversation_id;
  // Model a digit that saved its immutable original pointer before a later
  // project update won the context CAS. It must not use latest-context history.
  h.fake._data.sms_messages.push({ id: "54000000-0000-4000-8000-000000000091", conversation_id: conversationId,
    direction: "inbound", body: "1", twilio_sid: "SMsavedDigit", parsed_intent: { selection_intent: {
      kind: "project_choice", inboundMessageId: original.messageId, messageId: question.id,
    } } });
  const laterId = "54000000-0000-4000-8000-000000000092";
  h.fake._data.sms_messages.push({ id: laterId, conversation_id: conversationId, direction: "inbound", twilio_sid: "SMlaterDone", applied_effect: { applied: false } });
  h.fake._data.sms_conversation_context = [{ conversation_id: conversationId, project_id: id("project-a"), party_id: id("party-a"),
    state: "idle", paused_until: null, backfilled_at: null, state_context: {
      project_pin: { project_id: id("project-a"), at: h.clock.toISOString() },
      last_held_choice: { root_id: laterId, at: h.clock.toISOString() },
    } }];
  const resumed = await processInbound(input(h, "1", "SMsavedDigit"), deps(h, async () => ({ intent: "flag_blocker", target_ref: {kind:"task",id:id("task-a")}, note:"blocked", new_date:null, confidence:0.95 })));
  assertEquals(resumed.disposition, "applied");
  assertEquals(effects.length, 1); assertEquals(effects[0].p_sms_message_id, original.messageId, "resume uses its saved origin, not last_held_choice");
});
