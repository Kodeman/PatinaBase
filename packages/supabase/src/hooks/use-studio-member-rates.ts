import { getSessionUserId } from '../auth/session-user';
/**
 * Hooks for a studio's per-member hourly rates (public.studio_member_rates,
 * migration 00598 — HT-3).
 *
 * Tier 2 of the one rate chain: a signed project_billing_authority_rates row
 * wins, this table stands in otherwise, and nothing else is a leg (HT-1 cut the
 * change-order rate; profiles.default_hourly_rate_cents is not consulted). The
 * server resolves it — these hooks only read the history and write a new dated
 * row. Nothing here ever sends a rate onto a time entry.
 *
 * RLS (00598): owner/admin may read the studio's rows and write; a member reads
 * their own row only; nobody may DELETE — a rate a studio billed an hour
 * against is a fact, so a correction is a new dated row.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import {
  invalidateEveryProjectTime,
  isRatePendingTimeEntry,
  type TimeRateSource,
} from './use-time-tracking';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export interface StudioMemberRate {
  id: string;
  studio_id: string;
  user_id: string;
  hourly_rate_cents: number;
  /** date (YYYY-MM-DD) */
  effective_from: string;
  /** date, or null on the one open row per (studio, member) */
  effective_to: string | null;
  /** The owner/admin who last wrote the row (00598 freezes it once closed). */
  created_by: string | null;
  created_at: string;
  /** Stamped by 00598's set_updated_at trigger — when the open row was corrected. */
  updated_at: string;
}

export interface SetStudioMemberRateInput {
  studioId: string;
  userId: string;
  hourlyRateCents: number;
  /** Defaults to today. A backdated row closes itself against the later one. */
  effectiveFrom?: string;
}

// Query keys — list: plural domain + params; entity: singular + id.
export const studioMemberRateKeys = {
  list: (studioId: string | null | undefined) => ['studio-member-rates', studioId] as const,
  entity: (userId: string | null | undefined) => ['studio-member-rate', userId] as const,
  pendingMinutes: (studioId: string | null | undefined) =>
    ['studio-rate-pending-minutes', studioId] as const,
};

/** TODAY where the studio is standing, not in UTC: an evening save in a US
 *  timezone was stamped TOMORROW, and 00598's BEFORE INSERT trigger then closed
 *  the rate in force at today — so that evening's hours resolved against the old
 *  rate while the card printed a row dated tomorrow. */
const todayISODate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
};

/**
 * Every dated rate row the caller may read for this studio, newest first per
 * member. Owner/admin see the studio; a plain member sees only their own row,
 * which is what the settings page's read-back relies on.
 */
export function useStudioMemberRates(studioId: string | null | undefined) {
  return useQuery({
    queryKey: studioMemberRateKeys.list(studioId),
    queryFn: async (): Promise<StudioMemberRate[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('studio_member_rates')
        .select('*')
        .eq('studio_id', studioId)
        .order('user_id', { ascending: true })
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudioMemberRate[];
    },
    enabled: !!studioId,
  });
}

/**
 * K8 — each member's rate-pending minutes on this studio's documents: the
 * hours `rerate_pending_time_entries` (00797) would price once the member has
 * a rate. Read from project_unbilled_time (un-invoiced, authorized, completed)
 * and kept to projects this studio prices. RLS is the scope, as for
 * useStudioUnbilledTime: an owner/admin reads the studio's hours (00606
 * time_entries_owner_admin_read), anyone else only their own.
 */
export function useStudioRatePendingMinutes(studioId: string | null | undefined) {
  return useQuery({
    queryKey: studioMemberRateKeys.pendingMinutes(studioId),
    queryFn: async (): Promise<Map<string, number>> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_unbilled_time')
        .select('user_id, duration_minutes, rate_source, projects!inner(studio_id)')
        .eq('projects.studio_id', studioId)
        .eq('rate_source', 'none');
      if (error) throw error;
      const minutes = new Map<string, number>();
      for (const row of (data ?? []) as Array<{
        user_id: string;
        duration_minutes: number | null;
        rate_source: TimeRateSource | null;
      }>) {
        if (!isRatePendingTimeEntry(row)) continue;
        minutes.set(row.user_id, (minutes.get(row.user_id) ?? 0) + (row.duration_minutes ?? 0));
      }
      return minutes;
    },
    enabled: !!studioId,
  });
}

