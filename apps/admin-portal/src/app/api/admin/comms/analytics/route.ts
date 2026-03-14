export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, serverError } from '@/lib/admin-api';

function getPeriodStart(period: string): string {
  const now = new Date();
  switch (period) {
    case '7d': now.setDate(now.getDate() - 7); break;
    case '30d': now.setDate(now.getDate() - 30); break;
    case '90d': now.setDate(now.getDate() - 90); break;
    default: now.setDate(now.getDate() - 7);
  }
  return now.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOverview(supabase: any, since: string) {
  const { data: logs } = await supabase
    .from('notification_log')
    .select('id, status, opened_at, clicked_at, created_at, metadata')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  const allLogs = logs || [];
  const deliveredStatuses = ['delivered', 'opened', 'clicked'];

  const totalSent = allLogs.filter((l: { status: string }) => deliveredStatuses.includes(l.status) || l.status === 'bounced').length;
  const totalDelivered = allLogs.filter((l: { status: string }) => deliveredStatuses.includes(l.status)).length;
  const totalOpened = allLogs.filter((l: { opened_at: string | null }) => l.opened_at).length;
  const totalClicked = allLogs.filter((l: { clicked_at: string | null }) => l.clicked_at).length;
  const totalBounced = allLogs.filter((l: { status: string }) => l.status === 'bounced').length;

  const dayMap: Record<string, { sent: number; opened: number; clicked: number }> = {};
  for (const log of allLogs) {
    const day = log.created_at.slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { sent: 0, opened: 0, clicked: 0 };
    if (deliveredStatuses.includes(log.status) || log.status === 'bounced') dayMap[day].sent++;
    if (log.opened_at) dayMap[day].opened++;
    if (log.clicked_at) dayMap[day].clicked++;
  }

  const timeSeries = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      openRate: counts.sent > 0 ? Math.round((counts.opened / counts.sent) * 1000) / 10 : 0,
      clickRate: counts.sent > 0 ? Math.round((counts.clicked / counts.sent) * 1000) / 10 : 0,
      sent: counts.sent,
    }));

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, sent_count, open_count, click_count')
    .in('status', ['sent', 'sending'])
    .gte('created_at', since)
    .order('open_count', { ascending: false })
    .limit(10);

  const campaignList = campaigns || [];

  const topByOpens = campaignList
    .sort((a: { open_count: number }, b: { open_count: number }) => b.open_count - a.open_count)
    .slice(0, 5)
    .map((c: { name: string; open_count: number; sent_count: number }) => ({ name: c.name, opens: c.open_count, sent: c.sent_count }));

  const topByClicks = [...campaignList]
    .sort((a: { click_count: number }, b: { click_count: number }) => b.click_count - a.click_count)
    .slice(0, 5)
    .map((c: { name: string; click_count: number; sent_count: number }) => ({ name: c.name, clicks: c.click_count, sent: c.sent_count }));

  return {
    totalSent, totalDelivered, totalOpened, totalClicked, totalBounced,
    avgOpenRate: totalDelivered > 0 ? Math.round((totalOpened / totalDelivered) * 1000) / 10 : 0,
    avgClickRate: totalDelivered > 0 ? Math.round((totalClicked / totalDelivered) * 1000) / 10 : 0,
    bounceRate: totalSent > 0 ? Math.round((totalBounced / totalSent) * 1000) / 10 : 0,
    timeSeries, topByOpens, topByClicks,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getComparison(supabase: any, campaignIds: string[]) {
  const query = campaignIds.length === 0
    ? supabase.from('campaigns').select('id, name, subject, sent_count, open_count, click_count, bounce_count, status').in('status', ['sent', 'sending']).order('sent_at', { ascending: false }).limit(10)
    : supabase.from('campaigns').select('id, name, subject, sent_count, open_count, click_count, bounce_count, status').in('id', campaignIds);

  const { data } = await query;

  return {
    campaigns: (data || []).map((c: { id: string; name: string; subject: string; sent_count: number; open_count: number; click_count: number; bounce_count: number }) => ({
      id: c.id, name: c.name, subject: c.subject,
      sent_count: c.sent_count, open_count: c.open_count, click_count: c.click_count, bounce_count: c.bounce_count,
      openRate: c.sent_count > 0 ? Math.round((c.open_count / c.sent_count) * 1000) / 10 : 0,
      clickRate: c.sent_count > 0 ? Math.round((c.click_count / c.sent_count) * 1000) / 10 : 0,
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAttribution(supabase: any, since: string) {
  const deliveredStatuses = ['delivered', 'opened', 'clicked'];
  const [sentResult, openedResult, clickedResult] = await Promise.all([
    supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).in('status', [...deliveredStatuses, 'bounced']),
    supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).not('opened_at', 'is', null),
    supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).not('clicked_at', 'is', null),
  ]);

  const sent = sentResult.count || 0;
  const opened = openedResult.count || 0;
  const clicked = clickedResult.count || 0;

  return {
    funnel: [
      { stage: 'Sent', count: sent, rate: 100 },
      { stage: 'Opened', count: opened, rate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0 },
      { stage: 'Clicked', count: clicked, rate: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0 },
      { stage: 'Visited', count: 0, rate: 0 },
      { stage: 'Purchased', count: 0, rate: 0 },
    ],
    revenueTotal: 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCohorts(supabase: any) {
  const { data: scores } = await supabase.from('user_engagement_scores').select('engagement_tier');
  const tiers = scores || [];
  const total = tiers.length;
  const tierCounts: Record<string, number> = { high: 0, medium: 0, low: 0, minimal: 0 };
  for (const row of tiers) {
    const tier = row.engagement_tier as string;
    if (tier in tierCounts) tierCounts[tier]++;
  }

  return {
    tiers: [
      { tier: 'Highly Engaged', key: 'high', count: tierCounts.high, pct: total > 0 ? Math.round((tierCounts.high / total) * 1000) / 10 : 0 },
      { tier: 'Engaged', key: 'medium', count: tierCounts.medium, pct: total > 0 ? Math.round((tierCounts.medium / total) * 1000) / 10 : 0 },
      { tier: 'Passive', key: 'low', count: tierCounts.low, pct: total > 0 ? Math.round((tierCounts.low / total) * 1000) / 10 : 0 },
      { tier: 'Dormant', key: 'minimal', count: tierCounts.minimal, pct: total > 0 ? Math.round((tierCounts.minimal / total) * 1000) / 10 : 0 },
    ],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDeliveryHealth(supabase: any, since: string) {
  const deliveredStatuses = ['delivered', 'opened', 'clicked'];
  const [totalResult, deliveredResult, bouncedResult, complaintsResult, suppressedResult] = await Promise.all([
    supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).in('status', [...deliveredStatuses, 'bounced', 'failed']),
    supabase.from('notification_log').select('*', { count: 'exact', head: true }).gte('created_at', since).in('status', deliveredStatuses),
    supabase.from('notification_log').select('error', { count: 'exact' }).gte('created_at', since).eq('status', 'bounced'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('email_complaint', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('email_suppressed', true),
  ]);

  const total = totalResult.count || 0;
  const delivered = deliveredResult.count || 0;
  const bounced = bouncedResult.count || 0;
  const complaints = complaintsResult.count || 0;
  const suppressed = suppressedResult.count || 0;

  const bounceData = bouncedResult.data || [];
  let hardBounces = 0;
  let softBounces = 0;
  for (const b of bounceData) {
    const err = (b.error || '').toLowerCase();
    if (err.includes('hard') || err.includes('permanent') || err.includes('invalid') || err.includes('not found')) hardBounces++;
    else softBounces++;
  }

  return {
    deliveryRate: total > 0 ? Math.round((delivered / total) * 1000) / 10 : 100,
    bounceRate: total > 0 ? Math.round((bounced / total) * 1000) / 10 : 0,
    complaintRate: total > 0 ? Math.round((complaints / total) * 10000) / 100 : 0,
    hardBounces, softBounces, totalSuppressed: suppressed,
  };
}

export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const view = req.nextUrl.searchParams.get('view') || 'overview';
  const period = req.nextUrl.searchParams.get('period') || '7d';
  const since = getPeriodStart(period);

  try {
    switch (view) {
      case 'overview':
        return NextResponse.json(await getOverview(supabase, since));
      case 'comparison': {
        const idsParam = req.nextUrl.searchParams.get('campaign_ids') || '';
        const campaignIds = idsParam ? idsParam.split(',').filter(Boolean) : [];
        return NextResponse.json(await getComparison(supabase, campaignIds));
      }
      case 'attribution':
        return NextResponse.json(await getAttribution(supabase, since));
      case 'cohorts':
        return NextResponse.json(await getCohorts(supabase));
      case 'delivery':
        return NextResponse.json(await getDeliveryHealth(supabase, since));
      default:
        return badRequest('Invalid view parameter');
    }
  } catch (err) {
    console.error('Analytics API error:', err);
    return serverError('Failed to fetch analytics data');
  }
}
