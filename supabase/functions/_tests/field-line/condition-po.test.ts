import { conditionReport, poDelivery } from "./cases/condition-po-delivery.ts";
Deno.test("condition fixture uses real parser and atomic prompt receipt", async () => {
  await conditionReport.run();
});
Deno.test("PO delivery fixture uses atomic authority and truthful validator refusal", async () => {
  await poDelivery.run();
});

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundFixture } from "./inbound-fixture.ts";
import { processInbound } from "../../sms-inbound/pipeline.ts";
import { realParseFn } from "./cases/helpers.ts";

for (const length of [2001, 2000]) {
  Deno.test(`PO condition ${length}-character reply preserves full note and SQL length outcome`, async () => {
    const body = "damaged " + "x".repeat(length - 8);
    const { h, prompt } = inboundFixture();
    const p = prompt({ kind: "confirm_delivery", subject_id: "po-a" });
    const beforePrompt = structuredClone(p);
    h.fake._data.purchase_orders = [{
      id: "po-a",
      project_id: "project-a",
      po_number: "PO test",
    }];
    h.fake._data.field_delivery_reports = [];
    const rpc = h.fake.rpc;
    let submitted: any;
    // Model only the SQL length constraint here; the rolled-back PO SQL suite
    // separately proves real whole-row rollback and persistence at both bounds.
    h.fake.rpc = async (name, args = {}) => {
      if (name === "sms_apply_prompt") submitted = args.p_effect;
      if (name === "apply_field_effect") {
        const effect = args.p_effect as any;
        if (effect.condition.note.length > 2000) {
          return {
            data: null,
            error: {
              code: "23514",
              message: "field_delivery_reports_note_len",
            },
          };
        }
        const result = await rpc(name, args);
        if (!result.error) {
          h.fake._data.field_delivery_reports.push({
            condition_note: effect.condition.note,
          });
        }
        return result;
      }
      return rpc(name, args);
    };
    const result = await processInbound({
      From: h.recipient,
      To: h.sender,
      Body: `  ${body}  `,
      MessageSid: `SMcondition${length}`,
      NumMedia: "0",
    }, {
      supabase: h.fake as never,
      now: h.clock,
      getEnv: h.env,
      fetchImpl: h.provider.fetch,
      parseFn: realParseFn,
    });
    assert(submitted, "condition reaches atomic prompt authority");
    assertEquals(
      submitted.condition.note,
      body,
      "complete trimmed reply reaches sms_apply_prompt",
    );
    assertEquals(submitted.condition.note.length, length);
    assertEquals(
      submitted.note,
      body.slice(0, 200),
      "preview stays separate from report note",
    );
    const inbound = h.fake._data.sms_messages.find((m) =>
      m.direction === "inbound"
    )!;
    if (length === 2001) {
      assertEquals(
        result.disposition,
        "effect_failed",
        "overlength report is refused, not truncated and saved",
      );
      assert(
        result.replies?.[0].message.includes("didn't save"),
        "truthful refusal receipt",
      );
      assertEquals(
        p,
        beforePrompt,
        "refusal leaves whole prompt open and unchanged",
      );
      assertEquals(
        h.fake._data.field_delivery_reports,
        [],
        "no partial report",
      );
      assertEquals(
        inbound.applied_effect,
        undefined,
        "no durable effect on refused inbound",
      );
      assertEquals(
        inbound.needs_review,
        true,
        "refusal has durable needs_review row",
      );
      assertEquals(
        inbound.owner_user_id,
        "studio-a",
        "refusal has review owner",
      );
    } else {
      assertEquals(result.disposition, "ref_applied");
      assertEquals(
        h.fake._data.field_delivery_reports[0].condition_note,
        body,
        "2000-character report saved in full",
      );
      assertEquals(p.consumed_sid, `SMcondition${length}`);
      assert(p.consumption_result, "successful report has immutable receipt");
    }
  });
}

Deno.test("task reply payload bytes retain main command contract", async () => {
  for (
    const [verb, intent] of [
      ["DONE", "mark_done"],
      ["OK", "confirm_delivery"],
      ["HERE", "report_arrival"],
      ["LEAVING", "report_departure"],
    ]
  ) {
    const { h, prompt, effects } = inboundFixture();
    prompt({ kind: intent });
    const body = `${verb} 17`;
    const result = await processInbound({
      From: h.recipient,
      To: h.sender,
      Body: body,
      MessageSid: `SMtask${verb}`,
      NumMedia: "0",
    }, {
      supabase: h.fake as never,
      now: h.clock,
      getEnv: h.env,
      fetchImpl: h.provider.fetch,
      parseFn: realParseFn,
    });
    assertEquals(result.disposition, "ref_applied");
    assertEquals(
      JSON.stringify(effects[0].p_effect),
      JSON.stringify({
        type: intent,
        note: body,
        target: { kind: "task", id: "task-a" },
      }),
      `${verb}: byte-identical main payload`,
    );
  }
});
