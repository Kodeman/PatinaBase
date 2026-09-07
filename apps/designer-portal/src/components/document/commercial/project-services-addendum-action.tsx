"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCopyAgreementPartsFromAuthority,
  useCreateServiceAddendum,
} from "@/hooks/use-commercial-documents";
import { useAuth } from "@/hooks/use-auth";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { documentEvents } from "@/lib/analytics/document-events";
import { rememberRoomOrigin } from "@/lib/document/room-origin";
import { DocumentAction } from "../document-action";
import { AddendumFromPartsSheet } from "./addendum-from-parts-sheet";

const ADDENDUM_TITLE = "Design services addendum";

export function ProjectServicesAddendumAction({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const createAddendum = useCreateServiceAddendum(projectId);
  const copyParts = useCopyAgreementPartsFromAuthority();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // P7 sits behind both Wave 2 gates, fail-closed. Flag off, this act is
  // exactly what Wave 1 shipped: a draft addendum and the room.
  const { value: partsOn, isLoading: partsLoading } =
    useFeatureFlag("agreement-parts");
  const { value: libraryFlag, isLoading: libraryLoading } =
    useFeatureFlag("agreement-library");
  const composed = partsOn && !partsLoading && libraryFlag && !libraryLoading;

  const refusal = (cause: unknown): string => {
    const message =
      cause !== null && typeof cause === "object" && "message" in cause
        ? (cause as { message?: unknown }).message
        : null;
    return typeof message === "string" && message.trim().length > 0
      ? message
      : "The services addendum could not be created.";
  };

  /** Wave 1's path — a draft, then the room. */
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

  /**
   * Wave 2's path — a draft, the origin's part set copied into it with the
   * designer's why, then the room. The copy is a second act on purpose: the
   * addendum has to exist before anything can be written onto it, and
   * `create_service_addendum` is untouched by this wave.
   */
  const compose = async (input: { title: string; why: string | null }) => {
    setError(null);
    try {
      const result = await createAddendum.mutateAsync(input.title);
      await copyParts.mutateAsync({
        proposalId: result.proposalId,
        why: input.why,
      });
      documentEvents.agreementAddendumComposed({
        project_id: projectId,
        proposal_id: result.proposalId,
        has_why: input.why !== null,
      });
      setSheetOpen(false);
      rememberRoomOrigin(pathname);
      router.push(`/drafting/${result.proposalId}`);
    } catch (cause) {
      setError(refusal(cause));
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
        loading={createAddendum.isPending && !sheetOpen}
        loadingLabel="Creating…"
        onClick={() => {
          if (composed) {
            setError(null);
            setSheetOpen(true);
            return;
          }
          void create();
        }}
      >
        Create services addendum
      </DocumentAction>
      <span className="text-[11px] text-[var(--text-muted)]">
        The current authority stays active until the addendum is countersigned.
      </span>
      {error && !sheetOpen && (
        <p
          role="alert"
          className="basis-full text-[11px] text-[var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}
      {composed && (
        <AddendumFromPartsSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          defaultTitle={ADDENDUM_TITLE}
          authorName={user?.name}
          pending={createAddendum.isPending || copyParts.isPending}
          error={sheetOpen ? error : null}
          onConfirm={(input) => void compose(input)}
        />
      )}
    </div>
  );
}
