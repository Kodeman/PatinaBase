'use client';

/**
 * Studio-wide blended margin for the Accounts book front-matter (R36).
 *
 * One query over the designer's committed FF&E lines (RLS scopes the rows),
 * using the SAME committed-status set and trade→client margin definition as the
 * per-engagement Account Page (use-account-page.ts) — so the book's margin is
 * the leaf figure summed, never authored a second way. Trade coverage rides
 * along so the surface can stay honest when trade pricing is thin (margin '—').
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { isMixed, sumByCurrency } from '@/lib/currency-totals';

const getSupabase = () => createBrowserClient() as any;

// Mirror use-account-page.ts COMMITTED_STATUSES exactly.
const COMMITTED_STATUSES = new Set(['ordered', 'production', 'shipped', 'delivered', 'installed']);

interface ItemSlice {
  unit_price_cents: number | null;
  trade_price_cents: number | null;
  quantity: number | null;
  status: string;
  currency: string | null;
}

export interface StudioMargin {
  clientValueCents: number;
  tradeCostCents: number;
  marginPct: number | null;
  /** The currencies committed trade-priced lines span, when more than one;
   *  the figures above are then 0/null. */
  mixedCurrencies: string[] | null;
  coverage: { withTrade: number; total: number };
}

export function useStudioMargin() {
  return useQuery<StudioMargin>({
    queryKey: ['studio-margin'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_ffe_items')
        .select('unit_price_cents, trade_price_cents, quantity, status, currency');
      if (error) throw error;

      const committed = ((data ?? []) as ItemSlice[]).filter((i) =>
        COMMITTED_STATUSES.has(i.status),
      );
      const withTrade = committed.filter((i) => i.trade_price_cents != null);
      // A blended margin across currencies would divide a sum of mixed
      // units — unavailable instead (SQ-207).
      const clientValue = sumByCurrency(
        withTrade,
        (i) => (i.unit_price_cents ?? 0) * (i.quantity ?? 1),
      );
      const mixedCurrencies = isMixed(clientValue) ? clientValue.mixed : null;
      const clientValueCents = isMixed(clientValue) ? 0 : clientValue.cents;
      const tradeCostCents = mixedCurrencies
        ? 0
        : withTrade.reduce((s, i) => s + (i.trade_price_cents ?? 0) * (i.quantity ?? 1), 0);
      const marginPct =
        clientValueCents > 0
          ? Math.round(((clientValueCents - tradeCostCents) / clientValueCents) * 100)
          : null;

      return {
        clientValueCents,
        tradeCostCents,
        marginPct,
        mixedCurrencies,
        coverage: { withTrade: withTrade.length, total: committed.length },
      };
    },
  });
}
