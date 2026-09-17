import { createFieldLineHarness } from "../harness.ts";
import type { GateAssertion, GateCase } from "../types.ts";

/**
 * Two ways a send does not happen, and the difference between them.
 *
 * S5: the PROVIDER refused it. There is a message, it has an id, and the row
 * has to carry the provider's own reason code — "failed" with no code is a
 * support ticket nobody can answer, and the code is what tells a studio
 * whether to try again (30007, carrier filtering) or never to (21610, the
 * recipient's own STOP).
 *
 * S7: the SERVER refused it, before anything was written or dialled. A phase
 * that is not live does not reach the wire, and it does not leave a row behind
 * either — a gate that logs an attempt reads, later, like an attempt.
 */
export const providerFailureWithCode: GateCase = {
  id: "provider-failure-with-code",
  phase: 0,
  clauses: ["S5", "S7"],
  async run(): Promise<GateAssertion[]> {
    const assertions: GateAssertion[] = [];
    const harness = createFieldLineHarness();

    // ── S5 ────────────────────────────────────────────────────────────────
    harness.provider.setOutcome({ kind: "fail", code: 30007 });
    const refused = await harness.send({
      partyId: harness.studios.A.partyId,
      body:
        "Studio A: fixture message. Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
    });
    const row = (harness.fake._data.sms_messages ?? []).find((r) =>
      r.id === refused.messageId
    );
    const s5 = refused.sent === false &&
      refused.status === "failed" &&
      refused.provider_code === "30007" &&
      row?.twilio_status === "failed" &&
      String(row?.error_code) === "30007";
    assertions.push({
      caseId: "provider-failure-with-code",
      clause: "S5",
      status: s5 ? "pass" : "fail",
      reason: s5
        ? "a provider refusal settles 'failed' and carries code 30007 to both the caller and the durable row"
        : `expected failed/30007 on the result and the row; got status=${refused.status} provider_code=${refused.provider_code} row=${row?.twilio_status}/${row?.error_code}`,
    });

    // ── S7 ────────────────────────────────────────────────────────────────
    // FIELD_LINE_PHASE is unset in the fixture env, so phase 1 is not live.
    const wireBefore = harness.provider.requests.length;
    const rowsBefore = (harness.fake._data.sms_messages ?? []).length;
    harness.provider.setOutcome({ kind: "accept" });
    const gated = await harness.send({
      partyId: harness.studios.A.partyId,
      automationPhase: 1,
      body:
        "Studio A: phase one automation. Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
    });
    const wireAfter = harness.provider.requests.length;
    const rowsAfter = (harness.fake._data.sms_messages ?? []).length;
    const s7 = gated.sent === false &&
      gated.status === "failed" &&
      gated.reason === "field_line_phase_off" &&
      wireAfter === wireBefore &&
      rowsAfter === rowsBefore;
    assertions.push({
      caseId: "provider-failure-with-code",
      clause: "S7",
      status: s7 ? "pass" : "fail",
      reason: s7
        ? "an automation declaring a phase the server has not turned on reaches neither the provider nor sms_messages"
        : `expected field_line_phase_off with no wire call and no row; got status=${gated.status} reason=${gated.reason} wire=${wireBefore}->${wireAfter} rows=${rowsBefore}->${rowsAfter}`,
    });

    return assertions;
  },
};
