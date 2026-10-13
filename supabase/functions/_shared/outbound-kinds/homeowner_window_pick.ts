import type { OutboundKindContext } from "./types.ts";
export async function afterSend({ admin, draft }: OutboundKindContext): Promise<void> {
  const { error: promptError } = await admin.from("sms_prompts").update({ pending_send: false })
    .eq("outbound_draft_id", draft.id).eq("pending_send", true);
  if (promptError) throw promptError;
  const vars = draft.payload.sms_vars as Record<string, unknown> | undefined;
  const reminderBatchId = typeof vars?.__reminder_batch_id === "string" ? vars.__reminder_batch_id : null;
  if (reminderBatchId) {
    const { error } = await admin.from("client_decision_batches")
      .update({ reminder_sent_at: new Date().toISOString() }).eq("id", reminderBatchId).is("reminder_sent_at", null);
    if (error) throw error;
  }
  const batchId = typeof vars?.__batch_id === "string" ? vars.__batch_id : null;
  if (batchId) {
    const update: Record<string, unknown> = { pending_send: false, presented_at: new Date().toISOString() };
    const { error } = await admin.from("client_decision_batches").update(update)
      .eq("id", batchId).eq("outbound_draft_id", draft.id).eq("pending_send", true);
    if (error) throw error;
  }
  const { error: batchError } = await admin.from("client_decision_batches").update({ pending_send: false })
    .eq("outbound_draft_id", draft.id).eq("pending_send", true);
  if (batchError) throw batchError;
}
