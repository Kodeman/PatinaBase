'use client';

import { useCallback, useMemo } from 'react';
import { useProjectLeads } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useInternalTimeStudio } from '@/hooks/use-viewer-studio';

export interface StudioMoney {
  /** An owner or admin seat: the studio's whole book, its totals and export. */
  all: boolean;
  /** Whether this seat may see the money on one job: every job for an owner
   *  or admin, otherwise only the jobs she leads. */
  canSeeProject: (projectId: string | null | undefined) => boolean;
}

/**
 * Q10 — who sees studio money. Studio revenue, A/R, margin, every invoice and
 * PO total and the book's export belong to an owner or admin seat; any other
 * member sees money only on the jobs she leads (walk W-D5, SQ-751 F3).
 *
 * Not `useCanSeeMargin`: that is the R1 margin grant, which defaults to every
 * member (organizations.margin_visibility = 'everyone'), so a hire passed it
 * and read the whole book. The studio is the one `useCanSeeMargin` follows.
 */
export function useStudioMoney(): StudioMoney {
  const { user } = useAuth();
  const { studio } = useInternalTimeStudio();
  const role = studio?.membership?.role;
  const all = role === 'owner' || role === 'admin';
  const { data: projectLeads } = useProjectLeads(studio?.id ?? '');
  const led = useMemo(
    () =>
      new Set(
        [...(projectLeads ?? new Map())]
          .filter(([, lead]) => Boolean(user?.id) && lead.leadUserId === user?.id)
          .map(([projectId]) => projectId),
      ),
    [projectLeads, user?.id],
  );
  const canSeeProject = useCallback(
    (projectId: string | null | undefined) => all || (Boolean(projectId) && led.has(projectId!)),
    [all, led],
  );
  return { all, canSeeProject };
}
