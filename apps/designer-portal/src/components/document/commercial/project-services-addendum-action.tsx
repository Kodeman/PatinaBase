"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCopyAgreementPartsFromAuthority } from "@patina/supabase";
import { useCreateServiceAddendum } from "@/hooks/use-commercial-documents";
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
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // The draft this act has already minted, kept for as long as the act lasts.
  //
  // `create_service_addendum` and `copy_agreement_parts_from_authority` are two
  // calls, and the second one can be refused — an origin agreement that was
  // never composed, a role the RLS policy will not have. Without this the only
  // retry available was the same button, which minted a SECOND addendum and
  // left the first standing empty. The draft is made once; every retry after a
  // refused copy writes onto the draft that already exists.
  const [draftId, setDraftId] = useState<string | null>(null);
  // The why waiting to be carried across, and the trigger for the effect that
  // carries it. A fresh object each time, so a retry re-fires.
  const [carrying, setCarrying] = useState<{ why: string | null } | null>(null);

  // `useCopyAgreementPartsFromAuthority` binds its proposal id at construction
  // (the @patina/supabase shape), and the id does not exist until the create
  // has resolved — so the copy is a second render's work, not a second line of
  // the same function.
  const copyParts = useCopyAgreementPartsFromAuthority(draftId ?? "");

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
   * Wave 2's path, first half — the draft. `create_service_addendum` is
   * untouched by this wave, and a draft that already exists is never minted
   * again: the second half runs against it as soon as the id is bound.
   */
  const compose = async (input: { title: string; why: string | null }) => {
    setError(null);
    if (draftId) {
      setCarrying({ why: input.why });
      return;
    }
    try {
      const result = await createAddendum.mutateAsync(input.title);
      setDraftId(result.proposalId);
      setCarrying({ why: input.why });
    } catch (cause) {
      setError(refusal(cause));
    }
  };

  /**
   * Wave 2's path, second half — the origin's part set copied into the draft
   * with the designer's why, then the room. A refusal here keeps the sheet
   * open on the draft that exists; the same button carries it across again.
   */
  useEffect(() => {
    if (!draftId || !carrying) return;
    let abandoned = false;
    void (async () => {
      try {
        await copyParts.mutateAsync(carrying.why);
        if (abandoned) return;
        documentEvents.agreementAddendumComposed({
          project_id: projectId,
          proposal_id: draftId,
          has_why: carrying.why !== null,
        });
        setCarrying(null);
        setSheetOpen(false);
        rememberRoomOrigin(pathname);
        router.push(`/drafting/${draftId}`);
      } catch (cause) {
        if (abandoned) return;
        setCarrying(null);
        setError(refusal(cause));
      }
    })();
    return () => {
      abandoned = true;
    };
    // `copyParts` is rebuilt every render; `draftId` is the whole of what it
    // closes over, and it is on this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, carrying, projectId, pathname, router]);

  const working = createAddendum.isPending || copyParts.isPending || !!carrying;

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
          pending={working}
          error={sheetOpen ? error : null}
          // A retry writes onto the draft that already exists, so the title is
          // the one it was minted with and the field says so.
          titleFrozen={draftId !== null}
          onConfirm={(input) => void compose(input)}
        />
      )}
    </div>
  );
}
