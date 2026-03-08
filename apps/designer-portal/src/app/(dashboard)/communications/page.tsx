'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommsDashboard } from '@patina/supabase/hooks';
import { Plus, Radio, Send, Eye, MousePointer, ShieldCheck, Calendar, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type TimeRange = '24h' | '7d' | '30d' | '90d';

export default function CommandCenterPage() {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const { data, isLoading } = useCommsDashboard(timeRange);

  const ranges: { key: TimeRange; label: string }[] = [
    { key: '24h', label: '24h' },
    { key: '7d', label: '7d' },
    { key: '30d', label: '30d' },
    { key: '90d', label: '90d' },
  ];

  const stats = data?.stats;
  const healthColor = stats?.deliveryHealth === 'critical' ? 'red' :
    stats?.deliveryHealth === 'warning' ? 'yellow' : 'green';

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 text-patina-mocha-brown" />
            <div>
              <h1 className="text-2xl font-display font-semibold text-patina-charcoal">
                Command Center
              </h1>
              <p className="text-sm text-patina-clay-beige mt-0.5">
                Email communications overview
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-patina-off-white rounded-lg p-1">
              {ranges.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setTimeRange(r.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeRange === r.key
                      ? 'bg-white text-patina-charcoal shadow-sm'
                      : 'text-patina-clay-beige hover:text-patina-charcoal'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => router.push('/communications/campaigns/new')}
              className="flex items-center gap-2 px-4 py-2.5 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Delivery health alert */}
        {stats?.deliveryHealth === 'critical' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Delivery Health Critical</p>
              <p className="text-xs text-red-600 mt-0.5">
                Bounce rate is {stats.bounceRate}%. Review bounced emails and clean your lists.
              </p>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Emails Sent"
            value={isLoading ? '...' : (stats?.totalSent?.toLocaleString() ?? '0')}
            icon={<Send className="w-5 h-5" />}
            color="default"
          />
          <StatCard
            label="Open Rate"
            value={isLoading ? '...' : `${stats?.openRate ?? 0}%`}
            icon={<Eye className="w-5 h-5" />}
            color="default"
          />
          <StatCard
            label="Click Rate"
            value={isLoading ? '...' : `${stats?.clickRate ?? 0}%`}
            icon={<MousePointer className="w-5 h-5" />}
            color="default"
          />
          <StatCard
            label="Delivery Health"
            value={isLoading ? '...' : (stats?.deliveryHealth === 'healthy' ? 'Healthy' :
              stats?.deliveryHealth === 'warning' ? 'Warning' : 'Critical')}
            icon={<ShieldCheck className="w-5 h-5" />}
            color={healthColor}
          />
        </div>

        {/* Two-column: Chart + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Send Volume Chart */}
          <div className="bg-white rounded-xl p-6 border border-patina-clay-beige/20">
            <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Send Volume</h3>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
              </div>
            ) : data?.sendVolume && data.sendVolume.length > 0 ? (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={data.sendVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0da" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#a39585' }}
                    tickFormatter={(d: string) => {
                      const date = new Date(d);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#a39585' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
                  />
                  <Bar dataKey="count" fill="#8b7355" radius={[4, 4, 0, 0]} name="Emails" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-patina-clay-beige text-sm">
                No send data for this period
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="bg-white rounded-xl p-6 border border-patina-clay-beige/20">
            <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Recent Activity</h3>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
              </div>
            ) : data?.recentActivity && data.recentActivity.length > 0 ? (
              <div className="space-y-3">
                {data.recentActivity.map((event) => (
                  <div key={event.id} className="flex items-center gap-3 py-1">
                    <ActivityDot status={event.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-patina-charcoal truncate">
                        {event.type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-patina-clay-beige">
                        {formatRelativeTime(event.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={event.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-patina-clay-beige py-4">No recent activity</p>
            )}
          </div>
        </div>

        {/* Scheduled Sends */}
        <div className="bg-white rounded-xl p-6 border border-patina-clay-beige/20">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Scheduled Sends</h3>
          {data?.scheduledSends && data.scheduledSends.length > 0 ? (
            <div className="space-y-2">
              {data.scheduledSends.map((send) => (
                <div
                  key={send.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-patina-off-white cursor-pointer transition-colors"
                  onClick={() => router.push(`/communications/campaigns/${send.id}`)}
                >
                  <Calendar className="w-4 h-4 text-patina-clay-beige shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-patina-charcoal truncate">{send.name}</p>
                    <p className="text-xs text-patina-clay-beige truncate">{send.subject}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-patina-clay-beige shrink-0">
                    <Clock className="w-3 h-3" />
                    {new Date(send.scheduled_for).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </div>
                  <span className="text-xs text-patina-clay-beige shrink-0">
                    {send.total_recipients.toLocaleString()} recipients
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-patina-clay-beige">No scheduled campaigns</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'default' | 'green' | 'yellow' | 'red';
}) {
  const borderColors = {
    default: 'border-patina-clay-beige/20',
    green: 'border-green-200',
    yellow: 'border-yellow-200',
    red: 'border-red-200',
  };

  return (
    <div className={`bg-white rounded-xl p-5 border ${borderColors[color]}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-patina-off-white text-patina-mocha-brown">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-display font-semibold text-patina-charcoal">{value}</p>
      <p className="text-sm text-patina-clay-beige mt-1">{label}</p>
    </div>
  );
}

function ActivityDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    delivered: 'bg-green-400',
    opened: 'bg-blue-400',
    clicked: 'bg-indigo-400',
    bounced: 'bg-red-400',
    failed: 'bg-red-400',
    queued: 'bg-gray-300',
    sending: 'bg-yellow-400',
  };

  return <div className={`w-2 h-2 rounded-full shrink-0 ${colors[status] || 'bg-gray-300'}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    delivered: 'text-green-700 bg-green-100',
    opened: 'text-blue-700 bg-blue-100',
    clicked: 'text-indigo-700 bg-indigo-100',
    bounced: 'text-red-700 bg-red-100',
    failed: 'text-red-700 bg-red-100',
    queued: 'text-gray-700 bg-gray-100',
    sending: 'text-yellow-700 bg-yellow-100',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${colors[status] || 'text-gray-700 bg-gray-100'}`}>
      {status}
    </span>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
