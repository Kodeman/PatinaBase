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
  created_by: string | null;
  created_at: string;
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
};

const todayISODate = () => new Date().toISOString().slice(0, 10);

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
      const { data: userData } = await supabase.auth.getUser();
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
