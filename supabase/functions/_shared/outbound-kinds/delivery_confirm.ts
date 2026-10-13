import type { OutboundKindContext } from "./types.ts";
export async function afterSend({ admin, draft }: OutboundKindContext): Promise<void> {
  const { error } = await admin.from("sms_prompts").update({ pending_send: false })
    .eq("outbound_draft_id", draft.id).eq("pending_send", true);
  if (error) throw error;
  const vars = draft.payload.sms_vars as Record<string, unknown> | undefined;
  const eventId = vars?.__event_id;
  const partyId = vars?.__conversation_party_id;
  if (typeof eventId !== "string" || typeof partyId !== "string" || !draft.project_id) return;
  const { data: rows, error: readError } = await admin.from("sms_conversation_context")
    .select("conversation_id, state_context").eq("party_id", partyId).eq("project_id", draft.project_id);
  if (readError) throw readError;
  const row = rows?.[0] as { conversation_id: string; state_context: Record<string, unknown> } | undefined;
  if (!row) return;
  const prior = Array.isArray(row.state_context.delivery_confirms_sent)
    ? row.state_context.delivery_confirms_sent as string[] : [];
  if (prior.includes(eventId)) return;
  const { error: updateError } = await admin.from("sms_conversation_context")
    .update({ state_context: { ...row.state_context, delivery_confirms_sent: [...prior, eventId] } })
    .eq("conversation_id", row.conversation_id);
  if (updateError) throw updateError;
}
