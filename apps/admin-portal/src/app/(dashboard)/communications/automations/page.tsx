'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAutomations,
  useActivateAutomation,
  usePauseAutomation,
  useDeleteAutomation,
} from '@patina/supabase/hooks';
import {
  Zap,
  Plus,
  Play,
  Pause,
  Pencil,
  Trash2,
  Mail,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutomatedSequence, SequenceStatus, SequenceTriggerType } from '@patina/shared/types';

// ─── Status Badge ────────────────────────────────────────────────────────────

const statusColors: Record<SequenceStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  archived: 'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }: { status: SequenceStatus }) {
  return (
    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium capitalize', statusColors[status])}>
      {status}
    </span>
  );
}

// ─── Trigger Labels ──────────────────────────────────────────────────────────

const triggerLabels: Record<SequenceTriggerType, string> = {
  account_created: 'Account Created',
  style_quiz_completed: 'Style Quiz Completed',
  consultation_completed: 'Consultation Completed',
  purchase_completed: 'Purchase Completed',
  no_activity: 'No Activity',
  abandoned_scan: 'Abandoned Scan',
};

function getTriggerDescription(seq: AutomatedSequence): string {
  const config = seq.trigger_config;
  if (!config?.type) return seq.trigger_event || 'Unknown trigger';

  const label = triggerLabels[config.type] || config.type;

  if (config.type === 'no_activity' && config.conditions?.length > 0) {
    const daysCond = config.conditions.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.field === 'days' || c.field === 'inactivity_days'
    );
    if (daysCond) return `${label} (${daysCond.value} days)`;
  }

  if (config.type === 'account_created' && config.conditions?.length > 0) {
    const roleCond = config.conditions.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.field === 'role'
    );
    if (roleCond) return `${label} (${roleCond.value})`;
  }

  return label;
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
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
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const router = useRouter();
  const { data: automations, isLoading } = useAutomations();
  const activateMutation = useActivateAutomation();
  const pauseMutation = usePauseAutomation();
  const deleteMutation = useDeleteAutomation();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | SequenceStatus>('all');

  const filtered = (automations || []).filter(
    (a) => statusFilter === 'all' || a.status === statusFilter
  );

  const handleToggle = (seq: AutomatedSequence) => {
    if (seq.status === 'active') {
      pauseMutation.mutate(seq.id);
    } else {
      activateMutation.mutate(seq.id);
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget, {
        onSuccess: () => setDeleteTarget(null),
      });
    }
  };

  const tabs: { key: 'all' | SequenceStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'paused', label: 'Paused' },
    { key: 'draft', label: 'Draft' },
    { key: 'archived', label: 'Archived' },
  ];

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-patina-charcoal">Automations</h1>
            <p className="text-sm text-patina-clay-beige mt-1">Email sequences triggered by user actions</p>
          </div>
          <button
            onClick={() => router.push('/communications/automations/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Automation
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        {/* Filter tabs */}
        <div className="flex gap-1 bg-white rounded-lg p-1 border border-patina-clay-beige/20 w-fit">
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

        {/* Loading */}
        {isLoading ? (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-12">
            <div className="flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-12 text-center">
            <Zap className="w-12 h-12 text-patina-clay-beige/50 mx-auto mb-4" />
            <h3 className="text-lg font-display font-semibold text-patina-charcoal mb-2">
              No automations found
            </h3>
            <p className="text-sm text-patina-clay-beige mb-6">
              {statusFilter !== 'all'
                ? 'No automations with this status.'
                : 'Create your first automation to get started.'}
            </p>
            {statusFilter === 'all' && (
              <button
                onClick={() => router.push('/communications/automations/new')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Automation
              </button>
            )}
          </div>
        ) : (
          /* Card grid */
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((seq) => {
              const stepCount = seq.steps_json?.length || 0;
              const emailSteps = (seq.steps_json || []).filter((s) => s.type === 'email').length;
              const completionRate =
                seq.total_enrolled > 0
                  ? Math.round((seq.total_completed / seq.total_enrolled) * 100)
                  : 0;

              return (
                <div
                  key={seq.id}
                  className="bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Card header */}
                  <div className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-patina-charcoal truncate">
                          {seq.name}
                        </h3>
                        {seq.description && (
                          <p className="text-xs text-patina-clay-beige mt-0.5 line-clamp-1">
                            {seq.description}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={seq.status} />
                    </div>

                    {/* Trigger */}
                    <div className="flex items-center gap-1.5 text-xs text-patina-clay-beige mb-3">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="truncate">{getTriggerDescription(seq)}</span>
                    </div>

                    {/* Step + email count */}
                    <div className="flex items-center gap-4 text-xs text-patina-clay-beige">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {stepCount} step{stepCount !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        {emailSteps} email{emailSteps !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Performance stats */}
                  <div className="px-5 py-3 border-t border-patina-clay-beige/10 bg-patina-off-white/40">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-xs text-patina-clay-beige">Enrolled</p>
                        <p className="text-sm font-semibold text-patina-charcoal">
                          {seq.total_enrolled}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-patina-clay-beige">Completed</p>
                        <p className="text-sm font-semibold text-patina-charcoal">
                          {seq.total_completed}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-patina-clay-beige">Emails</p>
                        <p className="text-sm font-semibold text-patina-charcoal">
                          {seq.total_emails_sent}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-patina-clay-beige">Rate</p>
                        <p className="text-sm font-semibold text-patina-charcoal">
                          {completionRate}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-5 py-3 border-t border-patina-clay-beige/10 flex items-center gap-2">
                    {/* Activate / Pause toggle */}
                    {seq.status === 'active' ? (
                      <button
                        onClick={() => handleToggle(seq)}
                        disabled={pauseMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    ) : seq.status !== 'archived' ? (
                      <button
                        onClick={() => handleToggle(seq)}
                        disabled={activateMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Activate
                      </button>
                    ) : null}

                    <button
                      onClick={() => router.push(`/communications/automations/${seq.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-patina-charcoal bg-patina-off-white rounded-lg hover:bg-patina-clay-beige/20 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>

                    {seq.status !== 'active' && (
                      <button
                        onClick={() => setDeleteTarget(seq.id)}
                        disabled={deleteMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </div>

                  {/* Error messages */}
                  {(activateMutation.isError || pauseMutation.isError) && (
                    <div className="px-5 pb-3">
                      <div className="flex items-center gap-1.5 text-xs text-red-600">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {activateMutation.error?.message || pauseMutation.error?.message}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Automation"
        message="Are you sure you want to delete this automation? This action cannot be undone. All enrollment data will also be removed."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
