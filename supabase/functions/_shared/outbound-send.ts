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
  message_id?: string | null; delivered_at?: string | null; delivery_message_id?: string | null;
  send_attempted_at?: string | null; finalizing_at?: string | null;
  after_send_done_at?: string | null; last_send_outcome?: "rejected" | "unknown" | null;
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
  let messageId: string | undefined;
  try {
    const { data, error: claimError } = await admin.rpc("claim_outbound_draft_for_send", { p_id: draftId });
    if (claimError || !data) {
      const message = claimError?.message ?? "claim returned no draft";
      // A retry of a delivered draft finishes it and never reaches the provider.
      if (/already delivered/i.test(message)) return await finalizeOutboundDraft(admin, draftId, authority);
      return { id: draftId, ok: false, error: /not_sendable|not awaiting|expired|superseded|discarded/i.test(message) ? "not_sendable" : message };
    }
    draft = data as OutboundDraft;
    // 00785: the claim handed a stale push attempt back to review, outcome unknown.
    if (draft.status === "awaiting_review" && draft.last_send_outcome === "unknown") {
      return { id: draftId, ok: false, error: "send_outcome_unknown" };
    }
    if (draft.status !== "sending") return { id: draftId, ok: false, error: "not_sendable" };
    // A draft whose last outcome is unknown may already have reached the
    // recipient. Only the studio decides to send it again; automation never does.
    if (draft.last_send_outcome === "unknown" && authority.kind !== "designer") return await fail("send_outcome_unknown");
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
        // 00785 F20: no outbound-draft text is queued inside sms.ts. A queued row is
        // not a provider acceptance; outside the window the draft goes back to review.
        deferToCaller: true,
        dedupeKey: `outbound-draft-${draft.id}`, authority,
      };
      const sent = draft.recipient_kind === "client" && templateKey
        ? await sendClientSms(admin, smsInput)
        : await sendPartySms(admin, smsInput);
      if (sent.status === "deferred") return await fail("not_sendable_until_send_window");
      if (sent.reason === "duplicate_send_claim") {
        // This draft's text already holds a live send row. It is a delivery only
        // once the provider accepted that row; until then the send is in flight,
        // so nothing is recorded and the draft is not released to review.
        if (!(await smsSendAccepted(admin, smsInput.dedupeKey))) return { id: draftId, ok: false, error: "send_in_progress" };
      } else if (!sent.sent && !sent.twilioSid) {
        // A Twilio SID is an acceptance even when sms.ts could not record it (sid_unrecorded).
        return await fail(sent.reason ?? "sms_send_failed");
      }
      messageId = sent.messageId;
    } else {
      const userId = typeof draft.payload.user_id === "string" ? draft.payload.user_id : draft.to_client_id;
      if (!userId) return await fail("push recipient missing");
      // Push has no provider idempotency key. The attempt is durable before APNs is
      // called; from here 00784 refuses to release or reclaim the draft until the
      // outcome is known.
      const { error: attemptError } = await admin.rpc("record_outbound_draft_send_attempt", { p_id: draft.id });
      if (attemptError) return await fail(attemptError.message);
      const outcome = await pushOutboundDraft(draft, userId, authority);
      if (outcome.rejected) {
        // F21: the provider refused it, so nothing went out. Clear the attempt and
        // hand the draft back to review.
        const { error: rejectError } = await admin.rpc("record_outbound_draft_send_rejected", { p_id: draft.id });
        if (rejectError) console.error("outbound draft rejection record failed", draft.id, rejectError);
        return { id: draftId, ok: false, error: outcome.rejected };
      }
      // No answer came back: it may have gone out. The attempt stays recorded; once
      // its claim is stale, 00785 hands it back to review marked 'unknown'.
      if (!outcome.accepted) return { id: draftId, ok: false, error: "send_outcome_unknown" };
      messageId = outcome.messageId;
    }
  } catch (error) {
    return await fail(error instanceof Error ? error.message : "send_failed");
  }
  // The provider has the message. From here the draft is never released to review:
  // it stays 'sending' with delivered_at set until finalizing succeeds.
  try {
    const { error: recordError } = await admin.rpc("record_outbound_draft_delivery", {
      p_id: draft.id, p_message_id: messageId ?? null,
    });
    if (recordError) return { id: draftId, ok: false, error: recordError.message };
  } catch (error) {
    return { id: draftId, ok: false, error: error instanceof Error ? error.message : "delivery_record_failed" };
  }
  return await finalizeOutboundDraft(admin, draft.id, authority);
}

/**
 * Finishes a draft the provider already accepted: runs its kind's afterSend
 * once, then marks it sent. Never calls a provider. Only the caller that wins the
 * per-draft finalize claim runs the hook, and after_send_done_at (00785) keeps a
 * later finalize from running it again. Used after a send records its delivery,
 * by a retry of a delivered draft (sendOutboundDraft routes there) and by
 * {finalize:true}.
 */
