import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundFixture } from "../inbound-fixture.ts";
import type { GateCase } from "../types.ts";

export const rpcFailureMidEffect: GateCase = {
  id: "rpc-failure-mid-effect", phase: 0, clauses: ["S3", "S5"],
  async run() {
    const { h, prompt, effects } = inboundFixture({ code: "P0001", message: "fixture rolled-back database exception" });
    prompt();
    const result = await h.processInbound({ Body: "HERE 17" });
    assertEquals(result.disposition, "effect_failed");
    assert(result.replies?.[0].message.includes("didn't save"));
    assert(!result.replies?.[0].message.includes("logged"));
    assertEquals(effects.length, 1);
    assertEquals(effects[0].p_party_id, "party-a");
    assertEquals((effects[0].p_effect as Record<string, unknown>).target, { kind: "task", id: "task-a" });
    const row = h.fake._data.sms_messages.find((r) => r.direction === "inbound")!;
    assertEquals(row.needs_review, true);
    assertEquals(row.owner_user_id, "studio-a");
    assertEquals((row.parsed_intent as Record<string, unknown>).prompt_id, "prompt-a");
    assertEquals(h.fake._data.sms_prompts[0].answered_at, null);
    assert(h.fake._invocations.some((i) => (i.body as Record<string, unknown>).user_id === "studio-a"));
    return this.clauses.map((clause) => ({ caseId: this.id, clause, status: "pass" as const, reason: "A known rolled-back effect RPC exception retains its immutable prompt, assigns/notifies the owner, and says it did not save." }));
  },
};
