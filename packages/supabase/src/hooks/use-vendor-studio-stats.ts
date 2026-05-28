'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export interface VendorStudioStats {
  vendor_id: string;
  studio_id: string;
  studio_item_count: number;
  projects_used_count: number;
  lifetime_value_cents: number;
  unresolved_damage_count: number;
}

export type SignalStrength = 'weak' | 'moderate' | 'strong';

/**
 * Compute the PRD §5.5 signal strength bucket from the raw stats.
 * Exposed alongside the hook so any surface can derive the same value
 * without duplicating the rule.
 */
export function computeSignalStrength(stats: VendorStudioStats): SignalStrength {
  if (
    stats.studio_item_count >= 10 &&
    stats.projects_used_count >= 5 &&
    stats.unresolved_damage_count === 0
  ) {
    return 'strong';
  }
  if (stats.studio_item_count >= 5) {
    return 'moderate';
  }
  return 'weak';
}

/**
 * Aggregate stats for a (vendor, studio) pair. Reads from the
 * SECURITY INVOKER view created in migration 00159 — RLS on the
 * underlying products / projects / purchase_orders tables enforces
 * cross-studio isolation automatically.
 *
 * Returns `null` when the pair has no studio-layer items yet — a
 * brand-new vendor or a studio that hasn't promoted anything from
 * this vendor surfaces as null rather than zeroed stats.
 */
export function useVendorStudioStats(vendorId: string | null | undefined, studioId: string | null | undefined) {
  return useQuery({
    queryKey: ['vendor-studio-stats', vendorId, studioId],
    enabled: Boolean(vendorId && studioId),
    queryFn: async (): Promise<VendorStudioStats | null> => {
      if (!vendorId || !studioId) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('v_vendor_studio_stats')
        .select(
          'vendor_id, studio_id, studio_item_count, projects_used_count, lifetime_value_cents, unresolved_damage_count',
        )
        .eq('vendor_id', vendorId)
        .eq('studio_id', studioId)
        .maybeSingle();

      if (error) {
        throw new Error(`useVendorStudioStats: ${error.message}`);
      }
      if (!data) return null;
      return {
        vendor_id: data.vendor_id ?? vendorId,
        studio_id: data.studio_id ?? studioId,
        studio_item_count: data.studio_item_count ?? 0,
        projects_used_count: data.projects_used_count ?? 0,
        lifetime_value_cents: Number(data.lifetime_value_cents ?? 0),
        unresolved_damage_count: data.unresolved_damage_count ?? 0,
      };
    },
  });
}