export async function finalizeOutboundDraft(
  admin: SupabaseClient,
  draftId: string,
  authority: SendAuthority,
): Promise<OutboundSendResult> {
  const { data, error } = await admin.rpc("claim_outbound_draft_finalize", { p_id: draftId });
  if (error || !data) {
    const message = error?.message ?? "finalize claim returned no draft";
    if (/not delivered/i.test(message)) return { id: draftId, ok: false, error: "not_delivered" };
    if (/already being finalized/i.test(message)) return { id: draftId, ok: false, error: "finalize_in_progress" };
    return { id: draftId, ok: false, error: message };
  }
  const draft = data as OutboundDraft;
  if (draft.status === "sent") return { id: draftId, ok: true, messageId: draft.message_id ?? undefined };
  const messageId = draft.delivery_message_id ?? null;
  const release = async (message: string): Promise<OutboundSendResult> => {
    // A failed finalizer hands its claim back so Retry can run now; a lost
    // release goes stale after 10 minutes.
    try {
      await admin.rpc("release_outbound_draft_finalize", { p_id: draft.id, p_finalizing_at: draft.finalizing_at });
    } catch (releaseError) {
      console.error("outbound draft finalize release failed", releaseError);
    }
    return { id: draft.id, ok: false, error: message };
  };
  try {
    if (!draft.after_send_done_at) {
      const afterSendContext: OutboundKindContext & { authority: SendAuthority } = { admin, draft, messageId, authority };
      await outboundKinds[draft.kind]?.afterSend?.(afterSendContext);
      // F19: recorded by the claim holder as soon as the hook succeeds; a retry
      // of this draft only re-attempts the mark.
      const { error: doneError } = await admin.rpc("record_outbound_draft_after_send", {
        p_id: draft.id, p_finalizing_at: draft.finalizing_at,
      });
      if (doneError) return await release(doneError.message);
    }
    const { error: markError } = await admin.rpc("mark_outbound_draft_sent", {
      p_id: draft.id, p_sent_by: authority.kind === "designer" ? authority.userId : null,
      p_message_id: messageId,
    });
    if (markError) return await release(markError.message);
    return { id: draft.id, ok: true, messageId: messageId ?? undefined };
  } catch (error) {
    return await release(error instanceof Error ? error.message : "finalize_failed");
  }
}

/**
 * One apns-send call, read as delivery truth: accepted only when a device took
 * it (sent > 0); rejected when apns-send refused the request (4xx) or answered
 * that nothing went out (sent 0, failed, skipped, an error body); otherwise the
 * outcome is unknown (no answer, a timeout, an unreadable reply, or a 5xx, which
 * apns-send also returns when it throws after APNs took the push).
 */
async function pushOutboundDraft(
  draft: OutboundDraft,
  userId: string,
  authority: SendAuthority,
): Promise<{ accepted: boolean; messageId?: string; rejected?: string }> {
  let response: Response;
  try {
    response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/apns-send`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ user_id: userId, title: draft.subject ?? "", body: draft.body, entity_type: draft.ref_type, entity_id: draft.ref_id, audience: "app", authority }),
    });
  } catch (error) {
    console.error("outbound draft push outcome unknown", draft.id, error);
    return { accepted: false };
  }
  const reply = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (reply && Number(reply.sent) > 0) {
    const id = reply.provider_id ?? reply.message_id;
    return { accepted: true, messageId: typeof id === "string" ? id : undefined };
  }
  if (response.status >= 400 && response.status < 500) {
    return { accepted: false, rejected: typeof reply?.error === "string" ? reply.error : `apns_http_${response.status}` };
  }
  if (response.ok && reply && (typeof reply.error === "string" || typeof reply.skipped === "string" || typeof reply.sent === "number" || Number(reply.failed) > 0)) {
    return { accepted: false, rejected: String(reply.error ?? reply.skipped ?? "push_not_accepted") };
  }
  return { accepted: false };
}

/** The statuses that free a send claim in sms_messages_send_claim_uniq (00640). */
const SMS_RELEASED_STATUSES = ["failed", "undelivered", "canceled", "expired", "suppressed"];

/**
 * Whether the live sms_messages row behind a duplicate_send_claim was accepted
 * by the provider. sms.ts reports the duplicate for any live row under this
 * dedupe key (00640 sms_messages_send_claim_uniq), including a claimed or
 * queued row the provider never took.
 */
async function smsSendAccepted(admin: SupabaseClient, dedupeKey: string): Promise<boolean> {
  const { data, error } = await admin.from("sms_messages").select("twilio_sid, twilio_status")
    .eq("direction", "outbound").eq("dedupe_key", dedupeKey);
  if (error) return false;
  return ((data ?? []) as Array<{ twilio_sid: string | null; twilio_status: string | null }>).some((row) =>
    !SMS_RELEASED_STATUSES.includes(row.twilio_status ?? "claimed") &&
    (!!row.twilio_sid || row.twilio_status === "sent" || row.twilio_status === "delivered")
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
