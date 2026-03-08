'use client';

import { useState } from 'react';
import {
  useEarnings,
  useEarningsStats,
  useMonthlyEarnings,
  usePayouts,
  usePayoutStats,
} from '@patina/supabase';
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Users,
  Gift,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getStatusBadge(status: string) {
  const configs: Record<string, { label: string; className: string }> = {
    pending: {
      label: 'Pending',
      className: 'bg-amber-100 text-amber-700',
    },
    confirmed: {
      label: 'Confirmed',
      className: 'bg-blue-100 text-blue-700',
    },
    paid: {
      label: 'Paid',
      className: 'bg-green-100 text-green-700',
    },
  };

  const config = configs[status] || configs.pending;
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', config.className)}>
      {config.label}
    </span>
  );
}

function getSourceIcon(sourceType: string) {
  const icons: Record<string, React.ReactNode> = {
    proposal: <FileText className="w-4 h-4" />,
    commission: <DollarSign className="w-4 h-4" />,
    referral: <Users className="w-4 h-4" />,
    other: <Gift className="w-4 h-4" />,
  };
  return icons[sourceType] || icons.other;
}

function getSourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    proposal: 'Proposal',
    commission: 'Commission',
    referral: 'Referral',
    other: 'Other',
  };
  return labels[sourceType] || 'Other';
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatsCard({
  label,
  value,
  icon,
  trend,
  trendLabel,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      'bg-white rounded-xl p-5 border border-patina-clay-beige/20',
      highlight && 'border-patina-mocha-brown'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center',
          highlight ? 'bg-patina-mocha-brown text-white' : 'bg-patina-off-white text-patina-mocha-brown'
        )}>
          {icon}
        </div>
        {trend && trendLabel && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium',
            trend === 'up' && 'text-green-600',
            trend === 'down' && 'text-red-600',
            trend === 'neutral' && 'text-patina-clay-beige'
          )}>
            {trend === 'up' && <ArrowUpRight className="w-3 h-3" />}
            {trend === 'down' && <ArrowDownRight className="w-3 h-3" />}
            {trendLabel}
          </div>
        )}
      </div>
      <p className="text-2xl font-display font-semibold text-patina-charcoal">{value}</p>
      <p className="text-sm text-patina-clay-beige mt-1">{label}</p>
    </div>
  );
}

