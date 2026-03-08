'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLeads, useLeadStats, type LeadFilters, type Lead } from '@patina/supabase';
import { Inbox, Filter, TrendingUp, Clock, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type StatusFilter = 'all' | 'new' | 'viewed' | 'contacted' | 'accepted' | 'declined';

const PROJECT_TYPES = [
  { value: '', label: 'All Project Types' },
  { value: 'full_room', label: 'Full Room Design' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'single_piece', label: 'Single Piece' },
  { value: 'staging', label: 'Staging' },
];

const BUDGET_RANGES = [
  { value: '', label: 'All Budgets' },
  { value: 'under_5k', label: 'Under $5,000' },
  { value: '5k_15k', label: '$5,000 - $15,000' },
  { value: '15k_50k', label: '$15,000 - $50,000' },
  { value: '50k_100k', label: '$50,000 - $100,000' },
  { value: 'over_100k', label: 'Over $100,000' },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatMatchScore(score: number | null): string {
  if (score === null) return '--';
  return `${Math.round(score * 100)}%`;
}

function getMatchScoreColor(score: number | null): string {
  if (score === null) return 'text-patina-clay-beige';
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-amber-600';
  return 'text-patina-clay-beige';
}

function formatBudgetRange(range: string | null): string {
  const labels: Record<string, string> = {
    under_5k: 'Under $5K',
    '5k_15k': '$5K-$15K',
    '15k_50k': '$15K-$50K',
    '50k_100k': '$50K-$100K',
    over_100k: '$100K+',
  };
  return range ? labels[range] || range : 'Not specified';
}

function formatProjectType(type: string): string {
  const labels: Record<string, string> = {
    full_room: 'Full Room Design',
    consultation: 'Consultation',
    single_piece: 'Single Piece',
    staging: 'Staging',
  };
  return labels[type] || type;
}

function formatTimeline(timeline: string | null): string {
  const labels: Record<string, string> = {
    asap: 'ASAP',
    '1_3_months': '1-3 months',
    '3_6_months': '3-6 months',
    '6_12_months': '6-12 months',
    flexible: 'Flexible',
  };
  return timeline ? labels[timeline] || timeline : 'Flexible';
}

function getStatusBadge(status: string) {
  const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    new: {
      label: 'New',
      className: 'bg-blue-100 text-blue-700',
      icon: <Inbox className="w-3 h-3" />,
    },
    viewed: {
      label: 'Viewed',
      className: 'bg-patina-off-white text-patina-mocha-brown',
      icon: null,
    },
    contacted: {
      label: 'Contacted',
      className: 'bg-amber-100 text-amber-700',
      icon: <Clock className="w-3 h-3" />,
    },
    accepted: {
      label: 'Accepted',
      className: 'bg-green-100 text-green-700',
      icon: <CheckCircle className="w-3 h-3" />,
    },
    declined: {
      label: 'Declined',
      className: 'bg-red-100 text-red-700',
      icon: <XCircle className="w-3 h-3" />,
    },
  };

  const config = configs[status] || configs.new;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', config.className)}>
      {config.icon}
      {config.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatsCard({ label, value, icon, highlight }: { label: string; value: number | string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn(
      'bg-white rounded-2xl p-4 shadow-patina-sm transition-all duration-200 hover:shadow-patina-md',
      highlight && 'border-l-4 border-patina-mocha-brown'
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center',
          highlight ? 'bg-patina-mocha-brown text-white' : 'bg-patina-off-white text-patina-mocha-brown'
        )}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-display font-semibold text-patina-charcoal tracking-tight">{value}</p>
          <p className="text-xs text-patina-clay-beige">{label}</p>
        </div>
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const isNew = lead.status === 'new';
  const isHighMatch = (lead.match_score ?? 0) >= 0.8;

  return (
    <Link
      href={`/leads/${lead.id}`}
      className={cn(
        'block bg-white rounded-2xl shadow-patina-sm transition-all duration-200 hover:shadow-patina-md hover:-translate-y-0.5',
        isNew && 'border-l-4 border-blue-400'
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-patina-charcoal truncate">
              {lead.homeowner?.full_name || lead.homeowner?.email || 'Anonymous Lead'}
            </h3>
            <p className="text-sm text-patina-clay-beige">
              {lead.location_city && lead.location_state
                ? `${lead.location_city}, ${lead.location_state}`
                : 'Location not specified'}
            </p>
          </div>
          {getStatusBadge(lead.status)}
        </div>

        {/* Project Info */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-patina-clay-beige">Project:</span>
            <span className="text-patina-charcoal font-medium">{formatProjectType(lead.project_type)}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-patina-clay-beige">Budget:</span>{' '}
              <span className="text-patina-charcoal">{formatBudgetRange(lead.budget_range)}</span>
            </div>
            <div>
              <span className="text-patina-clay-beige">Timeline:</span>{' '}
              <span className="text-patina-charcoal">{formatTimeline(lead.timeline)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-patina-clay-beige/10">
          <div className="flex items-center gap-2">
            <TrendingUp className={cn('w-4 h-4', getMatchScoreColor(lead.match_score))} />
            <span className={cn('text-sm font-medium', getMatchScoreColor(lead.match_score))}>
              {formatMatchScore(lead.match_score)} match
            </span>
            {isHighMatch && (
              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                High
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-patina-clay-beige">
            <span className="text-xs">
              {new Date(lead.created_at).toLocaleDateString()}
            </span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function LeadsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectType, setProjectType] = useState('');
  const [budgetRange, setBudgetRange] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Build filters
  const filters: LeadFilters = {};
  if (statusFilter !== 'all') {
    filters.status = statusFilter;
  }
  if (projectType) {
    filters.projectType = projectType;
  }
  if (budgetRange) {
    filters.budgetRange = budgetRange;
  }

  const { data: leads = [], isLoading } = useLeads(filters);
  const { data: stats } = useLeadStats();

  const statusTabs: { value: StatusFilter; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: stats?.total },
    { value: 'new', label: 'New', count: stats?.new },
    { value: 'viewed', label: 'Viewed', count: stats?.viewed },
    { value: 'contacted', label: 'Contacted', count: stats?.contacted },
    { value: 'accepted', label: 'Accepted', count: stats?.accepted },
    { value: 'declined', label: 'Declined', count: stats?.declined },
  ];

  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-b from-white to-patina-soft-cream/50 shadow-patina-sm">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-2xl font-semibold text-patina-charcoal tracking-tight">Lead Inbox</h1>
              <p className="text-patina-clay-beige mt-1">
                Manage project inquiries and find your next client
              </p>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                showFilters
                  ? 'bg-patina-charcoal text-white border-patina-charcoal'
                  : 'bg-white text-patina-charcoal border-patina-clay-beige/30 hover:border-patina-clay-beige'
              )}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatsCard
              label="New Leads"
              value={stats?.new ?? 0}
              icon={<Inbox className="w-5 h-5" />}
              highlight
            />
            <StatsCard
              label="High Match"
              value={stats?.highMatch ?? 0}
              icon={<TrendingUp className="w-5 h-5" />}
            />
            <StatsCard
              label="Avg Match"
              value={stats ? `${Math.round(stats.avgMatchScore * 100)}%` : '--'}
              icon={<TrendingUp className="w-5 h-5" />}
            />
            <StatsCard
              label="Accepted"
              value={stats?.accepted ?? 0}
              icon={<CheckCircle className="w-5 h-5" />}
            />
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="bg-patina-off-white rounded-xl p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-patina-charcoal mb-1">
                    Project Type
                  </label>
                  <select
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown"
                  >
                    {PROJECT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-patina-charcoal mb-1">
                    Budget Range
                  </label>
                  <select
                    value={budgetRange}
                    onChange={(e) => setBudgetRange(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown"
                  >
                    {BUDGET_RANGES.map((range) => (
                      <option key={range.value} value={range.value}>
                        {range.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Status Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-2">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  statusFilter === tab.value
                    ? 'bg-patina-charcoal text-white'
                    : 'bg-patina-off-white text-patina-mocha-brown hover:bg-patina-soft-cream'
                )}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-xs',
                    statusFilter === tab.value
                      ? 'bg-white/20 text-white'
                      : 'bg-patina-clay-beige/20 text-patina-clay-beige'
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {isLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-32 h-5 bg-patina-off-white rounded" />
                  <div className="w-16 h-5 bg-patina-off-white rounded-full" />
                </div>
                <div className="space-y-2">
                  <div className="w-48 h-4 bg-patina-off-white rounded" />
                  <div className="w-64 h-4 bg-patina-off-white rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12">
            <Inbox className="w-12 h-12 text-patina-clay-beige mx-auto mb-4" />
            <h3 className="font-display text-lg font-semibold text-patina-charcoal mb-2">
              No leads yet
            </h3>
            <p className="text-patina-clay-beige">
              {statusFilter === 'all'
                ? 'New project inquiries will appear here'
                : `No ${statusFilter} leads at the moment`}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
