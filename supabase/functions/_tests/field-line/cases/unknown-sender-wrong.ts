import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundFixture } from "../inbound-fixture.ts";
import type { GateCase } from "../types.ts";

export const unknownSenderWrong: GateCase = {
  id: "unknown-sender-wrong", phase: 0, clauses: ["S4"],
  async run() {
    const { h, effects } = inboundFixture();
    const stranger = "+15550109999";
    const result = await h.processInbound({ From: stranger, Body: "WRONG" });
    assertEquals(result.disposition, "opted_out");
    const row = h.fake._data.sms_messages.find((r) => r.direction === "inbound")!;
    assertEquals(row.needs_review, true);
    assertEquals(row.owner_user_id, "triage-owner");
    assertEquals(row.project_id, null);
    assertEquals(row.party_id, null);
    assertEquals(h.fake._data.sms_suppressions[0].recipient_phone, stranger);
    assertEquals(effects.length, 0);
    assertEquals(h.provider.requests.length, 0);
    assert(h.fake._invocations.some((i) => (i.body as Record<string, unknown>).user_id === "triage-owner"));
    return this.clauses.map((clause) => ({ caseId: this.id, clause, status: "pass" as const, reason: "Unknown WRONG suppresses deterministically and creates notified triage-owned review without guessed studio or provider traffic." }));
  },
};
