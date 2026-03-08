import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// INSIGHTS HOOKS
// Admin-level aggregate queries for the Insights dashboard
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

// Type-safe table accessors for tables not yet in generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getWaitlistTable = () => (getSupabase() as any).from('waitlist');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getEngagementEventsTable = () => (getSupabase() as any).from('engagement_events');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getEngagementScoresView = () => (getSupabase() as any).from('user_engagement_scores');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getConversionFunnelView = () => (getSupabase() as any).from('conversion_funnel');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDesignerFunnelView = () => (getSupabase() as any).from('designer_funnel');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getConsumerFunnelView = () => (getSupabase() as any).from('consumer_funnel');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface InsightsOverview {
  totalWaitlist: number;
  totalProfiles: number;
  activeUsers7d: number;
  totalEvents30d: number;
  conversionRate: number;
  avgEngagementScore: number;
}

export interface WaitlistTimeSeriesPoint {
  date: string;
  count: number;
  source: string;
  role: string;
}

export interface UtmAttributionRow {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  count: number;
}

export interface EngagementTierDistribution {
  tier: string;
  count: number;
}

export interface TopEngagedUser {
  id: string;
  email: string;
  role: string;
  currentScore: number;
  engagementTier: string;
  lastActiveAt: string | null;
}

export interface PlatformActiveUsers {
  platform: string;
  count: number;
}

