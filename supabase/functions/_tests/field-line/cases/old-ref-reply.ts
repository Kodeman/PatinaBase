import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundFixture } from "../inbound-fixture.ts";
import type { GateCase } from "../types.ts";

export const oldRefReply: GateCase = {
  id: "old-ref-reply", phase: 0, clauses: ["S1"],
  async run() {
    const { h, prompt, effects } = inboundFixture();
    prompt({ answered_at: "2026-10-31T12:00:00Z" });
    prompt({ id: "prompt-new", version: 2, short_code: "18" });
    prompt({ id: "other-project", project_id: "project-b", party_id: "party-b", subject_id: "task-b", version: 9, short_code: "99" });
    const result = await h.processInbound({ Body: "HERE 17" });
    assertEquals(result.disposition, "ref_closed");
    assert(result.replies?.[0].message.includes("Latest: Ref 18"));
    assert(!result.replies?.[0].message.includes("99"));
    assertEquals(effects.length, 0, "closed references never file an effect");
    assertEquals(h.fake._data.sms_prompts[1].answered_at, null);
    return this.clauses.map((clause) => ({ caseId: this.id, clause, status: "pass" as const, reason: "A late closed reference files nothing and identifies only its same-subject/project replacement." }));
  },
};
