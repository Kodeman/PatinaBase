import type { OutboundKindContext } from "./types.ts";

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
