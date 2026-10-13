import type { OutboundKindContext } from "./types.ts";

export async function afterSend({ admin, draft }: OutboundKindContext): Promise<void> {
  const { error } = await admin.from("site_requests")
    .update({ due_reminder_sent_at: new Date().toISOString() })
    .eq("id", draft.ref_id)
    .is("due_reminder_sent_at", null);
  if (error) throw new Error("site_request_due_reminder_stamp_failed");
}
