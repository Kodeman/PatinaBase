import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DesignerEarning {
  id: string;
  designer_id: string;
  source_type: 'product_commission' | 'referral' | 'bonus' | 'adjustment';
  proposal_id: string | null;
  proposal_item_id: string | null;
  order_id: string | null;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  commission_rate: number | null;
  description: string | null;
  status: 'pending' | 'confirmed' | 'paid' | 'cancelled';
  payout_id: string | null;
  paid_at: string | null;
  earned_at: string;
  created_at: string;
  // Joined data
  proposal?: {
    id: string;
    title: string;
    client?: {
      full_name: string | null;
      email: string;
    };
  };
}

export interface DesignerPayout {
  id: string;
  designer_id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payout_method: string | null;
  payout_reference: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface EarningsFilters {
  status?: string | string[];
  sourceType?: string;
  startDate?: string;
  endDate?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all earnings for the current designer
 */
export function useEarnings(filters?: EarningsFilters) {
  return useQuery({
    queryKey: ['earnings', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('designer_earnings')
        .select(`
          *,
          proposal:proposals!proposal_id(
            id,
            title,
            client:profiles!client_id(full_name, email)
          )
        `)
        .order('earned_at', { ascending: false });

      // Apply filters
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.sourceType) {
        query = query.eq('source_type', filters.sourceType);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as DesignerEarning[];
    },
  });
}

/**
 * Get earnings statistics and summary
 */
export function useEarningsStats() {
  return useQuery({
    queryKey: ['earnings-stats'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('designer_earnings')
        .select('net_amount, status, source_type, created_at');

      if (error) throw error;

      const earnings = data ?? [];
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const stats = {
        totalEarnings: earnings.reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
        pendingEarnings: earnings
          .filter((e: DesignerEarning) => e.status === 'pending')
          .reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
        confirmedEarnings: earnings
          .filter((e: DesignerEarning) => e.status === 'confirmed')
          .reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
        paidEarnings: earnings
          .filter((e: DesignerEarning) => e.status === 'paid')
          .reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
        thisMonthEarnings: earnings
          .filter((e: DesignerEarning) => new Date(e.created_at) >= thisMonth)
          .reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
        lastMonthEarnings: earnings
          .filter((e: DesignerEarning) => {
            const date = new Date(e.created_at);
            return date >= lastMonth && date <= lastMonthEnd;
          })
          .reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
        bySource: {
          product_commission: earnings
            .filter((e: DesignerEarning) => e.source_type === 'product_commission')
            .reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
          referral: earnings
            .filter((e: DesignerEarning) => e.source_type === 'referral')
            .reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
          bonus: earnings
            .filter((e: DesignerEarning) => e.source_type === 'bonus')
            .reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
          adjustment: earnings
            .filter((e: DesignerEarning) => e.source_type === 'adjustment')
            .reduce((sum: number, e: DesignerEarning) => sum + e.net_amount, 0),
        },
        transactionCount: earnings.length,
      };

      return stats;
    },
  });
}

/**
 * Get monthly earnings data for chart
 */
export function useMonthlyEarnings(months: number = 12) {
  return useQuery({
    queryKey: ['monthly-earnings', months],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const { data, error } = await supabase
        .from('designer_earnings')
        .select('net_amount, created_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Group by month
      const monthlyData: Record<string, number> = {};
      const earnings = data ?? [];

      // Initialize all months with 0
      for (let i = 0; i < months; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - (months - 1 - i));
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = 0;
      }

      // Sum earnings by month
      earnings.forEach((e: { net_amount: number; created_at: string }) => {
        const date = new Date(e.created_at);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (key in monthlyData) {
          monthlyData[key] += e.net_amount;
        }
      });

      // Convert to array format
      return Object.entries(monthlyData).map(([month, amount]) => ({
        month,
        amount,
        label: new Date(month + '-01').toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        }),
      }));
    },
  });
}

/**
 * Fetch payout history
 */
export function usePayouts() {
  return useQuery({
    queryKey: ['payouts'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('designer_payouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as DesignerPayout[];
    },
  });
}

/**
 * Get payout statistics
 */
export function usePayoutStats() {
  return useQuery({
    queryKey: ['payout-stats'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('designer_payouts')
        .select('amount, status');

      if (error) throw error;

      const payouts = data ?? [];
      return {
        totalPaidOut: payouts
          .filter((p: DesignerPayout) => p.status === 'completed')
          .reduce((sum: number, p: DesignerPayout) => sum + p.amount, 0),
        pendingPayout: payouts
          .filter((p: DesignerPayout) => ['pending', 'processing'].includes(p.status))
          .reduce((sum: number, p: DesignerPayout) => sum + p.amount, 0),
        payoutCount: payouts.filter((p: DesignerPayout) => p.status === 'completed').length,
      };
    },
  });
}
