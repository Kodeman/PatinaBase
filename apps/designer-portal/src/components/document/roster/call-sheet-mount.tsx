'use client';

/**
 * The Document's mount of the Call Sheet — the sheet plus the chevron's
 * destination (Wave 5).
 *
 * The sheet itself deliberately does NOT stack a second overlay of its own
 * (call-sheet.tsx's module doc): it forwards `onOpenProfile` and lets the
 * caller mount the profile. That caller was /doc/[id]/page.tsx, which mounted
 * <CallSheet> without the callback — so every roster chevron was dead, and
 * the PromoteBand inside PartyProfileSheet (Wave 2's whole promote route from
 * the sheet) was unreachable. This component is that caller, lifted out of
 * the 800-line page so the wiring has a seam a spec can hold.
 *
 * The mapping is the interesting part: a `ProjectRosterRow` is a
 * `v_project_roster` row, but PartyProfileSheet reads `people_directory` —
 * whose party branch (00420) admits only gc / sub / installer / receiver /
 * architect / photographer / stager. `rosterProfileRole` is the one place
 * that truth lives; RosterRow uses it to decide whether to draw a chevron at
 * all, and this component uses it again as the guard before opening. For a
 * party-source row, `roster_id` IS the `project_parties.id` the sheet wants.
 */

import { useState } from 'react';
import type { PartyRole, ProjectRosterRow } from '@patina/supabase';
import { rosterProfileRole } from '@/lib/document/roster-derivation';
import { PartyProfileSheet } from '../people/party-profile-sheet';
import { CallSheet, type CallSheetOpenMode } from './call-sheet';

export function CallSheetMount({
  open,
  onClose,
  projectId,
  projectTitle,
  clientName,
  clientProfileId,
  openMode = 'sheet',
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  clientName?: string | null;
  clientProfileId?: string | null;
  openMode?: CallSheetOpenMode;
}) {
  const [party, setParty] = useState<{ id: string; role: PartyRole } | null>(null);

  const openProfile = (row: ProjectRosterRow) => {
    const role = rosterProfileRole(row);
    if (!role || !row.roster_id) return;
    setParty({ id: row.roster_id, role: role as PartyRole });
  };

  return (
    <>
      <CallSheet
        open={open}
        onClose={onClose}
        projectId={projectId}
        projectTitle={projectTitle}
        clientName={clientName}
        clientProfileId={clientProfileId}
        onOpenProfile={openProfile}
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
