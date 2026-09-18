import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundFixture } from "../inbound-fixture.ts";
import type { GateCase } from "../types.ts";

export const startNoConsent: GateCase = {
  id: "start-no-consent", phase: 0, clauses: ["S2"],
  async run() {
    const { h, prompt } = inboundFixture();
    h.fake._data.studio_channel_consent[0].status = "opted_out";
    h.fake._data.studio_channel_consent[0].refusal_unanswered = true;
    h.fake._data.studio_channel_consent[1].status = "pending";
    h.fake._data.sms_suppressions = [{ sender_number: h.sender, recipient_phone: h.recipient, lifted_at: null }];
    prompt({ id: "old-optin", kind: "optin", subject_id: null, party_id: "party-b", project_id: "project-b", version: 3 });
    const start = await h.processInbound({ Body: "START" });
    assertEquals(start.disposition, "resubscribed");
    assertEquals(h.fake._data.studio_channel_consent.map((r) => r.status), ["granted", "pending"], "START regrants only opted-out records");
    assertEquals(h.fake._data.sms_suppressions[0].lifted_at, h.clock.toISOString());
    const fresh = h.fake._data.sms_prompts.find((r) => r.id !== "old-optin")!;
    assertEquals(fresh.version, 4);
    assertEquals(fresh.party_id, "party-b");
    assertEquals(h.fake._data.sms_prompts[0].answered_at, h.clock.toISOString());
    assertEquals(start.replies?.[0].templateKey, "sms_optin_invite");
    assertEquals(start.replies?.[0].vars?.code, fresh.short_code);
    assert(start.replies?.[0].message.includes(`YES ${fresh.short_code}`));
    return this.clauses.map((clause) => ({ caseId: this.id, clause, status: "pass" as const, reason: "START lifts suppression, regrants only an opted-out RECORD, and creates a fresh v4 YES challenge for the still-pending studio." }));
  },
};
