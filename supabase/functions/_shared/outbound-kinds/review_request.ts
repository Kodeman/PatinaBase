import { ctaButton, escapeHtml, muted, paragraph, renderBrandedShell, signOff, spacer, type StudioSignOff } from "../branded-email.ts";
import type { OutboundEmailRender, OutboundKindContext } from "./types.ts";

const FROM_ADDRESS = Deno.env.get("RESEND_FROM") ?? "hello@patina.cloud";

export async function renderEmail({ draft }: Pick<OutboundKindContext, "admin" | "draft">): Promise<OutboundEmailRender> {
  const payload = draft.payload;
  const reviewUrl = typeof payload.doorstep_url === "string" ? payload.doorstep_url : "";
  if (!reviewUrl) throw new Error("review_request draft is missing its doorstep URL");
  const signature: StudioSignOff = {
    designerGivenName: typeof payload.designer_given_name === "string" ? payload.designer_given_name : null,
    studioName: typeof payload.studio_name === "string" ? payload.studio_name : null,
    city: typeof payload.signature_city === "string" ? payload.signature_city : null,
  };
  const body = escapeHtml(draft.body).replace(/\n/g, "<br>");
  const html = renderBrandedShell({
    title: draft.subject ?? "",
    audience: "client",
    preview: typeof payload.project_name === "string" ? `Your ${payload.project_name} project is complete — we'd love to hear what you thought.` : draft.body,
    eyebrow: "Review request",
    studioName: typeof payload.cobrand_studio_name === "string" ? payload.cobrand_studio_name : undefined,
    studioLogoUrl: typeof payload.studio_logo_url === "string" ? payload.studio_logo_url : undefined,
    body: [
      paragraph(body),
      spacer(6),
      ctaButton(reviewUrl, "Share Your Experience", "ink"),
      spacer(10),
      muted(`Can&apos;t click the button? Copy this link into your browser:<br><a href="${escapeHtml(reviewUrl)}" style="color:#4E7A66; text-decoration:underline; word-break:break-all;">${escapeHtml(reviewUrl)}</a>`),
      signOff(signature),
    ].join(""),
  });
  return {
    html,
    text: draft.body,
    replyTo: typeof payload.designer_email === "string" ? payload.designer_email : undefined,
    from: FROM_ADDRESS,
    userId: typeof payload.client_user_id === "string" ? payload.client_user_id : undefined,
  };
}

export async function afterSend({ admin, draft }: OutboundKindContext): Promise<void> {
  const reviewId = draft.payload.review_id;
  const designerClientId = draft.payload.designer_client_id;
  if (typeof reviewId !== "string" || typeof designerClientId !== "string") {
    throw new Error("review_request draft is missing review metadata");
  }
  const { error } = await admin.from("client_reviews").upsert({
    id: reviewId,
    designer_client_id: designerClientId,
    project_id: draft.ref_id,
    request_status: "sent",
    request_sent_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}
