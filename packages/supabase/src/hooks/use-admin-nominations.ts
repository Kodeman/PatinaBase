'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { NominationStatus } from '../mutations/nomination';

const getSupabase = () => createBrowserClient();

export interface AdminNominationRow {
  id: string;
  vendor_id: string;
  studio_id: string;
  nominated_by_user_id: string;
  recommendation_note: string;
  manufacturer_contact: Record<string, unknown> | null;
  fit_signals: string[] | null;
  status: NominationStatus;
  status_updated_at: string;
  patina_outreach_sent_at: string | null;
  patina_outreach_summary: string | null;
  decline_reason: string | null;
  catalog_live_at: string | null;
  previous_nomination_id: string | null;
  created_at: string;
}

export interface UseAdminNominationsOptions {
  /** Filter by status — undefined returns everything. */
  status?: NominationStatus;
  limit?: number;
  enabled?: boolean;
}

/**
 * Admin-side read hook for the nomination triage tool. Super_admins
 * see every row (the vendor_nominations_select policy from 00152
 * grants super_admin access in addition to studio members); regular
 * studio users see only their own studio's nominations and the tool
 * is gated by role at the page level.
 */
export function useAdminNominations(options: UseAdminNominationsOptions = {}) {
  const { status, limit = 100, enabled = true } = options;

  return useQuery({
    queryKey: ['admin-nominations', { status, limit }],
    enabled,
    queryFn: async (): Promise<AdminNominationRow[]> => {
      const supabase = getSupabase();
      let query = supabase
        .from('vendor_nominations')
        .select(
          'id, vendor_id, studio_id, nominated_by_user_id, recommendation_note, manufacturer_contact, fit_signals, status, status_updated_at, patina_outreach_sent_at, patina_outreach_summary, decline_reason, catalog_live_at, previous_nomination_id, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) {
        throw new Error(`useAdminNominations: ${error.message}`);
      }
      return (data ?? []) as AdminNominationRow[];
    },
  });
}

export interface SetNominationStatusInput {
  nominationId: string;
  toStatus: NominationStatus;
  declineReason?: string;
  patinaOutreachSummary?: string;
}

/**
 * Drives a nomination through the state machine via the
 * `set_nomination_status` RPC (migration 00160). Super_admin-gated
 * server-side; the trigger from 00158 enforces transition legality.
 */
export function useSetNominationStatus(options: {
  onSuccess?: (nominationId: string) => void;
  onError?: (error: Error) => void;
} = {}) {
  const queryClient = useQueryClient();
  return useMutation<string, Error, SetNominationStatusInput>({
    mutationKey: ['set-nomination-status'],
    mutationFn: async (input) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('set_nomination_status', {
        p_nomination_id: input.nominationId,
        p_to_status: input.toStatus,
        ...(input.declineReason ? { p_decline_reason: input.declineReason } : {}),
        ...(input.patinaOutreachSummary
          ? { p_patina_outreach_summary: input.patinaOutreachSummary }
          : {}),
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('set_nomination_status returned no id');
      return data;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-nominations'] });
      void queryClient.invalidateQueries({ queryKey: ['vendor-nomination'] });
      options.onSuccess?.(id);
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
