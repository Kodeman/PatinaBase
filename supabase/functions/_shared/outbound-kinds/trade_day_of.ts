import type { OutboundKindContext } from "./types.ts";
export async function afterSend({ admin, draft }: OutboundKindContext): Promise<void> {
  const { error: promptError } = await admin.from("sms_prompts").update({ pending_send: false })
    .eq("outbound_draft_id", draft.id).eq("pending_send", true);
  if (promptError) throw promptError;
  if (draft.payload.sms_template_key !== "sms_day_of" || !draft.project_id || !draft.to_party_id) return;
  const vars = draft.payload.sms_vars as Record<string, unknown> | undefined;
  const day = typeof vars?.__site_day === "string" ? vars.__site_day : null;
  if (!day) return;
  const { data: rows, error: contextError } = await admin.from("sms_conversation_context")
    .select("conversation_id, state_context").eq("party_id", draft.to_party_id)
    .eq("project_id", draft.project_id).is("backfilled_at", null);
  if (contextError) throw contextError;
  const context = rows?.[0] as { conversation_id: string; state_context: Record<string, unknown> } | undefined;
  if (!context) return;
  const prior = Array.isArray(context.state_context.crew_posts_sent)
    ? context.state_context.crew_posts_sent.map(String) : [];
  if (prior.includes(day)) return;
  const { data: threads, error: threadError } = await admin.from("comms_threads").select("id")
    .eq("project_id", draft.project_id).eq("kind", "project").order("created_at", { ascending: true }).limit(1);
  if (threadError) throw threadError;
  const threadId = threads?.[0]?.id;
  if (!threadId) return;
  const nextContext = { ...context.state_context, crew_posts_sent: [...prior, day] };
  const { data: claimed, error: claimError } = await admin.from("sms_conversation_context")
    .update({ state_context: nextContext }).eq("conversation_id", context.conversation_id)
    .eq("project_id", draft.project_id).eq("party_id", draft.to_party_id)
    .eq("state_context", JSON.stringify(context.state_context)).is("backfilled_at", null).select("conversation_id");
  if (claimError) throw claimError;
  if (!claimed?.length) return;
  const date = new Date(`${day}T12:00:00Z`);
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  const { error } = await admin.from("comms_messages").insert({
    thread_id: threadId, sender_id: null, system: true,
    body: `Crew on the way for ${label}.`, created_at: new Date().toISOString(),
  });
  if (error) throw error;
}
