"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCreateFurnishingDraft } from "@/hooks/use-commercial-documents";
import { rememberRoomOrigin } from "@/lib/document/room-origin";
import { DocumentAction } from "../document-action";

const FURNISHING_DRAFT_TITLE = "Furnishing selection";

/**
 * The furnishing-draft opener, beside the source select in the Furnishings
 * Waves form (project-commerce-section.tsx). Near-copy of
 * ProjectServicesAddendumAction: mints a project-bound legacy draft
 * (create_furnishing_wave_draft, 00414) and walks straight into the Drafting
 * Room for item/facet editing — the same legacy editor, now scoped to
 * furnishing authoring only (no send act lives there anymore).
 */
export function ProjectFurnishingDraftAction({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const createDraft = useCreateFurnishingDraft(projectId);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    try {
      const result = await createDraft.mutateAsync(FURNISHING_DRAFT_TITLE);
      rememberRoomOrigin(pathname);
      router.push(`/drafting/${result.proposalId}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The furnishing proposal could not be created.",
      );
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <DocumentAction
        actionKey="draft-furnishing-proposal"
        surfaceKey="open-document"
        regionKey="project-commerce"
        variant="secondary"
        trailing="→"
        loading={createDraft.isPending}
        loadingLabel="Creating…"
        onClick={() => void create()}
      >
        Draft a furnishing proposal
      </DocumentAction>
      {error && (
        <p
          role="alert"
          className="basis-full text-[11px] text-[var(--color-terracotta)]"
        >
          {error}
        </p>
      )}
    </span>
  );
}
