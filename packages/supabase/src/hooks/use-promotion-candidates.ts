'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export interface PromotionCandidate {
  product_id: string;
  name: string;
  owner_user_id: string | null;
  vendor_id: string | null;
  project_count: number;
  has_order_history: boolean;
}

export interface UsePromotionCandidatesOptions {
  /**
   * Disable the query (e.g. while auth is resolving or while the user is
   * on a non-personal layer view).
   */
  enabled?: boolean;
  /**
   * Cap the returned set. The PromotionBanner only needs the count and a
   * few preview names, so 50 is comfortably above v1 ceilings.
   */
  limit?: number;
}

/**
 * Personal-layer products that meet the PRD §6.1 promotion candidate
 * criteria. Reads from the `v_promotion_candidates` view (migration 00153)
 * which inherits products-table RLS — each designer sees only their own
 * candidates.
 *
 * Used by the Sprint 2 PromotionBanner. The hook returns both the list
 * and a `count` so the banner can render "Ready to promote · N" without a
 * separate aggregation query.
 */
export function usePromotionCandidates(options: UsePromotionCandidatesOptions = {}) {
  const { enabled = true, limit = 50 } = options;

  return useQuery({
    queryKey: ['promotion-candidates', { limit }],
    enabled,
    queryFn: async (): Promise<{ items: PromotionCandidate[]; count: number }> => {
      const supabase = getSupabase();

      const { data, error, count } = await supabase
        .from('v_promotion_candidates')
        .select(
          'product_id, name, owner_user_id, vendor_id, project_count, has_order_history',
          { count: 'exact' },
        )
        .order('project_count', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`usePromotionCandidates: ${error.message}`);
      }
      return {
        items: (data ?? []) as PromotionCandidate[],
        count: count ?? data?.length ?? 0,
      };
    },
  });
}
