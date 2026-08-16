'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DraftingEstimateFlow } from '@/components/document/drafting/drafting-estimate-flow';
import { DraftingRoom } from '@/components/document/rooms/drafting/drafting-room';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { useProposal } from '@/hooks/use-proposals';
import { commercialDocumentExperience } from '@/lib/document/commercial-documents';

/**
 * /drafting/[proposalId] (R42/R43) — the Drafting Room, a Room reached from a
 * draft proposal. The anti-wizard for authoring a proposal: eight self-saving
 * facets, the Strata Mark as the only progress, the client's copy mirrored in
 * the right rail. Unflagged — it rides the (document) layout (Drawer + ⌘K +
 * LogStrip persist above this Room), unconditional since the R21 dissolve (I109).
 *
 * Start to Signature W4a (Q5 step 2): with the `worktable` flag ON the Room is
 * a PRESS, not a place. Authoring lives on the paper now — the Speccing table
 * carries Scope and Vision, the Finalize table carries the Offer — so every way
 * in lands on `/doc/<proposalId>` instead. Flag off, the Room opens exactly as
 * it always has, and every entry path (the draft work band, the guide, ⌘K, the
 * Desk's needs) is unchanged either way.
 *
 * TWO entries are deliberately let through, because the paper has no answer for
 * them yet and a press over a door nobody else opens is a strand, not a
 * retirement:
 *
 *   · the Desk's flagged-lines walk-in (`?flagged=1`), which exists to open one
 *     flagged line's Alternatives band — a surface that lives only in the Room;
 *   · a design-services agreement (and its addenda), whose authoring is the
 *     ServiceAgreementDraftingRoom and was never part of this decomposition.
 *     Only the LEGACY proposal's facets moved onto the paper (Scope and Vision
 *     in W3, the Offer in W4a), so only the legacy Room is a press.
 */
export default function DraftingRoute({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = use(params);
  const router = useRouter();
  const { value: worktableOn, isLoading: flagLoading } =
    useFeatureFlag('worktable');

  // Read client-side (no useSearchParams → no Suspense boundary), exactly as
  // the Room itself reads this parameter.
  const [flaggedWalkIn, setFlaggedWalkIn] = useState<boolean | null>(null);
  useEffect(() => {
    setFlaggedWalkIn(
      new URLSearchParams(window.location.search).get('flagged') === '1',
    );
  }, []);

  // The same read the Room makes one component down — one query key, one fetch.
  // Until it answers, the Room opens: a press that fired before it knew what it
  // was pressing would evict a design-services draft that has nowhere else to go.
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const isLegacy =
    proposal !== undefined &&
    commercialDocumentExperience(proposal?.document_kind) === 'legacy';

  const pressed =
    !flagLoading && worktableOn && flaggedWalkIn === false && isLegacy;

  useEffect(() => {
    if (pressed) router.replace(`/doc/${proposalId}`);
  }, [pressed, proposalId, router]);

  if (pressed) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <p className="doc-type-body text-[var(--color-quiet-ink)]">
          The drafting happens on the paper now — opening the document…
        </p>
      </div>
    );
  }

  return (
    <>
      <DraftingRoom proposalId={proposalId} />
      <DraftingEstimateFlow proposalId={proposalId} />
    </>
  );
}
