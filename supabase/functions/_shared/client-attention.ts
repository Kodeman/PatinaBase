// client-attention — the one way an edge function tells a homeowner that
// something of theirs needs them.
//
// Wraps the `notify_client_attention` RPC (migration 00534), which writes two
// notification_log rows: the in-app bell row (never handed to apns-send, so a
// failed push cannot delete it) and a push row whose id apns-send is given.
// The RPC is granted to service_role ONLY — call it with a service-role client.
//
// Best-effort by contract. A notification must never fail a send, so every
// failure here is swallowed into { ok: false, error } and nothing throws. The
// caller logs and carries on.

export type AttentionEntityType = "proposal" | "invoice" | "decision";

const ROUTABLE: readonly AttentionEntityType[] = ["proposal", "invoice", "decision"];

export interface AttentionInput {
  userId: string;
  entityType: AttentionEntityType;
  entityId: string;
  title: string;
  /** Rendered under the title in the bell. Patina's voice — never vendor text. */
  body: string;
  /** Merged into metadata: project_id, amount_cents, due_date … */
  metadata?: Record<string, unknown>;
}

export interface AttentionResult {
  ok: boolean;
  error?: string;
}

/** The minimum of a Supabase client this needs — keeps the tests network-free.
 *  `rpc` is PromiseLike, not Promise: supabase-js returns a thenable builder. */
export interface AttentionRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ error: { message?: string } | null }>;
}

export async function notifyClientAttention(
  admin: AttentionRpcClient,
  input: AttentionInput,
): Promise<AttentionResult> {
  if (!ROUTABLE.includes(input.entityType)) {
    return { ok: false, error: `unroutable_entity_type:${input.entityType}` };
  }
  if (!input.userId || !input.entityId || !input.title) {
    return { ok: false, error: "incomplete_attention_input" };
  }

  try {
    const { error } = await admin.rpc("notify_client_attention", {
      p_user_id: input.userId,
      p_entity_type: input.entityType,
      p_entity_id: input.entityId,
      p_title: input.title,
      p_body: input.body ?? "",
      p_metadata: input.metadata ?? {},
    });
    if (error) {
      return { ok: false, error: error.message ?? "notify_client_attention_failed" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "notify_client_attention_threw",
    };
  }
}