export interface FunnelStep {
  step: string;
  stepOrder: number;
  count: number;
  conversionRate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate overview counts for the insights dashboard
 */
export function useInsightsOverview() {
  return useQuery({
    queryKey: ['insights-overview'],
    queryFn: async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Parallel queries
      const [waitlistRes, profilesRes, activeUsersRes, eventsRes, scoresRes] = await Promise.all([
        getWaitlistTable().select('id, converted_at'),
        getSupabase().from('profiles').select('id', { count: 'exact', head: true }),
        getEngagementEventsTable()
          .select('user_id')
          .gte('created_at', sevenDaysAgo),
        getEngagementEventsTable()
          .select('id', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgo),
        getEngagementScoresView().select('current_score'),
      ]);

      const waitlistRows = waitlistRes.data || [];
      const totalWaitlist = waitlistRows.length;
      const converted = waitlistRows.filter(
        (r: Record<string, unknown>) => r.converted_at !== null
      ).length;
      const conversionRate = totalWaitlist > 0 ? (converted / totalWaitlist) * 100 : 0;

      // Count distinct active users
      const activeUserIds = new Set(
        (activeUsersRes.data || []).map((r: Record<string, unknown>) => r.user_id)
      );

      // Average engagement score
      const scores = (scoresRes.data || []).map(
        (r: Record<string, unknown>) => (r.current_score as number) || 0
      );
      const avgScore = scores.length > 0
        ? scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length
        : 0;

      return {
        totalWaitlist,
        totalProfiles: profilesRes.count || 0,
        activeUsers7d: activeUserIds.size,
        totalEvents30d: eventsRes.count || 0,
        conversionRate,
        avgEngagementScore: Math.round(avgScore * 10) / 10,
      } as InsightsOverview;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// WAITLIST TIME SERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Waitlist signups grouped by day with source/role breakdown
 */
export function useWaitlistTimeSeries(days: number = 30) {
  return useQuery({
    queryKey: ['insights-waitlist-timeseries', days],
    queryFn: async () => {
      const since = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await getWaitlistTable()
        .select('created_at, source, role')
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Group by day
      const byDay = new Map<string, number>();
      for (const row of data || []) {
        const date = new Date(row.created_at as string).toISOString().split('T')[0];
        byDay.set(date, (byDay.get(date) || 0) + 1);
      }

      // Fill in missing days
      const result: { date: string; count: number }[] = [];
      const start = new Date(since);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(0, 0, 0, 0);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        result.push({ date: dateStr, count: byDay.get(dateStr) || 0 });
      }

      return result;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UTM ATTRIBUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Waitlist entries grouped by UTM parameters
 */
export function useUtmAttribution() {
  return useQuery({
    queryKey: ['insights-utm-attribution'],
    queryFn: async () => {
      const { data, error } = await getWaitlistTable()
        .select('utm_source, utm_medium, utm_campaign');

      if (error) throw error;

      // Group by utm_source + utm_medium + utm_campaign
      const groups = new Map<string, UtmAttributionRow>();
      for (const row of data || []) {
        const r = row as Record<string, unknown>;
        const key = `${r.utm_source || '(direct)'}|${r.utm_medium || '(none)'}|${r.utm_campaign || '(none)'}`;
        const existing = groups.get(key);
        if (existing) {
          existing.count++;
        } else {
          groups.set(key, {
            utmSource: (r.utm_source as string) || null,
            utmMedium: (r.utm_medium as string) || null,
            utmCampaign: (r.utm_campaign as string) || null,
            count: 1,
          });
        }
      }

      return Array.from(groups.values()).sort((a, b) => b.count - a.count);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGAGEMENT SCORE DISTRIBUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Engagement scores grouped by tier
 */
export function useEngagementScoreDistribution() {
  return useQuery({
    queryKey: ['insights-engagement-distribution'],
    queryFn: async () => {
      const { data, error } = await getEngagementScoresView()
        .select('engagement_tier');

      if (error) throw error;

      const tiers = new Map<string, number>();
      for (const row of data || []) {
        const tier = (row as Record<string, unknown>).engagement_tier as string;
        tiers.set(tier, (tiers.get(tier) || 0) + 1);
      }

      const tierOrder = ['high', 'medium', 'low', 'minimal'];
      return tierOrder.map((tier) => ({
        tier,
        count: tiers.get(tier) || 0,
      })) as EngagementTierDistribution[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TOP ENGAGED USERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Top engaged users by score (admin leaderboard)
 */
export function useTopEngagedUsers(limit: number = 15) {
  return useQuery({
    queryKey: ['insights-top-engaged', limit],
    queryFn: async () => {
      const { data, error } = await getEngagementScoresView()
        .select('*')
        .order('current_score', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        email: row.email as string,
        role: row.role as string,
        currentScore: row.current_score as number,
        engagementTier: row.engagement_tier as string,
        lastActiveAt: row.last_active_at as string | null,
      })) as TopEngagedUser[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE USERS BY PLATFORM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Count distinct active users grouped by platform
 */
export function useActiveUsersByPlatform(days: number = 30) {
  return useQuery({
    queryKey: ['insights-active-by-platform', days],
    queryFn: async () => {
      const since = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await getEngagementEventsTable()
        .select('user_id, platform')
        .gte('created_at', since);

      if (error) throw error;

      // Count distinct users per platform
      const platformUsers = new Map<string, Set<string>>();
      for (const row of data || []) {
        const r = row as Record<string, unknown>;
        const platform = r.platform as string;
        const userId = r.user_id as string;
        if (!platformUsers.has(platform)) {
          platformUsers.set(platform, new Set());
        }
        platformUsers.get(platform)!.add(userId);
      }

      return Array.from(platformUsers.entries())
        .map(([platform, users]) => ({
          platform,
          count: users.size,
        }))
        .sort((a, b) => b.count - a.count) as PlatformActiveUsers[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNNEL HOOKS
// ═══════════════════════════════════════════════════════════════════════════

function mapFunnelRows(data: Record<string, unknown>[]): FunnelStep[] {
  return data
    .map((row) => ({
      step: row.step as string,
      stepOrder: row.step_order as number,
      count: (row.users_at_step as number) ?? (row.count as number) ?? 0,
      conversionRate: (row.conversion_rate_percent as number) ?? 0,
    }))
    .sort((a, b) => a.stepOrder - b.stepOrder);
}

/**
 * Main conversion funnel (all users)
 */
export function useConversionFunnel() {
  return useQuery({
    queryKey: ['insights-conversion-funnel'],
    queryFn: async () => {
      const { data, error } = await getConversionFunnelView()
        .select('*')
        .order('step_order', { ascending: true });

      if (error) throw error;
      return mapFunnelRows(data || []);
    },
  });
}

/**
 * Designer-specific funnel
 */
export function useDesignerFunnel() {
  return useQuery({
    queryKey: ['insights-designer-funnel'],
    queryFn: async () => {
      const { data, error } = await getDesignerFunnelView()
        .select('*')
        .order('step_order', { ascending: true });

      if (error) throw error;
      return mapFunnelRows(data || []);
    },
  });
}

/**
 * Consumer-specific funnel
 */
export function useConsumerFunnel() {
  return useQuery({
    queryKey: ['insights-consumer-funnel'],
    queryFn: async () => {
      const { data, error } = await getConsumerFunnelView()
        .select('*')
        .order('step_order', { ascending: true });

      if (error) throw error;
      return mapFunnelRows(data || []);
    },
  });
}
