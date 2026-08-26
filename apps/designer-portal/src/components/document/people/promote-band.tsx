'use client';

/**
 * The promote band (Call Sheet Wave 2, slide 10 "The promote moment") — an
 * inline band inside the field party profile sheet, under the identity
 * front-matter. State A: "Not in the studio rolodex yet." with a scored
 * ADD TO THE ROLODEX word. State B, in the SAME pixels: "In the rolodex — the
 * whole studio can find them now." Bands swap in place — nothing floats,
 * nothing toasts (R83).
 *
 * `promoted` is owned by the PARENT (party-profile-sheet), not derived purely
 * from `party.studio_contact_id` here: the promote mutation invalidates the
 * party's own query, which flips `studio_contact_id` non-null and would
 * otherwise make the parent stop mounting this band the instant the refetch
 * lands — hiding the very confirmation slide 10 exists to show. The parent
 * tracks "promoted this session" against the open party id and clears it when
 * a different party opens (self-clears on navigation).
 */

import { usePromoteToStudioContact, type ProjectParty } from '@patina/supabase';
import { DocumentAction } from '../document-action';

export function PromoteBand({
  organizationId,
  party,
  promoted,
  onPromoted,
}: {
  organizationId: string;
  /** The field party (project_parties-shaped) to promote. */
  party: ProjectParty;
  /** True once this party was promoted this session — see module doc. */
  promoted: boolean;
  onPromoted?: () => void;
}) {
  const promote = usePromoteToStudioContact();

  if (promoted) {
    return (
      <div
        role="status"
        className="mt-4 border-l-2 border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] px-3 py-2.5"
      >
        <p className="text-[0.74rem] text-[#6f8268]">
          In the rolodex — the whole studio can find them now.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-l-2 border-[var(--color-pearl)] bg-white/40 px-3 py-2.5">
      <p className="text-[0.74rem] text-[var(--color-aged-oak)]">
        – Not in the studio rolodex yet.
      </p>
      <DocumentAction
        actionKey="promote-to-rolodex"
        surfaceKey="people"
        regionKey="promote-band"
        variant="primary"
        onClick={() =>
          void promote
            .mutateAsync({ organizationId, party })
            .then(() => onPromoted?.())
        }
        disabled={promote.isPending}
        loading={promote.isPending}
        loadingLabel="Adding…"
      >
        Add to the rolodex
      </DocumentAction>
      {promote.isError && (
        <p className="w-full text-[0.68rem] text-[var(--color-terracotta-ink)]">
          {promote.error instanceof Error
            ? promote.error.message
            : 'Could not add them to the rolodex just now.'}
        </p>
      )}
    </div>
  );
}
