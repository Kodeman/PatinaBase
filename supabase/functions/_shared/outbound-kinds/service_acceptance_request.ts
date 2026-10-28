import {
  ctaButton,
  escapeHtml,
  muted,
  paragraph,
  portalBaseFor,
  renderBrandedShell,
} from "../branded-email.ts";
import type { OutboundDraft } from "../outbound-send.ts";
import type { OutboundEmailRender, OutboundKindContext } from "./types.ts";

interface SignerRow {
  profile_id: string | null;
  household_person_id: string | null;
  status: string;
  required: boolean;
}
interface RequestRow {
  id: string;
  project_id: string;
  lifecycle: string;
  service_acceptance_signers: SignerRow[] | null;
}

// A draft request turns sent on its first delivered notice; closed,
// superseded and withdrawn requests take no answer (00893).
const OPEN_LIFECYCLES = new Set(["draft", "sent"]);

function bindsOpenRequest(
  request: RequestRow | null,
  draft: OutboundDraft,
): request is RequestRow {
  return request !== null && request.id === draft.ref_id &&
    request.project_id === draft.project_id &&
    OPEN_LIFECYCLES.has(request.lifecycle);
}

// 00891: each active required signer has its own draft, so a draft binds to
// its request through its recipient, not through request.outbound_draft_id.
function bindsDraft(request: RequestRow | null, draft: OutboundDraft) {
  return bindsOpenRequest(request, draft) &&
    (request.service_acceptance_signers ?? []).some((signer) =>
      addressesSigner(signer, draft)
    );
}

function addressesSigner(signer: SignerRow, draft: OutboundDraft) {
  if (signer.status !== "active" || !signer.required) return false;
  if (signer.household_person_id) {
    return signer.household_person_id === draft.to_contact_id;
  }
  return signer.profile_id === draft.to_client_id &&
    draft.to_contact_id === null;
}

export async function renderEmail(
  { admin, draft }: Pick<OutboundKindContext, "admin" | "draft">,
): Promise<OutboundEmailRender> {
  if (draft.ref_type !== "service_acceptance_request") {
    throw new Error("service_acceptance_request reference missing");
  }
  const { data: request, error } = await admin.from(
    "service_acceptance_requests",
  )
    .select(
      "id,project_id,lifecycle,service_acceptance_signers(profile_id,household_person_id,status,required)",
    ).eq("id", draft.ref_id).single();
  if (error) throw error;
  if (
    draft.kind !== "service_acceptance_request" || !bindsDraft(request, draft)
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
