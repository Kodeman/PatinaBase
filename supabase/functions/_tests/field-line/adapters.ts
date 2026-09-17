// One re-baseline seam for the Field Line synthetic harness. The harness only
// binds these public entry points so a future pipeline re-baseline changes this
// adapter rather than every fixture and evidence case.
import { flushDeferredMessages, sendPartySms } from "../../_shared/sms.ts";
import { runFieldDaily } from "../../field-daily/core.ts";
import { processInbound } from "../../sms-inbound/pipeline.ts";

export const fieldLineBindings = {
  processInbound,
  sendPartySms,
  flushDeferredMessages,
  runFieldDaily,
};
