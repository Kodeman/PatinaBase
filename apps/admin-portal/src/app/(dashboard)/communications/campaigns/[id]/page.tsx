'use client';

import { useRouter, useParams } from 'next/navigation';
import { useCampaign } from '@patina/supabase/hooks';
import { ChevronLeft, Mail, MousePointerClick, Eye, AlertTriangle, Users, Clock, Beaker, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

function StatCard({ label, value, suffix, color }: { label: string; value: string | number; suffix?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5">
      <p className="text-xs font-medium text-patina-clay-beige uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('text-2xl font-semibold', color || 'text-patina-charcoal')}>
        {value}{suffix}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    scheduled: 'bg-blue-100 text-blue-700',
    sending: 'bg-yellow-100 text-yellow-700',
    sent: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    archived: 'bg-gray-100 text-gray-500',
  };

  return (
    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium capitalize', colors[status] || colors.draft)}>
      {status}
    </span>
  );
}

export default function CampaignReportPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: campaign, isLoading } = useCampaign(id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <p className="text-patina-clay-beige">Campaign not found</p>
      </div>
    );
  }

  const sent = campaign.sent_count || campaign.total_recipients || 0;
  const opens = campaign.open_count || 0;
  const clicks = campaign.click_count || 0;
  const bounces = campaign.bounce_count || 0;
  const unsubs = campaign.unsubscribe_count || 0;

  const openRate = sent > 0 ? ((opens / sent) * 100).toFixed(1) : '0.0';
  const clickRate = sent > 0 ? ((clicks / sent) * 100).toFixed(1) : '0.0';
  const bounceRate = sent > 0 ? ((bounces / sent) * 100).toFixed(1) : '0.0';
  const ctr = opens > 0 ? ((clicks / opens) * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <button
          onClick={() => router.push('/communications/campaigns')}
          className="flex items-center gap-1 text-sm text-patina-clay-beige hover:text-patina-charcoal mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Campaigns
        </button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-display font-semibold text-patina-charcoal">{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
            </div>
            <p className="text-sm text-patina-clay-beige">{campaign.subject}</p>
          </div>
          <div className="flex items-center gap-3">
            {['draft', 'scheduled'].includes(campaign.status) && (
              <button
                onClick={() => router.push(`/communications/campaigns/${id}/edit`)}
                className="flex items-center gap-2 px-4 py-2 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edit Campaign
              </button>
            )}
            {campaign.sent_at && (
              <div className="flex items-center gap-2 text-sm text-patina-clay-beige">
                <Clock className="w-4 h-4" />
                Sent {new Date(campaign.sent_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6 max-w-6xl">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard label="Sent" value={sent.toLocaleString()} />
          <StatCard label="Opens" value={opens.toLocaleString()} />
          <StatCard label="Open Rate" value={openRate} suffix="%" color="text-green-600" />
          <StatCard label="Clicks" value={clicks.toLocaleString()} />
          <StatCard label="Click Rate" value={clickRate} suffix="%" color="text-blue-600" />
          <StatCard label="CTR" value={ctr} suffix="%" color="text-indigo-600" />
        </div>

        {/* Performance breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Engagement funnel */}
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
            <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Engagement Funnel</h3>
            <div className="space-y-3">
              {[
                { label: 'Sent', count: sent, pct: 100, icon: Mail, color: 'bg-patina-mocha-brown' },
                { label: 'Opened', count: opens, pct: sent > 0 ? (opens / sent) * 100 : 0, icon: Eye, color: 'bg-green-500' },
                { label: 'Clicked', count: clicks, pct: sent > 0 ? (clicks / sent) * 100 : 0, icon: MousePointerClick, color: 'bg-blue-500' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <item.icon className="w-4 h-4 text-patina-clay-beige shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-patina-charcoal">{item.label}</span>
                      <span className="text-sm font-medium text-patina-charcoal">
                        {item.count.toLocaleString()} ({item.pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-patina-off-white rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', item.color)}
                        style={{ width: `${Math.min(item.pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery stats */}
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
            <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Delivery Health</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-patina-clay-beige">Delivered</span>
                <span className="text-sm font-medium text-green-600">
                  {(sent - bounces).toLocaleString()} ({sent > 0 ? ((1 - bounces / sent) * 100).toFixed(1) : '100'}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-patina-clay-beige">Bounced</span>
                <span className={cn('text-sm font-medium', bounces > 0 ? 'text-red-500' : 'text-patina-charcoal')}>
                  {bounces.toLocaleString()} ({bounceRate}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-patina-clay-beige">Unsubscribed</span>
                <span className={cn('text-sm font-medium', unsubs > 0 ? 'text-amber-500' : 'text-patina-charcoal')}>
                  {unsubs.toLocaleString()}
                </span>
              </div>

              {bounces > 0 && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">
                    This campaign had a {bounceRate}% bounce rate. Consider cleaning your audience segment.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* A/B test results */}
        {campaign.ab_enabled && campaign.ab_subject_b && (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Beaker className="w-4 h-4 text-patina-mocha-brown" />
              <h3 className="text-sm font-semibold text-patina-charcoal">A/B Test Results</h3>
              {campaign.ab_winner && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  Winner: Variant {campaign.ab_winner.toUpperCase()}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className={cn(
                'p-4 rounded-lg border',
                campaign.ab_winner === 'a' ? 'border-green-300 bg-green-50' : 'border-patina-clay-beige/20'
              )}>
                <p className="text-xs font-medium text-patina-clay-beige mb-1">Variant A</p>
                <p className="text-sm font-medium text-patina-charcoal mb-2">{campaign.subject}</p>
                <p className="text-xs text-patina-clay-beige">
                  Split: {campaign.ab_split_pct || 50}%
                </p>
              </div>
              <div className={cn(
                'p-4 rounded-lg border',
                campaign.ab_winner === 'b' ? 'border-green-300 bg-green-50' : 'border-patina-clay-beige/20'
              )}>
                <p className="text-xs font-medium text-patina-clay-beige mb-1">Variant B</p>
                <p className="text-sm font-medium text-patina-charcoal mb-2">{campaign.ab_subject_b}</p>
                <p className="text-xs text-patina-clay-beige">
                  Split: {100 - (campaign.ab_split_pct || 50)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Audience info */}
        {campaign.audience_snapshot && (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-patina-mocha-brown" />
              <h3 className="text-sm font-semibold text-patina-charcoal">Audience Snapshot</h3>
            </div>
            <p className="text-sm text-patina-clay-beige">
              {(campaign.audience_snapshot as { total?: number }).total?.toLocaleString() || sent.toLocaleString()} recipients at time of send
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
