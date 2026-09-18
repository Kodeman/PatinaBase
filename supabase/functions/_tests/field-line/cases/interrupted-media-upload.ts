import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { selectionFixture } from "../inbound-fixture.ts";
import { processInbound } from "../../../sms-inbound/pipeline.ts";
import { dispatchInboundReplies } from "../../../sms-inbound/index.ts";
import type { GateCase } from "../types.ts";

export const interruptedMediaUpload: GateCase = {
  id: "interrupted-media-upload", phase: 0, clauses: ["S4", "S5"],
  async run() {
    const { h, id, effects } = selectionFixture();
    assertEquals(h.fake._storageFiles.size, 0, "media store starts empty");
    h.mediaStore.interruptNextUpload();
    let parses = 0;
    const deps = { supabase: h.fake as never, now: h.clock, getEnv: h.env, fetchImpl: h.provider.fetch,
      parseFn: async () => { parses++; return { intent: "note" as const, target_ref: null, new_date: null, note: "two photos", confidence: 0.95 }; } };
    const params = { From: h.recipient, To: h.sender, Body: "two photos", MessageSid: "SMinterruptedRoot", NumMedia: "2",
      MediaUrl0: "https://media.fixture.patina.test/first.jpg", MediaContentType0: "image/jpeg",
      MediaUrl1: "https://media.fixture.patina.test/second.jpg", MediaContentType1: "image/jpeg" };
    const failed = await processInbound(params, deps);
    assertEquals(failed.status, 503); assertEquals(failed.disposition, "media_incomplete");
    assertEquals(parses, 0); assertEquals(effects.length, 0); assertEquals(failed.replies, undefined);
    const origin = h.fake._data.sms_messages.find(m => m.twilio_sid === params.MessageSid)!;
    assert(origin); assertEquals((origin.media as any[]).length, 1, "successful partial media remains attached to the same durable inbound");
    const retry = await processInbound(params, deps);
    assertEquals(retry.disposition, "project_chooser");
    assertEquals(h.fake._data.sms_messages.filter(m => m.twilio_sid === params.MessageSid).length, 1);
    assertEquals(h.fake._uploads.length, 3, "retry uploads only the interrupted item, not the recorded successful attachment");
    assertEquals((origin.media as any[]).length, 2);
    assert((origin.media as any[]).every(m => m.path.startsWith("holding/")), "ambiguous media remains service-only");
    assertEquals((await dispatchInboundReplies(params, retry, deps)).status, 200);
    h.fake._data.sms_messages.find((m: any) => m.recipe?.selection)!.twilio_status = "delivered";
    const chosen = await processInbound({ From: h.recipient, To: h.sender, Body: "2", MessageSid: "SMinterruptedChoice", NumMedia: "0" }, deps);
    assertEquals(chosen.disposition, "applied"); assertEquals(effects.length, 1); assertEquals(effects[0].p_sms_message_id, origin.id);
    assertEquals(effects[0].p_party_id, id("party-b"));
    assertEquals((effects[0].p_effect as any).media.length, 2);
    assert((origin.media as any[]).every(m => m.path.startsWith(`project/${id("project-b")}/`)), "both attachments follow only the chosen project");
    return this.clauses.map(clause => ({ caseId: this.id, clause, status: "pass" as const,
      reason: "Empty fake store; partial MMS is retryable with the same SID, retains successful media, then rehomes both attachments only after a durable project choice." }));
  },
};
