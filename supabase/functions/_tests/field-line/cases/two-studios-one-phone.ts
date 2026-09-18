import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundFixture } from "../inbound-fixture.ts";
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
    return this.clauses.map((clause) => ({ caseId: this.id, clause, status: "pass" as const, reason: "Coded YES binds one opt-in version and grants only studio A; B remains pending (pipeline fixture, not SQL/RLS proof)." }));
  },
};
