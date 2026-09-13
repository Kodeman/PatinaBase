'use client';

/**
 * THE CALL SHEET'S OWN READ — one composition, two surfaces.
 *
 * The sheet (and the project-team region that shows the same roster) needs
 * three things at once:
 *   · `people_directory_seats` for the crew, with each identity's reach,
 *     consent and paper words already reduced;
 *   · `v_project_roster` for the studio side and for the dialable phone and
 *     email the seats view does not carry;
 *   · every seat's authority grants, for the plain phrase on the studio and
 *     client bands and the gate controller's name at the head.
 *
 * The banding, the sentences and the vitals are all pure and live in
 * `lib/document/roster-derivation.ts`; this composes the reads and hands the
 * projection down. No query is written here except the project-wide authority
 * one, which is owed to @patina/supabase (see use-project-authority.ts).
 */

import { useCallback, useMemo } from 'react';
import {
  rosterBandFor,
  rosterDateKey,
  useProjectRoster,
  usePeopleSeats,
  type ProjectPartyAuthority,
  type ProjectRosterRow,
} from '@patina/supabase';
import { getPartyKindLabel, getStaffRoleLabel } from '@patina/types';
import {
  callSheetProjection,
  type CallSheetProjection,
  type SyntheticClient,
} from '@/lib/document/roster-derivation';
import { rosterTradeLabel } from './party-mini-row';
import { useProjectAuthority } from './use-project-authority';

/** The studio side's second line: the staff role, and the job title only when
 *  it says something the role does not. */
function teamMeta(row: ProjectRosterRow): string {
  const role = getStaffRoleLabel(row.staff_role);
  const title = (row.job_title ?? '').trim();
  return [role, title && title.toLowerCase() !== role.toLowerCase() ? title : '']
    .filter(Boolean)
    .join(' · ');
}

export interface CallSheetRosterResult {
  projection: CallSheetProjection;
  authorityBySeat: Record<string, ProjectPartyAuthority[]>;
  isLoading: boolean;
  isError: boolean;
  today: string;
  /**
   * CR9-4 — THE WAY BACK FROM `isError`.
   *
   * `isError` is raised by the roster and seats reads composed here, and the
   * surfaces that print "The project roster could not be read." offer a "Try
   * again" beside it. Without this the act could only refetch some OTHER query,
   * so the band it apologises through never cleared and a page reload was the
   * only way out.
   */
  refetch: () => Promise<unknown>;
}

export function useCallSheetRoster(
  projectId: string | null | undefined,
  options?: { client?: SyntheticClient | null; enabled?: boolean; today?: string },
): CallSheetRosterResult {
  const enabled = options?.enabled !== false && !!projectId;
  const readId = enabled ? (projectId ?? null) : null;

  const rosterQuery = useProjectRoster(readId);
  const seatsQuery = usePeopleSeats(readId ? { projectId: readId } : undefined);
  const authorityQuery = useProjectAuthority(readId);

  const today = options?.today ?? rosterDateKey(new Date());
  const clientName = options?.client?.name ?? null;
  const clientProfileId = options?.client?.profileId ?? null;

  const projection = useMemo(
    () =>
      callSheetProjection(rosterQuery.data ?? [], seatsQuery.data ?? [], {
        client: { name: clientName, profileId: clientProfileId, projectId },
        today,
        bandFor: rosterBandFor,
        labels: {
          kindLabel: (kind) => getPartyKindLabel(kind) || (kind ?? ''),
          tradeLabel: rosterTradeLabel,
          teamMeta,
        },
      }),
    [rosterQuery.data, seatsQuery.data, clientName, clientProfileId, projectId, today],
  );

  const { refetch: refetchRoster } = rosterQuery;
  const { refetch: refetchSeats } = seatsQuery;
  const { refetch: refetchAuthority } = authorityQuery;
  const refetch = useCallback(
    () => Promise.all([refetchRoster(), refetchSeats(), refetchAuthority()]),
    [refetchRoster, refetchSeats, refetchAuthority],
  );

  return {
    projection,
    authorityBySeat: authorityQuery.data ?? {},
    isLoading: rosterQuery.isLoading || seatsQuery.isLoading,
    isError: rosterQuery.isError || seatsQuery.isError,
    today,
    refetch,
  };
}
