export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, serverError } from '@/lib/admin-api';

function getPeriodStart(period: string): string {
  const now = new Date();
  switch (period) {
    case '24h': now.setHours(now.getHours() - 24); break;
    case '7d': now.setDate(now.getDate() - 7); break;
    case '30d': now.setDate(now.getDate() - 30); break;
    case '90d': now.setDate(now.getDate() - 90); break;
    default: now.setDate(now.getDate() - 7);
  }
  return now.toISOString();
}

export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const period = req.nextUrl.searchParams.get('period') || '7d';
  const since = getPeriodStart(period);

  try {
    const [sentResult, openedResult, clickedResult, bouncedResult, deliveredResult, recentResult, scheduledResult, volumeResult] = await Promise.all([
      supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).in('status', ['delivered', 'opened', 'clicked']),
      supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).not('opened_at', 'is', null),
      supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).not('clicked_at', 'is', null),
      supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('status', 'bounced'),
      supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).in('status', ['delivered', 'opened', 'clicked']),
      supabase.from('notification_log').select('id, type, status, created_at, user_id').order('created_at', { ascending: false }).limit(10),
      supabase.from('campaigns').select('id, name, subject, scheduled_for, total_recipients').eq('status', 'scheduled').order('scheduled_for', { ascending: true }).limit(5),
      supabase.from('notification_log').select('created_at').gte('created_at', since).in('status', ['delivered', 'opened', 'clicked']).order('created_at', { ascending: true }),
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
    for (const log of volumeResult.data || []) {
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
    console.error('Dashboard API error:', err);
    return serverError('Failed to fetch dashboard data');
  }
}
