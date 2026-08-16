'use client';

/**
 * HouseholdChip — the standing "who is this for" line under the letterhead. One
 * quiet mono affordance that names the client and opens the HouseholdSheet to
 * view / set / change / edit them. When nothing is linked it says so in clay,
 * at the letterhead — so the gap is visible here, not discovered at send time.
 */

import { useState } from 'react';
import { familyLabel } from '@/lib/document/family-label';
import { HouseholdSheet } from './overlays/household-sheet';

export interface HouseholdChipProps {
  studioId: string | null;
  engagementKind: string;
  projectId: string | null;
  proposalId: string | null;
  clientProfileId: string | null;
  /** Canonical relationship id; remains present for a captured/no-login household. */
  designerClientId?: string | null;
  clientName: string;
  proposalStatus?: string | null;
}

export function HouseholdChip({
  studioId,
  engagementKind,
  projectId,
  proposalId,
  clientProfileId,
  designerClientId = null,
  clientName,
  proposalStatus,
}: HouseholdChipProps) {
  const [open, setOpen] = useState(false);
  const hasHousehold = Boolean(clientProfileId || designerClientId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group mt-1.5 flex items-baseline text-left"
        aria-label="View or change the client this document is for"
      >
        {hasHousehold ? (
          <span className="font-heading text-[1.15rem] italic leading-tight text-[var(--color-aged-oak)] transition-colors group-hover:text-[var(--color-clay)]">
            for {familyLabel(clientName)}
            <span
              aria-hidden
              className="ml-1.5 align-baseline font-mono text-[11px] not-italic text-[var(--color-clay)] opacity-60 transition-opacity group-hover:opacity-100"
            >
              ↗
            </span>
          </span>
        ) : (
          <span className="font-heading text-[1.15rem] italic leading-tight text-[var(--color-clay)]">
            No client linked — attach one
            <span aria-hidden className="ml-1.5 align-baseline font-mono text-[11px] not-italic opacity-70">
              ↗
            </span>
          </span>
        )}
      </button>

      <HouseholdSheet
        open={open}
        studioId={studioId}
        onClose={() => setOpen(false)}
        engagementKind={engagementKind}
        projectId={projectId}
        proposalId={proposalId}
        clientProfileId={clientProfileId}
        designerClientId={designerClientId}
        clientName={clientName}
        proposalStatus={proposalStatus}
      />
    </>
  );
}
