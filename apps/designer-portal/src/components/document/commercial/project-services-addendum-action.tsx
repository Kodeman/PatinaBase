"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCreateServiceAddendum } from "@/hooks/use-commercial-documents";
import { rememberRoomOrigin } from "@/lib/document/room-origin";
import { DocumentAction } from "../document-action";

const ADDENDUM_TITLE = "Design services addendum";

export function ProjectServicesAddendumAction({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const createAddendum = useCreateServiceAddendum(projectId);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    try {
      const result = await createAddendum.mutateAsync(ADDENDUM_TITLE);
      rememberRoomOrigin(pathname);
      router.push(`/drafting/${result.proposalId}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The services addendum could not be created.",
      );
    }
  };

  return (
    <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2">
      <DocumentAction
        actionKey="create-services-addendum"
        surfaceKey="open-document"
        regionKey="billing-authority"
        variant="secondary"
        trailing="→"
        loading={createAddendum.isPending}
        loadingLabel="Creating…"
        onClick={() => void create()}
      >
        Create services addendum
      </DocumentAction>
      <span className="text-[11px] text-[var(--text-muted)]">
        The current authority stays active until the addendum is countersigned.
      </span>
      {error && (
        <p
          role="alert"
          className="basis-full text-[11px] text-[var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
