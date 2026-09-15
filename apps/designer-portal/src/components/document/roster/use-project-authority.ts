'use client';

/**
 * ONE PROJECT'S AUTHORITY GRANTS, IN ONE READ.
 *
 * W2a exports `usePartyAuthority(engagementId)` — one seat's grants — and the
 * Call Sheet needs every seat's, because the authority phrase prints on the
 * studio and client bands and the gate controller's name prints in the site
 * access line. Twenty-five seats would otherwise be twenty-five queries.
 *
 * OWED TO @patina/supabase: this belongs beside `usePartyAuthority` as
 * `useProjectPartyAuthority(projectId)`, keyed under `partyAuthorityKeys`. It
 * lives here only because W2a owns that file this wave (see w2c-report §"not
 * built"). The key is nested under `partyAuthorityKeys.all` — and React Query
 * matches by PREFIX, so `partyAuthorityKeys.list(engagementId)` never reaches
 * it (CR-8). `useSetPartyAuthority` invalidates the ROOT for exactly that
 * reason; do not narrow it back to the seat key.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient, partyAuthorityKeys } from '@patina/supabase';
import type { ProjectPartyAuthority } from '@patina/supabase';

export const projectAuthorityKeys = {
  project: (projectId: string | null | undefined) =>
    [...partyAuthorityKeys.all, 'project', projectId ?? null] as const,
};

/** Every grant on every seat of one project, grouped by seat id. */
export function useProjectAuthority(projectId: string | null | undefined) {
  return useQuery({
    queryKey: projectAuthorityKeys.project(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<Record<string, ProjectPartyAuthority[]>> => {
      if (!projectId) return {};
      const supabase = createBrowserClient();
      const { data: seats, error: seatError } = await supabase
        .from('project_parties')
        .select('id, off_job_at')
        .eq('project_id', projectId);
      if (seatError) throw seatError;
      const seatRows = (seats ?? []) as { id: string; off_job_at: string | null }[];
      const ids = seatRows.map((s) => s.id);
      if (ids.length === 0) return {};
      const closedSeats = new Set(
        seatRows.filter((s) => s.off_job_at != null).map((s) => s.id),
      );

      // CR-23: a delegation ENDS as a row, not as an edit (00624). A grant
      // whose `effective_to` has passed is history, and history must not keep
      // printing on the Call Sheet as if somebody still held it.
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('project_party_authority')
        .select('*')
        .in('engagement_id', ids)
        .or(`effective_to.is.null,effective_to.gte.${today}`);
      if (error) throw error;

      // r19 MAJOR-1 — AND A GRANT THAT ENDED WITH ITS SEAT IS HISTORY TOO.
      // 00634 ends a seat's open grants on the day the seat closes
      // (`effective_to = GREATEST(effective_from, off_job_at)`, 00632's own
      // formula), and `effective_to.gte.today` above keeps a grant through its
      // LAST day in force — correct for a seat still on the job, and the one
      // day on which a seat closed TODAY would still print a present-tense
      // figure. That is the whole of `merge_seat_collision`'s repair path:
      // the studio closes one of two duplicate seats in order to fold the
      // cards, and folds the same minute — so the Call Sheet would print
      // "Signs money to $10,000." beside "Signs money to $2,500." for one
      // human on one job for the rest of that day. A grant whose end date was
      // stamped by its seat leaving the job is dropped here; a grant still
      // OPEN on a closed seat is deliberately kept, because that is a state
      // the room should show rather than hide.
      const grouped: Record<string, ProjectPartyAuthority[]> = {};
      for (const grant of (data ?? []) as ProjectPartyAuthority[]) {
        if (grant.effective_to != null && closedSeats.has(grant.engagement_id)) continue;
        (grouped[grant.engagement_id] ??= []).push(grant);
      }
      return grouped;
    },
  });
}
