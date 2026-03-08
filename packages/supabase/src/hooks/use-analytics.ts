import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@supabase/ssr';

const getSupabase = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  date: string;
  openRate: number;
  clickRate: number;
  sent: number;
}

export interface TopCampaign {
  name: string;
  opens?: number;
  clicks?: number;
  sent: number;
}

export interface AnalyticsOverviewData {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  avgOpenRate: number;
  avgClickRate: number;
  bounceRate: number;
  timeSeries: TimeSeriesPoint[];
  topByOpens: TopCampaign[];
  topByClicks: TopCampaign[];
}

export interface CampaignComparisonItem {
  id: string;
  name: string;
  subject: string;
  sent_count: number;
  open_count: number;
  click_count: number;
  bounce_count: number;
  openRate: number;
  clickRate: number;
}

export interface CampaignComparisonData {
  campaigns: CampaignComparisonItem[];
}

export interface AttributionFunnelStep {
  stage: string;
  count: number;
  rate: number;
}

export interface RevenueAttributionData {
  funnel: AttributionFunnelStep[];
  revenueTotal: number;
}

export interface EngagementCohortTier {
  tier: string;
  key: string;
  count: number;
  pct: number;
}

export interface EngagementCohortsData {
  tiers: EngagementCohortTier[];
}

export interface DeliveryHealthData {
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  hardBounces: number;
  softBounces: number;
  totalSuppressed: number;
}

// ─── Hooks ───────────────────────────────────────────────────────────────

export function useAnalyticsOverview(period: string = '7d') {
  return useQuery<AnalyticsOverviewData>({
    queryKey: ['analytics', 'overview', period],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/comms/analytics?view=overview&period=${period}`,
        { headers }
      );
      if (!res.ok) throw new Error('Failed to fetch analytics overview');
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useCampaignComparison(campaignIds: string[] = []) {
  const idsParam = campaignIds.join(',');
  return useQuery<CampaignComparisonData>({
    queryKey: ['analytics', 'comparison', idsParam],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const url = idsParam
        ? `/api/admin/comms/analytics?view=comparison&campaign_ids=${idsParam}`
        : '/api/admin/comms/analytics?view=comparison';
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Failed to fetch campaign comparison');
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useRevenueAttribution(period: string = '7d') {
  return useQuery<RevenueAttributionData>({
    queryKey: ['analytics', 'attribution', period],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/comms/analytics?view=attribution&period=${period}`,
        { headers }
      );
      if (!res.ok) throw new Error('Failed to fetch revenue attribution');
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useEngagementCohorts() {
  return useQuery<EngagementCohortsData>({
    queryKey: ['analytics', 'cohorts'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        '/api/admin/comms/analytics?view=cohorts',
        { headers }
      );
      if (!res.ok) throw new Error('Failed to fetch engagement cohorts');
      return res.json();
    },
    staleTime: 120_000,
  });
}

export function useDeliveryHealth(period: string = '7d') {
  return useQuery<DeliveryHealthData>({
    queryKey: ['analytics', 'delivery', period],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/comms/analytics?view=delivery&period=${period}`,
        { headers }
      );
      if (!res.ok) throw new Error('Failed to fetch delivery health');
      return res.json();
    },
    staleTime: 60_000,
  });
}
