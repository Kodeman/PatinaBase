import type { OutboundKind } from "../send-authority.ts";
import type { OutboundKindModule } from "./types.ts";
import * as invoiceReminder from "./invoice_reminder.ts";
import * as invoiceOverdue from "./invoice_overdue.ts";
import * as decisionReminder from "./decision_reminder.ts";
import * as decisionOverdue from "./decision_overdue.ts";
import * as clientDigest from "./client_digest.ts";
import * as reviewRequest from "./review_request.ts";
import * as tradeSiteDigest from "./trade_site_digest.ts";
import * as tradeDayOf from "./trade_day_of.ts";
import * as deliveryConfirm from "./delivery_confirm.ts";
import * as siteRequestDue from "./site_request_due.ts";
import * as homeownerWindowPick from "./homeowner_window_pick.ts";
import * as hoursPrompt from "./hours_prompt.ts";

function moduleOf(module: OutboundKindModule): OutboundKindModule {
  return { afterSend: module.afterSend, renderEmail: module.renderEmail };
}

export const outboundKinds: Record<OutboundKind, OutboundKindModule> = {
  invoice_reminder: moduleOf(invoiceReminder), invoice_overdue: moduleOf(invoiceOverdue),
  decision_reminder: moduleOf(decisionReminder), decision_overdue: moduleOf(decisionOverdue),
  client_digest: moduleOf(clientDigest), review_request: moduleOf(reviewRequest),
  trade_site_digest: moduleOf(tradeSiteDigest), trade_day_of: moduleOf(tradeDayOf),
  delivery_confirm: moduleOf(deliveryConfirm), site_request_due: moduleOf(siteRequestDue),
  homeowner_window_pick: moduleOf(homeownerWindowPick), hours_prompt: moduleOf(hoursPrompt),
};
