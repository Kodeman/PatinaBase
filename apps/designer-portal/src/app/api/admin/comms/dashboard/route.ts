export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@patina/supabase/server';

function getPeriodStart(period: string): string {
  const now = new Date();
  switch (period) {
    case '24h':
      now.setHours(now.getHours() - 24);
      break;
    case '7d':
      now.setDate(now.getDate() - 7);
      break;
    case '30d':
      now.setDate(now.getDate() - 30);
      break;
    case '90d':
      now.setDate(now.getDate() - 90);
      break;
    default:
      now.setDate(now.getDate() - 7);
  }
  return now.toISOString();
}

// GET /api/admin/comms/dashboard - Communications hub stats.
// Powers useCommsDashboard / useRecentActivity / useUpcomingSends.
export async function GET(req: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag the comms columns
    const authClient: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Aggregates span platform-wide notification data; use the service client
    // so RLS on notification_log does not blank the counts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createServiceClient();

    const period = req.nextUrl.searchParams.get('period') || '7d';
    const since = getPeriodStart(period);

    const [
      sentResult,
      openedResult,
      clickedResult,
      bouncedResult,
      deliveredResult,
      recentResult,
      scheduledResult,
      volumeResult,
    ] = await Promise.all([
      supabase
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since)
        .in('status', ['sent', 'delivered', 'opened', 'clicked', 'unconfirmed']),
      supabase
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since)
        .not('opened_at', 'is', null),
      supabase
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since)
        .not('clicked_at', 'is', null),
      supabase
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since)
        .eq('status', 'bounced'),
      supabase
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since)
        .in('status', ['delivered', 'opened', 'clicked']),
      supabase
        .from('notification_log')
        .select('id, type, status, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('campaigns')
        .select('id, name, subject, scheduled_for, total_recipients')
        .eq('status', 'scheduled')
        .order('scheduled_for', { ascending: true })
        .limit(5),
      supabase
        .from('notification_log')
        .select('created_at')
        .gte('created_at', since)
        .in('status', ['sent', 'delivered', 'opened', 'clicked', 'unconfirmed'])
        .order('created_at', { ascending: true }),
    ]);

    const totalSent = sentResult.count || 0;
    const totalOpened = openedResult.count || 0;
    const totalClicked = clickedResult.count || 0;
    const totalBounced = bouncedResult.count || 0;
    const totalDelivered = deliveredResult.count || 0;

    const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
    const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;

    const volumeByDay: Record<string, number> = {};
    for (const log of (volumeResult.data || []) as Array<{ created_at: string }>) {
      const day = log.created_at.slice(0, 10);
      volumeByDay[day] = (volumeByDay[day] || 0) + 1;
    }
    const sendVolume = Object.entries(volumeByDay).map(([date, count]) => ({ date, count }));

    let deliveryHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (bounceRate > 5) deliveryHealth = 'critical';
    else if (bounceRate > 2) deliveryHealth = 'warning';

    return NextResponse.json({
      stats: {
        totalSent,
        openRate: Math.round(openRate * 10) / 10,
        clickRate: Math.round(clickRate * 10) / 10,
        deliveryHealth,
        bounceRate: Math.round(bounceRate * 10) / 10,
      },
      sendVolume,
      recentActivity: recentResult.data || [],
      scheduledSends: scheduledResult.data || [],
    });
  } catch (err) {
    console.error('[API] GET /admin/comms/dashboard error:', err);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
