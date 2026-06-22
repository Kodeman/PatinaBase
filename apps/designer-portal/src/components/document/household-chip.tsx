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
  engagementKind: string;
  projectId: string | null;
  proposalId: string | null;
  clientProfileId: string | null;
  clientName: string;
  proposalStatus?: string | null;
}

export function HouseholdChip({
  engagementKind,
  projectId,
  proposalId,
  clientProfileId,
  clientName,
  proposalStatus,
}: HouseholdChipProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mx-1.5 mb-3 inline-flex items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.07em] transition-colors hover:bg-[rgba(196,165,123,0.08)]"
        aria-label="View or change the client this document is for"
      >
        {clientProfileId ? (
          <>
            <span className="text-[var(--text-muted)]">For</span>
            <span className="text-[var(--color-aged-oak)]">{familyLabel(clientName)}</span>
            <span aria-hidden className="text-[var(--color-clay)] opacity-70">
              ↗
            </span>
          </>
        ) : (
          <span className="text-[var(--color-clay)]">No client linked · attach one</span>
        )}
      </button>

      <HouseholdSheet
        open={open}
        onClose={() => setOpen(false)}
        engagementKind={engagementKind}
        projectId={projectId}
        proposalId={proposalId}
        clientProfileId={clientProfileId}
        clientName={clientName}
        proposalStatus={proposalStatus}
      />
    </>
  );
}
