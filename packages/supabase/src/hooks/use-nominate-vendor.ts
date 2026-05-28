'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import {
  nominateVendor,
  type NominateVendorInput,
  type NominateVendorResult,
  type NominationStatus,
} from '../mutations/nomination';

const getSupabase = () => createBrowserClient();

export interface UseNominateVendorOptions {
  onSuccess?: (result: NominateVendorResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Submits a vendor nomination. Invalidates the vendor + nomination
 * caches on success so the vendor record's `nomination_status` flips
 * to 'submitted' without a manual refresh.
 */
export function useNominateVendor(options: UseNominateVendorOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation<NominateVendorResult, Error, NominateVendorInput>({
    mutationKey: ['nominate-vendor'],
    mutationFn: (input) => nominateVendor(input),
    onSuccess: (result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['vendor', input.vendorId] });
      void queryClient.invalidateQueries({ queryKey: ['vendor-nominations'] });
      void queryClient.invalidateQueries({
        queryKey: ['vendor-nomination', input.vendorId],
      });
      options.onSuccess?.(result);
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}

export interface VendorNominationRow {
  id: string;
  vendor_id: string;
  studio_id: string;
  nominated_by_user_id: string;
  manufacturer_contact: Record<string, unknown> | null;
  recommendation_note: string;
  fit_signals: string[] | null;
  status: NominationStatus;
  status_updated_at: string;
  patina_outreach_sent_at: string | null;
  patina_outreach_summary: string | null;
  manufacturer_responded_at: string | null;
  decline_reason: string | null;
  catalog_live_at: string | null;
  previous_nomination_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Latest nomination for a vendor (typically the most recent, by
 * created_at desc). The NominationStatusBanner reads this to decide
 * which visual variant to render.
 */
export function useLatestVendorNomination(vendorId: string | null | undefined) {
  return useQuery({
    queryKey: ['vendor-nomination', vendorId],
    enabled: Boolean(vendorId),
    queryFn: async (): Promise<VendorNominationRow | null> => {
      if (!vendorId) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('vendor_nominations')
        .select(
          'id, vendor_id, studio_id, nominated_by_user_id, manufacturer_contact, recommendation_note, fit_signals, status, status_updated_at, patina_outreach_sent_at, patina_outreach_summary, manufacturer_responded_at, decline_reason, catalog_live_at, previous_nomination_id, created_at, updated_at',
        )
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) {
        throw new Error(`useLatestVendorNomination: ${error.message}`);
      }
      return (data?.[0] as VendorNominationRow | undefined) ?? null;
    },
  });
}
