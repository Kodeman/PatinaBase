'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  useCampaigns,
  useCreateCampaign,
  useCancelCampaign,
  useArchiveCampaign,
  useDeleteCampaign,
} from '@patina/supabase/hooks';
import { Mail, Plus, Search, MoreVertical, Pencil, Copy, XCircle, Archive, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'draft' | 'scheduled' | 'sending' | 'sent' | 'archived';

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-display font-semibold text-patina-charcoal mb-2">{title}</h3>
        <p className="text-sm text-patina-clay-beige mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-patina-clay-beige hover:text-patina-charcoal transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row Actions Dropdown ────────────────────────────────────────────────────

function RowActionsDropdown({
  campaign,
  onEdit,
  onDuplicate,
  onCancel,
  onArchive,
  onDelete,
}: {
  campaign: { id: string; status: string };
  onEdit: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const canEdit = ['draft', 'scheduled'].includes(campaign.status);
  const canCancel = campaign.status === 'scheduled';
  const canArchive = ['sent', 'cancelled'].includes(campaign.status);
  const canDelete = campaign.status === 'draft';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="p-1 rounded hover:bg-patina-off-white"
      >
        <MoreVertical className="w-4 h-4 text-patina-clay-beige" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-patina-clay-beige/20 py-1 z-20">
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-patina-charcoal hover:bg-patina-off-white transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDuplicate(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-patina-charcoal hover:bg-patina-off-white transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate
          </button>
          {canCancel && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onCancel(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel Send
            </button>
          )}
          {canArchive && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onArchive(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-patina-clay-beige hover:bg-patina-off-white transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </button>
          )}
          {canDelete && (
            <>
              <div className="border-t border-patina-clay-beige/10 my-1" />
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

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

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CampaignsListPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const { data: campaigns, isLoading } = useCampaigns(
    statusFilter === 'all' ? undefined : statusFilter
  );

  const createCampaign = useCreateCampaign();
  const cancelCampaign = useCancelCampaign();
  const archiveCampaign = useArchiveCampaign();
  const deleteCampaign = useDeleteCampaign();

  const [confirmAction, setConfirmAction] = useState<{
    type: 'cancel' | 'archive' | 'delete';
    campaignId: string;
    campaignName: string;
  } | null>(null);

  const handleDuplicate = async (campaign: { id: string; name: string; subject: string; template_id: string; audience_type: string; preview_text?: string | null; template_data?: Record<string, unknown> | null; audience_segment?: Record<string, unknown> | null }) => {
    try {
      const result = await createCampaign.mutateAsync({
        name: `${campaign.name} (Copy)`,
        subject: campaign.subject,
        template_id: campaign.template_id,
        audience_type: campaign.audience_type,
        preview_text: campaign.preview_text || undefined,
        template_data: (campaign.template_data as Record<string, unknown>) || undefined,
        audience_segment: (campaign.audience_segment as Record<string, unknown>) || undefined,
      });
      if (result?.id) {
        router.push(`/communications/campaigns/${result.id}/edit`);
      }
    } catch {
      // mutation error handled by React Query
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    try {
      switch (confirmAction.type) {
        case 'cancel':
          await cancelCampaign.mutateAsync(confirmAction.campaignId);
          break;
        case 'archive':
          await archiveCampaign.mutateAsync(confirmAction.campaignId);
          break;
        case 'delete':
          await deleteCampaign.mutateAsync(confirmAction.campaignId);
          break;
      }
    } catch {
      // mutation error handled by React Query
    }
    setConfirmAction(null);
  };

  const confirmConfig = {
    cancel: {
      title: 'Cancel Campaign',
      message: 'Are you sure you want to cancel this scheduled campaign? This will prevent it from being sent.',
      confirmLabel: 'Cancel Campaign',
    },
    archive: {
      title: 'Archive Campaign',
      message: 'Are you sure you want to archive this campaign? It will be moved to the archived tab.',
      confirmLabel: 'Archive',
    },
    delete: {
      title: 'Delete Campaign',
      message: 'Are you sure you want to delete this draft campaign? This action cannot be undone.',
      confirmLabel: 'Delete',
    },
  };

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
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <RowActionsDropdown
                          campaign={campaign}
                          onEdit={() => router.push(`/communications/campaigns/${campaign.id}/edit`)}
                          onDuplicate={() => handleDuplicate(campaign)}
                          onCancel={() => setConfirmAction({ type: 'cancel', campaignId: campaign.id, campaignName: campaign.name })}
                          onArchive={() => setConfirmAction({ type: 'archive', campaignId: campaign.id, campaignName: campaign.name })}
                          onDelete={() => setConfirmAction({ type: 'delete', campaignId: campaign.id, campaignName: campaign.name })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      {confirmAction && (
        <ConfirmDialog
          open={!!confirmAction}
          title={confirmConfig[confirmAction.type].title}
          message={confirmConfig[confirmAction.type].message}
          confirmLabel={confirmConfig[confirmAction.type].confirmLabel}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
