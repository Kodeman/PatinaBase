import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundFixture } from "../inbound-fixture.ts";
import type { GateCase } from "../types.ts";

export const stopThenNewEngagement: GateCase = {
  id: "stop-then-new-engagement", phase: 0, clauses: ["S2"],
  async run() {
    const { h } = inboundFixture();
    await h.processInbound({ Body: "STOP" });
    assertEquals(h.fake._data.sms_suppressions.length, 1);
    assertEquals(h.fake._data.studio_channel_consent.map((r) => r.status), ["opted_out", "opted_out"]);
    h.fake._data.project_parties = [{ id: "party-c", project_id: "project-c", phone_e164: h.recipient, party_kind: "sub" }];
    h.fake._data.projects.push({ id: "project-c", studio_id: "studio-c", designer_id: "studio-c", name: "Cedar House" });
    h.fake._data.studio_channel_consent.push({ organization_id: "studio-c", channel_kind: "sms", channel_value: h.recipient, status: "pending", refusal_unanswered: false });
    const yes = await h.processInbound({ Body: "YES", MessageSid: "SMnew-engagement" });
    assertEquals(yes.disposition, "suppressed");
    assertEquals(h.fake._data.studio_channel_consent[2].status, "pending", "seat churn cannot erase phone suppression");
    const send = await h.send({ partyId: "party-c", templateKey: "sms_optin_invite", vars: { studio_name: "Cedar", project_name: "Cedar House", code: "19" } });
    assertEquals(send.sent, false);
    assertEquals(h.provider.requests.length, 0);
    return this.clauses.map((clause) => ({ caseId: this.id, clause, status: "pass" as const, reason: "STOP persists across removed seats and a new studio invitation; bare YES and outbound cannot bypass it." }));
  },
};