/**
 * Writes a member's rate as a new dated row. The 00598 BEFORE INSERT trigger
 * closes the row it supersedes, so history accumulates and exactly one row stays
 * open.
 *
 * The write is an UPSERT on (studio_id, user_id, effective_from): the settings
 * page saves on blur, and a second edit on the same day is a correction to
 * today's row, not a UNIQUE violation. `created_by` must be the acting user —
 * studio_member_rates_admin_insert's WITH CHECK requires it.
 *
 * Invalidates both rate keys plus the Hours ledger's week and unbilled reads: a
 * rate typed here prices the next entry, and the ledger prints the rate.
 */
export function useSetStudioMemberRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SetStudioMemberRateInput): Promise<StudioMemberRate> => {
      const supabase = getSupabase();
      const userDataId = await getSessionUserId();
      const userData = { user: userDataId ? { id: userDataId } : null };
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Not signed in');

      const { data, error } = await supabase
        .from('studio_member_rates')
        .upsert(
          {
            studio_id: input.studioId,
            user_id: input.userId,
            hourly_rate_cents: input.hourlyRateCents,
            effective_from: input.effectiveFrom ?? todayISODate(),
            created_by: userId,
          },
          { onConflict: 'studio_id,user_id,effective_from' },
        )
        .select()
        .single();
      if (error) throw error;
      return data as StudioMemberRate;
    },
    onSuccess: (_data, { studioId, userId }) => {
      queryClient.invalidateQueries({ queryKey: studioMemberRateKeys.list(studioId) });
      queryClient.invalidateQueries({ queryKey: studioMemberRateKeys.entity(userId) });
      queryClient.invalidateQueries({ queryKey: ['document-hours-week'] });
      queryClient.invalidateQueries({ queryKey: ['document-hours-unbilled'] });
    },
  });
}

export interface RerateRatePendingHoursInput {
  /** The `id` of the row useSetStudioMemberRate resolved to. The server reads
   *  the studio, the member and the rate from that row. */
  rateId: string;
  /** That row's `hourly_rate_cents`, as the save returned it. A same-day
   *  correction keeps the row's id, so the server prices only while the row
   *  still carries this rate. */
  expectedRateCents: number;
}

/**
 * K8 (amends P-4): after a rate is set, prices that member's rate-pending hours
 * (`rate_source = 'none'`, never on an invoice) on the studio's documents at the
 * saved row's rate — `rerate_pending_time_entries`, 00797. Callers chain it on
 * the save: `const saved = await setRate.mutateAsync(...);
 * rerate.mutate({ rateId: saved.id, expectedRateCents: saved.hourly_rate_cents })`.
 * Resolves to how many hours this call priced. Priced or invoiced hours are
 * never touched.
 *
 * The server admits only an owner or admin of the row's studio and prints its
 * own refusal; this hook never pre-judges standing. It also refuses a row any
 * later-dated row has superseded (23514), and a row whose rate is no longer
 * `expectedRateCents` because someone corrected it since (PT409: "the rate
 * changed since you saved it; save it again to price these hours").
 */
export function useRerateRatePendingHours() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RerateRatePendingHoursInput): Promise<number> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('rerate_pending_time_entries', {
        p_rate_id: input.rateId,
        p_expected_rate_cents: input.expectedRateCents,
      });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    onSuccess: () => {
      // Every document's hours reads, the composer's unbilled read among them:
      // the RPC does not say which documents held the pending hours.
      invalidateEveryProjectTime(queryClient);
      queryClient.invalidateQueries({ queryKey: ['document-hours-unbilled'] });
      // A priced hour can cross an authority's ceiling (00575).
      queryClient.invalidateQueries({ queryKey: ['document-hours-pending-authorization'] });
      // The offer under the rate field (useStudioRatePendingMinutes).
      queryClient.invalidateQueries({ queryKey: ['studio-rate-pending-minutes'] });
    },
  });
}
