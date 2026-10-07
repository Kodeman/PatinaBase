'use client';

/**
 * HouseholdChip — the standing "who is this for" line under the letterhead. One
 * quiet mono affordance that names the client and opens the HouseholdSheet to
 * view / change / edit them. When nothing is linked the chip prints nothing:
 * the gap stands once, as a SETUP row in the band's standing sheet (D10).
 */

import { useState } from 'react';
import { familyLabel } from '@/lib/document/family-label';
import { HouseholdSheet } from './overlays/household-sheet';

export interface HouseholdChipProps {
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
  // D10 — an unlinked job is a SETUP row in the band's standing sheet, whose
  // `Link a client` act opens the HouseholdSheet. The letterhead says nothing.
  if (!hasHousehold) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group mt-1.5 flex items-baseline text-left"
        aria-label="View or change the client this document is for"
      >
        <span className="font-heading text-[1.15rem] italic leading-tight text-[var(--color-clay-ink)]">
          for {familyLabel(clientName)}
          <span
            aria-hidden
            className="ml-1.5 align-baseline font-mono text-[11px] not-italic text-[var(--color-clay-ink)] opacity-60 transition-opacity group-hover:opacity-100"
          >
            ↗
          </span>
        </span>
      </button>

      <HouseholdSheet
        open={open}
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
