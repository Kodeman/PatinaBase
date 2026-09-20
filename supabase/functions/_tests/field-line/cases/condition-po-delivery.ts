import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundFixture } from "../inbound-fixture.ts";
import { processInbound } from "../../../sms-inbound/pipeline.ts";
import { realParseFn } from "./helpers.ts";
import type { GateCase } from "../types.ts";

export const conditionReport: GateCase = {
  id: "condition-report",
  phase: 0,
  clauses: ["S1", "S3"],
  async run() {
    for (
      const body of ["DAMAGED 17", "DAMAGE 17", "dented corner", "not damaged"]
    ) {
      const { h, prompt, effects } = inboundFixture();
      prompt({ kind: "report_condition" });
      const result = await realInbound(h, body);
      assertEquals(result.disposition, "ref_applied", body);
      assertEquals(effects.length, 1);
      const effect = effects[0].p_effect as any;
      assertEquals(effect.type, "report_condition");
      assertEquals(effect.target, { kind: "task", id: "task-a" });
      assertEquals(effect.condition.ok, body === "not damaged");
      assert(
        effect.condition.note.length > 0,
        "condition note survives real deterministic parser",
      );
      assert(
        h.fake._data.sms_prompts[0].consumption_result,
        "condition uses immutable receipt",
      );
    }
    return this.clauses.map((clause) => ({
      caseId: this.id,
      clause,
      status: "pass" as const,
      reason:
        "Coded damage and one-open freeform condition retain parser payload and immutable task target through atomic consumption.",
    }));
  },
};
export const poDelivery: GateCase = {
  id: "po-delivery",
  phase: 0,
  clauses: ["S1", "S3", "S5"],
  async run() {
    for (
      const body of [
        "OK 17",
        "HERE 17",
        "GOOD 17",
        "FINE 17",
        "DAMAGED 17",
        "dented corner",
      ]
    ) {
      const { h, prompt, effects } = inboundFixture();
      prompt({ kind: "confirm_delivery", subject_id: "po-a" });
      h.fake._data.purchase_orders = [{
        id: "po-a",
        project_id: "project-a",
        po_number: "PO test",
      }];
      const result = await realInbound(h, body);
      assertEquals(result.disposition, "ref_applied", body);
      assertEquals(effects.length, 1);
      assertEquals((effects[0].p_effect as any).target, {
        kind: "purchase_order",
        id: "po-a",
      });
      assert(h.fake._data.sms_prompts[0].consumption_result);
    }
    const { h, prompt } = inboundFixture({
      code: "23514",
      message: "validator refused",
    });
    prompt({ kind: "confirm_delivery", subject_id: "po-a" });
    h.fake._data.purchase_orders = [{
      id: "po-a",
      project_id: "project-a",
      po_number: "PO test",
    }];
    const result = await realInbound(h, "OK 17");
    assertEquals(result.disposition, "effect_failed");
    assert(
      result.replies?.[0].message.includes("didn't save"),
      "PO validator refusal is truthful",
    );
    assertEquals(h.fake._data.sms_prompts[0].answered_at, null);
    assertEquals(
      h.fake._data.sms_messages.find((r) => r.direction === "inbound")
        ?.owner_user_id,
      "studio-a",
    );
    return this.clauses.map((clause) => ({
      caseId: this.id,
      clause,
      status: "pass" as const,
      reason:
        "PO answers use atomic authority; 23514 retains the open ref and owned truthful failure. Field reports are not receiving receipts.",
    }));
  },
};

function realInbound(h: ReturnType<typeof inboundFixture>["h"], Body: string) {
  return processInbound({
    From: h.recipient,
    To: h.sender,
    Body,
    MessageSid: "SMconditionpo",
    NumMedia: "0",
  }, {
    supabase: h.fake as never,
    now: h.clock,
    getEnv: h.env,
    fetchImpl: h.provider.fetch,
    parseFn: realParseFn,
  });
}
