import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "./send-email.ts";
import { sendPartySms, sendClientSms } from "./sms.ts";
import { renderBrandedShell } from "./branded-email.ts";
import { resolveStudioIdentity, studioCobrand } from "./studio-identity.ts";
import { outboundKinds } from "./outbound-kinds/index.ts";
import type { SendAuthority, OutboundKind } from "./send-authority.ts";
import type { OutboundKindContext } from "./outbound-kinds/types.ts";

export interface OutboundDraft {
  id: string; organization_id: string; project_id: string | null; kind: OutboundKind;
  channel: "email" | "sms" | "push"; recipient_kind: string; to_contact_id: string | null;
  to_client_id: string | null; to_party_id: string | null; to_address: string | null;
  subject: string | null; body: string; payload: Record<string, unknown>; ref_type: string;
  ref_id: string; status: string; sent_by: string | null; edited_at?: string | null;
}
export type OutboundSendResult = { id: string; ok: boolean; messageId?: string; error?: string };

export async function sendOutboundDraft(
  admin: SupabaseClient,
  draftId: string,
  authority: SendAuthority,
): Promise<OutboundSendResult> {
  const fail = async (message: string): Promise<OutboundSendResult> => {
    try {
      await admin.rpc("release_outbound_draft_claim", { p_id: draftId });
    } catch (releaseError) {
      console.error("outbound draft claim release failed", releaseError);
    }
    return { id: draftId, ok: false, error: message };
  };
  let draft: OutboundDraft;
  try {
    const { data, error: claimError } = await admin.rpc("claim_outbound_draft_for_send", { p_id: draftId });
    if (claimError || !data) {
      const message = claimError?.message ?? "claim returned no draft";
      return { id: draftId, ok: false, error: /not_sendable|not awaiting|expired|superseded|discarded/i.test(message) ? "not_sendable" : message };
    }
    draft = data as OutboundDraft;
    if (draft.status !== "sending") return { id: draftId, ok: false, error: "not_sendable" };
    let messageId: string | undefined;
    if (draft.channel === "email") {
      if (!draft.to_address || !draft.subject) return await fail("email recipient or subject missing");
      const kind = outboundKinds[draft.kind];
      const rendered = await kind?.renderEmail?.({ admin, draft });
      let html: string;
      let text: string | undefined;
      let replyTo: string | undefined;
      let from: string | undefined;
      let userId: string | undefined;
      if (rendered) {
        ({ html, text, replyTo, from, userId } = rendered);
      } else {
        const identity = await resolveStudioIdentity(admin, { projectId: draft.project_id, studioId: draft.organization_id });
        html = renderBrandedShell({
          title: draft.subject, audience: draft.recipient_kind === "client" ? "client" : "designer",
          ...studioCobrand(identity),
          body: `<div style="white-space:pre-wrap;font:16px/1.6 Arial,sans-serif">${escapeHtml(draft.body)}</div>`,
        });
        text = draft.body;
      }
      const sent = await sendCompliantEmail(admin, {
        to: draft.to_address, subject: draft.subject, html, text, replyTo, from, userId,
        category: "operational", notificationType: "outbound_draft", templateId: `outbound-${draft.kind}`,
        metadata: { outbound_draft_id: draft.id, kind: draft.kind },
        ref: { type: "outbound_draft", id: draft.id }, organizationId: draft.organization_id,
        idempotencyKey: `outbound-draft-${draft.id}`, authority,
      });
      if (!sent.success) return await fail(sent.error ?? "email_send_failed");
      messageId = sent.id;
    } else if (draft.channel === "sms") {
      const templateKey = !draft.edited_at && typeof draft.payload.sms_template_key === "string"
        ? draft.payload.sms_template_key
        : undefined;
      const templateVars = draft.payload.sms_vars && typeof draft.payload.sms_vars === "object"
        ? draft.payload.sms_vars as Record<string, unknown>
        : undefined;
      const smsInput = {
        partyId: draft.to_party_id ?? undefined, phone: draft.to_address ?? undefined,
        projectId: draft.project_id ?? undefined,
        body: templateKey ? undefined : draft.body,
        templateKey,
        vars: templateVars,
        clientInvitationId: typeof draft.payload.client_invitation_id === "string"
          ? draft.payload.client_invitation_id
          : undefined,
        automationPhase: typeof draft.payload.automation_phase === "number"
          ? draft.payload.automation_phase
          : undefined,
        cadenceClass: draft.payload.cadence_class === "event" || draft.payload.cadence_class === "recurring"
          ? draft.payload.cadence_class as "event" | "recurring"
          : undefined,
        dedupeKey: `outbound-draft-${draft.id}`, authority,
      };
      const sent = draft.recipient_kind === "client" && templateKey
        ? await sendClientSms(admin, smsInput)
        : await sendPartySms(admin, smsInput);
      if (sent.status === "deferred") {
        messageId = sent.messageId;
      } else if (!sent.sent) return await fail(sent.reason ?? "sms_send_failed");
      else messageId = sent.messageId;
    } else {
      const userId = typeof draft.payload.user_id === "string" ? draft.payload.user_id : draft.to_client_id;
      if (!userId) return await fail("push recipient missing");
      const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/apns-send`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ user_id: userId, title: draft.subject ?? "", body: draft.body, entity_type: draft.ref_type, entity_id: draft.ref_id, audience: "app", authority }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.failed > 0 || result?.error) return await fail(result?.error ?? `apns_http_${response.status}`);
      messageId = typeof result?.message_id === "string" ? result.message_id : undefined;
    }
    const afterSendContext: OutboundKindContext & { authority: SendAuthority } = {
      admin, draft, messageId: messageId ?? null, authority,
    };
    await outboundKinds[draft.kind]?.afterSend?.(afterSendContext);
    const { error: markError } = await admin.rpc("mark_outbound_draft_sent", {
      p_id: draft.id, p_sent_by: authority.kind === "designer" ? authority.userId : null,
      p_message_id: messageId ?? null,
    });
    if (markError) return await fail(markError.message);
    return { id: draftId, ok: true, messageId };
  } catch (error) {
    return await fail(error instanceof Error ? error.message : "send_failed");
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
