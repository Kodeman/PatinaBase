import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandedShell, paragraph, escapeHtml, ctaButton, muted, signOff } from "../branded-email.ts";
import { clientDecisionLink } from "../client-portal-links.ts";
import { fireDecisionInApp, resolveDecisionSignature } from "../decision-notify.ts";
import { resolveStudioIdentity, studioCobrand } from "../studio-identity.ts";
import type { OutboundDraft } from "../outbound-send.ts";
import type { OutboundKindContext } from "./types.ts";

export async function renderEmail(ctx: { admin: SupabaseClient; draft: OutboundDraft }): Promise<{ html: string; text?: string; replyTo?: string; from?: string; userId?: string }> {
  // The scheduled composer enforces 8am-local/non-Sunday; never reject a human's explicit Send here.
  const { admin, draft } = ctx;
  const payload = draft.payload;
  const projectId = draft.project_id;
  const designerId = typeof payload.designer_id === "string" ? payload.designer_id : null;
  const identity = await resolveStudioIdentity(admin, { projectId, studioId: draft.organization_id });
  const signature = await resolveDecisionSignature(admin, { projectId, designerId });
  const recipientId = typeof payload.recipient_id === "string" ? payload.recipient_id : draft.to_client_id ?? undefined;
  const url = clientDecisionLink("https://client.patina.cloud", draft.ref_id);
  const html = renderBrandedShell({
    title: draft.subject ?? "Decision reminder",
    preview: draft.body.slice(0, 140), eyebrow: "Decision reminder", audience: "client",
    ...studioCobrand(identity),
    body: [paragraph(escapeHtml(draft.body).replace(/\n/g, "<br>")),
      ctaButton(url, "Review this decision"),
      muted(`Or open it directly: <a href="${escapeHtml(url)}" style="color:#4E7A66;text-decoration:none;">${escapeHtml(url)}</a>`),
      signOff(signature)].join(""),
  });
  const { data: designer } = designerId
    ? await admin.from("profiles").select("email").eq("id", designerId).maybeSingle()
    : { data: null };
  return { html, text: `${draft.body}\n\nReview this decision: ${url}`, replyTo: typeof designer?.email === "string" ? designer.email : undefined, userId: recipientId };
}

export async function afterSend(ctx: OutboundKindContext): Promise<void> {
  const decisionId = ctx.draft.ref_id;
  const payload = ctx.draft.payload;
  const inApp = await fireDecisionInApp(ctx.admin, decisionId, "decision_required");
  if (!inApp.ok) throw new Error(inApp.error ?? "decision reminder in-app write failed");
  if (payload.project_approval === true && typeof payload.recipient_id === "string") {
    const { error } = await ctx.admin.rpc("stamp_project_approval_reminder_delivery", {
      p_decision_id: decisionId, p_decision_lead_id: payload.recipient_id,
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await ctx.admin.from("client_decisions").update({ reminder_sent_at: new Date().toISOString() }).eq("id", decisionId);
  if (error) throw new Error(error.message);
}
