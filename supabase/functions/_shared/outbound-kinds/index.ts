import type { OutboundKind } from "../send-authority.ts";
import type { OutboundKindModule } from "./types.ts";
import { afterSend as invoiceReminder } from "./invoice_reminder.ts";
import { afterSend as invoiceOverdue } from "./invoice_overdue.ts";
import { afterSend as decisionReminder } from "./decision_reminder.ts";
import { afterSend as decisionOverdue } from "./decision_overdue.ts";
import { afterSend as clientDigest } from "./client_digest.ts";
import { afterSend as reviewRequest } from "./review_request.ts";
import { afterSend as tradeSiteDigest } from "./trade_site_digest.ts";
import { afterSend as tradeDayOf } from "./trade_day_of.ts";
import { afterSend as deliveryConfirm } from "./delivery_confirm.ts";
import { afterSend as siteRequestDue } from "./site_request_due.ts";
import { afterSend as homeownerWindowPick } from "./homeowner_window_pick.ts";
import { afterSend as hoursPrompt } from "./hours_prompt.ts";
export const outboundKinds: Record<OutboundKind, OutboundKindModule> = {
  invoice_reminder: { afterSend: invoiceReminder }, invoice_overdue: { afterSend: invoiceOverdue },
  decision_reminder: { afterSend: decisionReminder }, decision_overdue: { afterSend: decisionOverdue },
  client_digest: { afterSend: clientDigest }, review_request: { afterSend: reviewRequest },
  trade_site_digest: { afterSend: tradeSiteDigest }, trade_day_of: { afterSend: tradeDayOf },
  delivery_confirm: { afterSend: deliveryConfirm }, site_request_due: { afterSend: siteRequestDue },
  homeowner_window_pick: { afterSend: homeownerWindowPick }, hours_prompt: { afterSend: hoursPrompt },
};
