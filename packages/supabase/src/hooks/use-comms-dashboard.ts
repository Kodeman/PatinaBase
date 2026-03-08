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

export interface CommsDashboardStats {
  totalSent: number;
  openRate: number;
  clickRate: number;
  deliveryHealth: 'healthy' | 'warning' | 'critical';
  bounceRate: number;
}

export interface SendVolumePoint {
  date: string;
  count: number;
}

export interface RecentActivity {
  id: string;
  type: string;
  status: string;
  created_at: string;
  user_id: string;
}

export interface ScheduledSend {
  id: string;
  name: string;
  subject: string;
  scheduled_for: string;
  total_recipients: number;
}

export interface CommsDashboardData {
  stats: CommsDashboardStats;
  sendVolume: SendVolumePoint[];
  recentActivity: RecentActivity[];
  scheduledSends: ScheduledSend[];
}

// ─── Hooks ───────────────────────────────────────────────────────────────

export function useCommsDashboard(period: string = '7d') {
  return useQuery<CommsDashboardData>({
    queryKey: ['comms-dashboard', period],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/dashboard?period=${period}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      return res.json();
    },
    staleTime: 60_000, // 1 minute
    refetchInterval: 120_000, // 2 minutes
  });
}

export function useRecentActivity() {
  return useQuery<RecentActivity[]>({
    queryKey: ['comms-recent-activity'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/comms/dashboard?period=24h', { headers });
      if (!res.ok) throw new Error('Failed to fetch activity');
      const data = await res.json();
      return data.recentActivity;
    },
    staleTime: 30_000,
  });
}

export function useUpcomingSends() {
  return useQuery<ScheduledSend[]>({
    queryKey: ['comms-upcoming-sends'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/comms/dashboard?period=7d', { headers });
      if (!res.ok) throw new Error('Failed to fetch scheduled sends');
      const data = await res.json();
      return data.scheduledSends;
    },
    staleTime: 60_000,
  });
}
