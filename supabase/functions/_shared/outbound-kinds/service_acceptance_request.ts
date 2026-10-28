import {
  ctaButton,
  escapeHtml,
  muted,
  paragraph,
  portalBaseFor,
  renderBrandedShell,
} from "../branded-email.ts";
import type { OutboundEmailRender, OutboundKindContext } from "./types.ts";

export async function renderEmail(
  { admin, draft }: Pick<OutboundKindContext, "admin" | "draft">,
): Promise<OutboundEmailRender> {
  if (draft.ref_type !== "service_acceptance_request") {
    throw new Error("service_acceptance_request reference missing");
  }
  const { data: request, error } = await admin.from(
    "service_acceptance_requests",
  )
    .select("id,project_id,outbound_draft_id").eq("id", draft.ref_id).single();
  if (error) throw error;
  if (
    !request || request.project_id !== draft.project_id ||
    request.outbound_draft_id !== draft.id
  ) {
    throw new Error("service_acceptance_request draft binding differs");
  }
  const { data: project, error: projectError } = await admin.from("projects")
    .select("name").eq("id", request.project_id).single();
  if (projectError) throw projectError;
  if (!project) throw new Error("service_acceptance_request project missing");
  const url = `${portalBaseFor("client")}/acceptance/${
    encodeURIComponent(request.id)
  }`;
  const introduction =
    `Your studio asks you to review and accept the agreed service scope for ${project.name}.`;
  const body = draft.body;
  return {
    html: renderBrandedShell({
      title: draft.subject ?? "Review the agreed services",
      audience: "client",
      preview: introduction,
      eyebrow: "Agreed services",
      body: [
        paragraph(escapeHtml(introduction)),
        paragraph(escapeHtml(body).replace(/\n/g, "<br>")),
        ctaButton(url, "Review the agreed services"),
        muted(
          `Or open it directly: <a href="${escapeHtml(url)}">${
            escapeHtml(url)
          }</a>`,
        ),
      ].join(""),
    }),
    text: `${introduction}\n\n${body}\n\nReview the agreed services: ${url}`,
    userId: draft.to_client_id ?? undefined,
  };
}
