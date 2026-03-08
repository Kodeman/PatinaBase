'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCampaigns } from '@patina/supabase/hooks';
import { Mail, Plus, Search, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'draft' | 'scheduled' | 'sending' | 'sent' | 'archived';

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

export default function CampaignsListPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const { data: campaigns, isLoading } = useCampaigns(
    statusFilter === 'all' ? undefined : statusFilter
  );

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'sending', label: 'Sending' },
    { key: 'sent', label: 'Sent' },
    { key: 'archived', label: 'Archived' },
  ];

  const filtered = (campaigns || []).filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-patina-charcoal">Campaigns</h1>
            <p className="text-sm text-patina-clay-beige mt-1">Create and manage email campaigns</p>
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

      <div className="px-8 py-6 space-y-4">
        {/* Search + filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patina-clay-beige" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
            />
          </div>
          <div className="flex gap-1 bg-white rounded-lg p-1 border border-patina-clay-beige/20">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  statusFilter === tab.key
                    ? 'bg-patina-mocha-brown text-white'
                    : 'text-patina-clay-beige hover:text-patina-charcoal'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-12">
            <div className="flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-12 text-center">
            <Mail className="w-12 h-12 text-patina-clay-beige/50 mx-auto mb-4" />
            <h3 className="text-lg font-display font-semibold text-patina-charcoal mb-2">No campaigns found</h3>
            <p className="text-sm text-patina-clay-beige mb-6">
              {search ? 'Try adjusting your search.' : 'Create your first campaign to get started.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-patina-clay-beige/20">
                  <th className="text-left px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Campaign</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Recipients</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Open Rate</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Click Rate</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-patina-clay-beige uppercase tracking-wider">Sent</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-patina-clay-beige/10">
                {filtered.map((campaign) => {
                  const openRate = campaign.sent_count > 0
                    ? ((campaign.open_count / campaign.sent_count) * 100).toFixed(1)
                    : '—';
                  const clickRate = campaign.sent_count > 0
                    ? ((campaign.click_count / campaign.sent_count) * 100).toFixed(1)
                    : '—';

                  return (
                    <tr
                      key={campaign.id}
                      className="hover:bg-patina-off-white/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/communications/campaigns/${campaign.id}`)}
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-patina-charcoal">{campaign.name}</p>
                        <p className="text-xs text-patina-clay-beige truncate max-w-[200px]">{campaign.subject}</p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={campaign.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-patina-charcoal text-right">
                        {campaign.total_recipients?.toLocaleString() || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-patina-charcoal text-right">
                        {openRate === '—' ? '—' : `${openRate}%`}
                      </td>
                      <td className="px-6 py-4 text-sm text-patina-charcoal text-right">
                        {clickRate === '—' ? '—' : `${clickRate}%`}
                      </td>
                      <td className="px-6 py-4 text-sm text-patina-clay-beige">
                        {campaign.sent_at ? new Date(campaign.sent_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-patina-off-white"
                        >
                          <MoreVertical className="w-4 h-4 text-patina-clay-beige" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
