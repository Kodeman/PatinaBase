import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SendAuthority } from "../_shared/send-authority.ts";
import { sendOutboundDraft } from "../_shared/outbound-send.ts";

export interface ReviewDraftParams {
  studioId: string;
  projectId: string;
  clientId: string | null;
  clientEmail: string;
  subject: string;
  body: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

type SendDraft = (admin: SupabaseClient, id: string, authority: SendAuthority) => Promise<{ ok: boolean; error?: string }>;

export async function composeAndMaybeSendReviewDraft(
  admin: SupabaseClient,
  params: ReviewDraftParams,
  sendDraft: SendDraft = sendOutboundDraft,
): Promise<{ ok: boolean; scheduled: boolean; draftId?: string; error?: string }> {
  const { data: draftId, error } = await admin.rpc("compose_outbound_draft", {
    p_kind: "review_request", p_org: params.studioId, p_project: params.projectId,
    p_channel: "email", p_recipient_kind: "client",
    p_to: { client_id: params.clientId, address: params.clientEmail },
    p_subject: params.subject, p_body: params.body, p_payload: params.payload,
    p_ref_type: "project", p_ref_id: params.projectId, p_dedupe_key: params.dedupeKey,
    p_due_at: null, p_expires_at: null, p_composed_by: "system",
  });
  if (error || typeof draftId !== "string") {
    return { ok: false, scheduled: false, error: error?.message ?? "draft_compose_returned_no_id" };
  }
  const { data: mode } = await admin.rpc("studio_outbound_mode", {
    p_studio: params.studioId, p_kind: "review_request",
  });
  const { data: rolloutActive } = await admin.rpc("outbound_review_active", {
    p_studio: params.studioId,
  });
  const scheduled = mode === "scheduled" || rolloutActive !== true;
  if (!scheduled) return { ok: true, scheduled: false, draftId };
  const result = await sendDraft(admin, draftId, {
    kind: "studio_schedule", studioId: params.studioId, outboundKind: "review_request",
  });
  return { ok: result.ok, scheduled: true, draftId, error: result.error };
}
