import { createFieldLineHarness } from "../harness.ts";
import type { GateCase } from "../types.ts";

export const duplicateTwilioSid: GateCase = {
  id: "duplicate-twilio-sid",
  phase: 0,
  clauses: ["S5"],
  async run() {
    const harness = createFieldLineHarness();
    const first = await harness.processInbound({ Body: "unrecognized words", MessageSid: "SMfieldDuplicate" });
    const second = await harness.processInbound({ Body: "unrecognized words", MessageSid: "SMfieldDuplicate" });
    const rows = (harness.fake._data.sms_messages ?? []).filter((row) =>
      row.direction === "inbound" && row.twilio_sid === "SMfieldDuplicate"
    );
    const passed = first.disposition !== "duplicate" && second.disposition === "duplicate" && rows.length === 1;
    return [{
      caseId: "duplicate-twilio-sid",
      clause: "S5",
      status: passed ? "pass" : "fail",
      reason: passed
        ? "one durable inbound record survives a repeated Twilio MessageSid"
        : `expected first processing, duplicate disposition, and one row; got ${first.disposition}/${second.disposition}/${rows.length}`,
    }];
  },
};