function EarningsChart({ data }: { data: { month: string; amount: number; label: string }[] }) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);

  return (
    <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
      <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-6">
        Monthly Earnings
      </h2>

      <div className="flex items-end gap-2 h-48">
        {data.map((item) => {
          const height = (item.amount / maxAmount) * 100;
          return (
            <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex items-end justify-center h-40">
                <div
                  className="w-full max-w-8 bg-patina-mocha-brown/20 rounded-t-md transition-all hover:bg-patina-mocha-brown/40"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={formatCurrency(item.amount)}
                />
              </div>
              <span className="text-xs text-patina-clay-beige">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EarningsBySource({ bySource }: { bySource: Record<string, number> }) {
  const total = Object.values(bySource).reduce((sum, val) => sum + val, 0);

  const sources = [
    { key: 'proposal', label: 'Proposals', icon: <FileText className="w-4 h-4" />, color: 'bg-blue-500' },
    { key: 'commission', label: 'Commissions', icon: <DollarSign className="w-4 h-4" />, color: 'bg-green-500' },
    { key: 'referral', label: 'Referrals', icon: <Users className="w-4 h-4" />, color: 'bg-purple-500' },
    { key: 'other', label: 'Other', icon: <Gift className="w-4 h-4" />, color: 'bg-patina-clay-beige' },
  ];

  return (
    <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
      <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">
        Earnings by Source
      </h2>

      <div className="space-y-4">
        {sources.map((source) => {
          const amount = bySource[source.key] || 0;
          const percentage = total > 0 ? (amount / total) * 100 : 0;

          return (
            <div key={source.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-patina-clay-beige">{source.icon}</span>
                  <span className="text-sm text-patina-charcoal">{source.label}</span>
                </div>
                <span className="text-sm font-medium text-patina-charcoal">
                  {formatCurrency(amount)}
                </span>
              </div>
              <div className="h-2 bg-patina-off-white rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', source.color)}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function EarningsPage() {
  const [tab, setTab] = useState<'overview' | 'history' | 'payouts'>('overview');

  const { data: earnings = [], isLoading: loadingEarnings } = useEarnings();
  const { data: stats } = useEarningsStats();
  const { data: monthlyData = [] } = useMonthlyEarnings(6);
  const { data: payouts = [] } = usePayouts();
  const { data: payoutStats } = usePayoutStats();

  // Calculate trend
  const trend = stats && stats.lastMonthEarnings > 0
    ? ((stats.thisMonthEarnings - stats.lastMonthEarnings) / stats.lastMonthEarnings) * 100
    : 0;
  const trendDirection = trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral';

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20">
        <div className="px-8 py-6">
          <h1 className="font-display text-2xl font-semibold text-patina-charcoal">Earnings</h1>
          <p className="text-patina-clay-beige mt-1">
            Track your income and payouts
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <StatsCard
              label="This Month"
              value={stats ? formatCurrency(stats.thisMonthEarnings) : '--'}
              icon={<TrendingUp className="w-5 h-5" />}
              trend={trendDirection}
              trendLabel={trend !== 0 ? `${Math.abs(trend).toFixed(0)}%` : undefined}
              highlight
            />
            <StatsCard
              label="Pending"
              value={stats ? formatCurrency(stats.pendingEarnings) : '--'}
              icon={<Clock className="w-5 h-5" />}
            />
            <StatsCard
              label="Available"
              value={stats ? formatCurrency(stats.confirmedEarnings) : '--'}
              icon={<CheckCircle className="w-5 h-5" />}
            />
            <StatsCard
              label="Total Earned"
              value={stats ? formatCurrency(stats.totalEarnings) : '--'}
              icon={<DollarSign className="w-5 h-5" />}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6">
            {(['overview', 'history', 'payouts'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors',
                  tab === t
                    ? 'bg-patina-charcoal text-white'
                    : 'bg-patina-off-white text-patina-mocha-brown hover:bg-patina-soft-cream'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EarningsChart data={monthlyData} />
            {stats && <EarningsBySource bySource={stats.bySource} />}
          </div>
        )}

        {tab === 'history' && (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20">
            <div className="p-4 border-b border-patina-clay-beige/10">
              <h2 className="font-display text-lg font-semibold text-patina-charcoal">
                Transaction History
              </h2>
            </div>

            {loadingEarnings ? (
              <div className="p-8 text-center">
                <div className="animate-pulse space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-patina-off-white rounded" />
                  ))}
                </div>
              </div>
            ) : earnings.length === 0 ? (
              <div className="p-8 text-center">
                <DollarSign className="w-12 h-12 text-patina-clay-beige mx-auto mb-4" />
                <p className="text-patina-clay-beige">No earnings yet</p>
              </div>
            ) : (
              <div className="divide-y divide-patina-clay-beige/10">
                {earnings.map((earning) => (
                  <div key={earning.id} className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-patina-off-white flex items-center justify-center text-patina-mocha-brown">
                      {getSourceIcon(earning.source_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-patina-charcoal">
                        {earning.description || getSourceLabel(earning.source_type)}
                      </p>
                      <p className="text-sm text-patina-clay-beige">
                        {earning.proposal?.title || getSourceLabel(earning.source_type)} &bull;{' '}
                        {new Date(earning.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-semibold text-patina-charcoal">
                        +{formatCurrency(earning.amount)}
                      </p>
                      {getStatusBadge(earning.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'payouts' && (
          <div className="space-y-6">
            {/* Payout Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-4">
                <p className="text-sm text-patina-clay-beige">Total Paid Out</p>
                <p className="text-2xl font-display font-semibold text-patina-charcoal">
                  {payoutStats ? formatCurrency(payoutStats.totalPaidOut) : '--'}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-4">
                <p className="text-sm text-patina-clay-beige">Pending Payout</p>
                <p className="text-2xl font-display font-semibold text-amber-600">
                  {payoutStats ? formatCurrency(payoutStats.pendingPayout) : '--'}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-4">
                <p className="text-sm text-patina-clay-beige">Total Payouts</p>
                <p className="text-2xl font-display font-semibold text-patina-charcoal">
                  {payoutStats?.payoutCount ?? 0}
                </p>
              </div>
            </div>

            {/* Payout History */}
            <div className="bg-white rounded-xl border border-patina-clay-beige/20">
              <div className="p-4 border-b border-patina-clay-beige/10">
                <h2 className="font-display text-lg font-semibold text-patina-charcoal">
                  Payout History
                </h2>
              </div>

              {payouts.length === 0 ? (
                <div className="p-8 text-center">
                  <DollarSign className="w-12 h-12 text-patina-clay-beige mx-auto mb-4" />
                  <p className="text-patina-clay-beige">No payouts yet</p>
                </div>
              ) : (
                <div className="divide-y divide-patina-clay-beige/10">
                  {payouts.map((payout) => (
                    <div key={payout.id} className="p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-patina-charcoal">
                          Payout #{payout.id.slice(0, 8)}
                        </p>
                        <p className="text-sm text-patina-clay-beige">
                          {payout.payout_method || 'Bank Transfer'} &bull;{' '}
                          {new Date(payout.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display font-semibold text-patina-charcoal">
                          {formatCurrency(payout.amount)}
                        </p>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          payout.status === 'completed' && 'bg-green-100 text-green-700',
                          payout.status === 'processing' && 'bg-blue-100 text-blue-700',
                          payout.status === 'pending' && 'bg-amber-100 text-amber-700',
                          payout.status === 'failed' && 'bg-red-100 text-red-700'
                        )}>
                          {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
