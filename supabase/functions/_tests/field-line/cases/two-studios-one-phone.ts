import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundFixture } from "../inbound-fixture.ts";
import { processInbound } from "../../../sms-inbound/pipeline.ts";
import type { GateCase } from "../types.ts";

export const twoStudiosOnePhone: GateCase = {
  id: "two-studios-one-phone", phase: 0, clauses: ["S4"],
  async run() {
    const { h, prompt, effects } = inboundFixture();
    for (const record of h.fake._data.studio_channel_consent) record.status = "pending";
    prompt({ kind: "optin", subject_id: null });
    prompt({ id: "prompt-b", kind: "optin", subject_id: null, party_id: "party-b", project_id: "project-b", short_code: "18" });
    const granted = await h.processInbound({ Body: "YES 17" });
    assertEquals(granted.disposition, "granted");
    assertEquals(h.fake._data.studio_channel_consent.map((r) => r.status), ["granted", "pending"], "coded YES grants only the addressed studio RECORD");
    assertEquals(h.fake._data.sms_prompts.map((r) => r.answered_at != null), [true, false]);
    const inbound = h.fake._data.sms_messages.find((r) => r.twilio_sid === "SMfieldfixture001")!;
    assertEquals(inbound.project_id, "project-a");
    assertEquals((inbound.parsed_intent as Record<string, unknown>).version, 1);
    assertEquals(effects.length, 0);
    h.fake._data.studio_channel_consent[1].status = "granted";
    const conv = h.fake._data.sms_conversations[0];
    const contextA = h.fake._data.sms_conversation_context.find(c => c.project_id === "project-a")!;
    contextA.state_context = { menu:[{n:1,id:"task-a",kind:"task",project_id:"project-a"}], menu_created_at:h.clock.toISOString(),
      project_pin:{project_id:"project-a",at:h.clock.toISOString()} };
    const beforeA = structuredClone(contextA);
    prompt({id:"work-b",kind:"confirm_availability",party_id:"party-b",project_id:"project-b",subject_id:"task-b",short_code:"19"});
    h.fake._data.sms_messages.push({id:"history-a",conversation_id:conv.id,project_id:"project-a",direction:"inbound",body:"Studio A private note",created_at:h.clock.toISOString()});
    const b = await processInbound({From:h.recipient,To:h.sender,Body:"AVAILABLE 19",MessageSid:"SMcontextB",NumMedia:"0"}, {
      supabase:h.fake as never,now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch,
      parseFn:async input => {
        assertEquals(input.openItems.map(i=>i.id),["task-b"], "B reference never exposes A menu targets");
        assertEquals(input.recentMessages,[],"A history cannot enter B ref parsing");
        return {intent:"confirm_availability",target_ref:{kind:"task",id:"task-a"},new_date:null,note:"available",availability:{date:"2026-11-03",window:"09:00-11:00"},confidence:0.95};
      },
    });
    assertEquals(b.disposition,"ref_applied");
    assertEquals((effects[0].p_effect as any).target.id,"task-b", "A pin and even parser target cannot override B immutable ref");
    assertEquals(effects[0].p_party_id,"party-b");
    assertEquals(contextA,beforeA,"B reply leaves A menu/pin byte-for-byte intact");
    assertEquals(conv.state_context,undefined,"pipeline never creates legacy handset context");
    return this.clauses.map((clause) => ({ caseId: this.id, clause, status: "pass" as const, reason: "Coded YES grants A only; B immutable work Ref cannot read A history/menu or change A pin/context (pipeline fixture, not SQL/RLS proof)." }));
  },
};
