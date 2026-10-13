import type { OutboundKindContext } from "./types.ts";
export async function afterSend({ admin, draft }: OutboundKindContext): Promise<void> {
  const { error } = await admin.from("sms_prompts").update({ pending_send: false })
    .eq("outbound_draft_id", draft.id).eq("pending_send", true);
  if (error) throw error;
}
