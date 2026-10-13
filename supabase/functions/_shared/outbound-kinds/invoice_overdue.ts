import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { OutboundDraft } from "../outbound-send.ts";
import type { OutboundEmailRender, OutboundKindContext } from "./types.ts";
import { afterSendInvoiceReminder, renderInvoiceReminderEmail } from "./invoice_reminder.ts";

export async function renderEmail(ctx: { admin: SupabaseClient; draft: OutboundDraft }): Promise<OutboundEmailRender> {
  return renderInvoiceReminderEmail(ctx);
}

export async function afterSend(ctx: OutboundKindContext): Promise<void> {
  await afterSendInvoiceReminder(ctx);
}
