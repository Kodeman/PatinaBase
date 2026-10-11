'use client';

import { useCallback, useMemo } from 'react';
import { useLedProjectIds, useOrganizations } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';

export interface StudioMoney {
  /** The studios whose whole book is this seat's: she is owner or admin there.
   *  Studio totals, Earnings and the export exist only when there is one. */
  bookStudioIds: readonly string[];
  /** This studio's whole book — its totals, every invoice and PO total. */
  canSeeStudio: (studioId: string | null | undefined) => boolean;
  /** The money on one record: its own studio's book is hers, or she leads
   *  its job. */
  canSeeRecord: (
    studioId: string | null | undefined,
    projectId: string | null | undefined,
  ) => boolean;
}

/**
 * Q10 — who sees studio money. Studio revenue, A/R, margin, every invoice and
 * PO total and the book's export belong to an owner or admin seat; any other
 * member sees money only on the jobs she leads (walk W-D5, SQ-751 F3).
 *
 * SQ-774 R1 — judged by each RECORD's own studio, never by the one selected:
 * owning her own solo studio is no seat over her employer's book, where she is
 * a member. So a seat holds the book of each studio she owns or administers,
 * and beyond those only the records of jobs she leads, in any studio.
 *
 * Not `useCanSeeMargin`: that is the R1 margin grant, which defaults to every
 * member (organizations.margin_visibility = 'everyone'), so a hire passed it
 * and read the whole book.
 */
export function useStudioMoney(): StudioMoney {
  const { user } = useAuth();
  const { data: organizations } = useOrganizations();
  const { data: led } = useLedProjectIds(user?.id);
  const bookStudioIds = useMemo(
    () =>
      (organizations ?? [])
        .filter(
          (org) =>
            org.type === 'design_studio' &&
            (org.membership?.role === 'owner' || org.membership?.role === 'admin'),
        )
        .map((org) => org.id),
    [organizations],
  );
  const canSeeStudio = useCallback(
    (studioId: string | null | undefined) => Boolean(studioId) && bookStudioIds.includes(studioId!),
    [bookStudioIds],
  );
  const canSeeRecord = useCallback(
    (studioId: string | null | undefined, projectId: string | null | undefined) =>
      canSeeStudio(studioId) || (Boolean(projectId) && Boolean(led?.has(projectId!))),
    [canSeeStudio, led],
  );
  return { bookStudioIds, canSeeStudio, canSeeRecord };
}
