'use client';

/**
 * The Document's mount of the Call Sheet — the sheet plus the chevron's
 * destination.
 *
 * The sheet itself deliberately does NOT stack a second overlay of its own
 * (call-sheet.tsx's module doc): it forwards `onOpenSeat` and lets the caller
 * mount the person. This component is that caller, lifted out of the 800-line
 * page so the wiring has a seam a spec can hold.
 *
 * The mapping is the interesting part. A Call Sheet row now carries the seat's
 * own `project_parties.id` and its kind, and `PartyProfileSheet` still reads
 * the `people_directory` party branch (00420), which admits only gc / sub /
 * installer / receiver / architect / photographer / stager. `seatProfileRole`
 * is the one place that truth lives, and it is the guard before opening: a kind
 * the branch excludes would open an empty sheet.
 */

import { useState } from 'react';
import type { PartyRole } from '@patina/supabase';
import { seatProfileRole } from '@/lib/document/roster-derivation';
import type { CallSheetRow } from '@/lib/document/roster-derivation';
import { PartyProfileSheet } from '../people/party-profile-sheet';
import { CallSheet, type CallSheetOpenMode } from './call-sheet';

export function CallSheetMount({
  open,
  onClose,
  projectId,
  projectTitle,
  projectAddress,
  clientName,
  clientProfileId,
  openMode = 'sheet',
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  projectAddress?: string | null;
  clientName?: string | null;
  clientProfileId?: string | null;
  openMode?: CallSheetOpenMode;
}) {
  const [party, setParty] = useState<{ id: string; role: PartyRole } | null>(null);

  const openSeat = (row: CallSheetRow) => {
    if (!row.seatId) return;
    const role = seatProfileRole(row.partyKind);
    if (!role) return;
    setParty({ id: row.seatId, role: role as PartyRole });
  };

  return (
    <>
      <CallSheet
        open={open}
        onClose={onClose}
        projectId={projectId}
        projectTitle={projectTitle}
        projectAddress={projectAddress}
        clientName={clientName}
        clientProfileId={clientProfileId}
        onOpenSeat={openSeat}
        openMode={openMode}
      />

      {/* Over the call sheet, which stays open underneath (D1: a sheet never
          unmounts what it opened from). `role` falls back to 'sub' only for
          the closed state's prop shape — nothing reads it while partyId is
          null. */}
      <PartyProfileSheet
        open={!!party}
        partyId={party?.id ?? null}
        role={party?.role ?? 'sub'}
        onClose={() => setParty(null)}
      />
    </>
  );
}
