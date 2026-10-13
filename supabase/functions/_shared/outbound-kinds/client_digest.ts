import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReminderDigestEmail, type ReminderDigestItem } from "../../notification-digest/logic.ts";
import type { OutboundDraft } from "../outbound-send.ts";
import type { OutboundKindContext } from "./types.ts";

export async function afterSend({ admin, draft }: OutboundKindContext): Promise<void> {
  const userId = draft.payload.user_id;
  const sentAt = draft.payload.watermark_at;
  if (typeof userId !== "string" || typeof sentAt !== "string") {
    throw new Error("client_digest draft is missing its watermark data");
  }
  const { error } = await admin
    .from("notification_preferences")
    .update({ last_reminder_digest_sent_at: sentAt })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function renderEmail({ draft }: { admin: SupabaseClient; draft: OutboundDraft }): Promise<{
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
  userId?: string;
}> {
  const period = draft.payload.digest_period === "weekly_sunday" ? "weekly_sunday" : "daily";
  const items = Array.isArray(draft.payload.digest_items)
    ? draft.payload.digest_items as ReminderDigestItem[]
    : [];
  const defaultBody = items.map((item) => item.title).join("\n");
  const baseUrl = typeof draft.payload.client_portal_url === "string"
    ? draft.payload.client_portal_url
    : "https://client.patina.cloud";
  const rendered = buildReminderDigestEmail(
    items,
    baseUrl,
    typeof draft.payload.time_zone === "string" ? draft.payload.time_zone : null,
    period,
    draft.body === defaultBody ? undefined : draft.body,
  );
  const replyTo = draft.payload.reply_to;
  return {
    html: rendered.html,
    text: `${draft.subject ?? rendered.subject}\n\n${draft.body}\n\nOpen Patina: ${baseUrl}`,
    ...(typeof replyTo === "string" && replyTo ? { replyTo } : {}),
    userId: typeof draft.payload.user_id === "string" ? draft.payload.user_id : undefined,
  };
}
