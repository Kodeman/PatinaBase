'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTemplates, useDeleteTemplate, useCreateTemplate, useUpdateTemplate } from '@patina/supabase/hooks';
import { LayoutTemplate, Plus, Mail, Megaphone, Heart, Zap, Trash2, Copy, Timer } from 'lucide-react';
import type { EmailTemplateCategory } from '@patina/shared/types';
import { cn } from '@/lib/utils';

type FilterTab = 'all' | EmailTemplateCategory;

const categoryConfig: Record<EmailTemplateCategory, { label: string; color: string; icon: React.ReactNode }> = {
  transactional: { label: 'Transactional', color: 'bg-gray-100 text-gray-700', icon: <Mail className="w-3.5 h-3.5" /> },
  engagement: { label: 'Engagement', color: 'bg-blue-100 text-blue-700', icon: <Heart className="w-3.5 h-3.5" /> },
  campaign: { label: 'Campaign', color: 'bg-green-100 text-green-700', icon: <Megaphone className="w-3.5 h-3.5" /> },
  sequence: { label: 'Sequence', color: 'bg-purple-100 text-purple-700', icon: <Zap className="w-3.5 h-3.5" /> },
};

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

function FrequencyCapDialog({
  open,
  template,
  onSave,
  onCancel,
}: {
  open: boolean;
  template: { id: string; name: string; frequency_cap_count?: number | null; frequency_cap_window_days?: number | null } | null;
  onSave: (id: string, count: number | null, days: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [count, setCount] = useState<string>(
    template?.frequency_cap_count != null ? String(template.frequency_cap_count) : '',
  );
  const [days, setDays] = useState<string>(
    template?.frequency_cap_window_days != null ? String(template.frequency_cap_window_days) : '',
  );
  const [busy, setBusy] = useState(false);

  if (!open || !template) return null;

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const c = count.trim() ? parseInt(count, 10) : null;
      const d = days.trim() ? parseInt(days, 10) : null;
      // Both must be set, or neither.
      if ((c == null) !== (d == null)) {
        return;
      }
      if (c != null && (c <= 0 || (d != null && d <= 0))) return;
      await onSave(template.id, c, d);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-display font-semibold text-patina-charcoal mb-2">Frequency cap</h3>
        <p className="text-sm text-patina-clay-beige mb-4">
          Maximum sends of <span className="font-medium text-patina-charcoal">{template.name}</span> per recipient. Leave both blank for no cap.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="text-xs font-medium text-patina-clay-beige uppercase tracking-wider">
            Max sends
            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="1"
              className="mt-1 w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20"
            />
          </label>
          <label className="text-xs font-medium text-patina-clay-beige uppercase tracking-wider">
            In days
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="7"
              className="mt-1 w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20"
            />
          </label>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-patina-clay-beige hover:text-patina-charcoal transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCap(count?: number | null, days?: number | null): string | null {
  if (!count || !days) return null;
  if (days === 7) return `${count}/wk`;
  if (days === 14) return `${count}/2wk`;
  if (days === 30) return `${count}/mo`;
  if (days === 1) return `${count}/day`;
  return `${count}/${days}d`;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterTab>('all');
  const { data: templates, isLoading } = useTemplates(filter === 'all' ? undefined : filter);
  const deleteTemplate = useDeleteTemplate();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [capTarget, setCapTarget] = useState<{ id: string; name: string; frequency_cap_count?: number | null; frequency_cap_window_days?: number | null } | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate.mutateAsync(deleteTarget);
    } catch {
      // mutation error handled by React Query
    }
    setDeleteTarget(null);
  };

  const handleDuplicate = async (template: { id: string; name: string; slug: string; category: EmailTemplateCategory; description?: string | null; subject_default?: string | null; content_blocks?: unknown; variables?: unknown }) => {
    try {
      const { id: _id, ...rest } = template;
      const result = await createTemplate.mutateAsync({
        ...rest,
        name: `${template.name} (Copy)`,
        slug: `${template.slug}-copy-${Date.now()}`,
      } as Partial<import('@patina/shared/types').EmailTemplate>);
      if (result?.id) {
        router.push(`/communications/templates/${result.id}`);
      }
    } catch {
      // mutation error handled by React Query
    }
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'transactional', label: 'Transactional' },
    { key: 'engagement', label: 'Engagement' },
    { key: 'campaign', label: 'Campaign' },
    { key: 'sequence', label: 'Sequences' },
  ];

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-patina-charcoal">Templates</h1>
            <p className="text-sm text-patina-clay-beige mt-1">Email template library</p>
          </div>
          <button
            onClick={() => router.push('/communications/templates/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Filter tabs */}
        <div className="flex gap-1 bg-white rounded-lg p-1 border border-patina-clay-beige/20 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                filter === tab.key
                  ? 'bg-patina-mocha-brown text-white'
                  : 'text-patina-clay-beige hover:text-patina-charcoal'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Template grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Create new card */}
            <button
              onClick={() => router.push('/communications/templates/new')}
              className="bg-white rounded-xl border-2 border-dashed border-patina-clay-beige/30 p-6 flex flex-col items-center justify-center gap-3 hover:border-patina-mocha-brown/50 hover:bg-patina-off-white/50 transition-colors min-h-[200px]"
            >
              <div className="w-12 h-12 rounded-full bg-patina-off-white flex items-center justify-center">
                <Plus className="w-6 h-6 text-patina-mocha-brown" />
              </div>
              <p className="text-sm font-medium text-patina-charcoal">Create New</p>
            </button>

            {/* Template cards */}
            {(templates || []).map((template) => {
              const config = categoryConfig[template.category];

              return (
                <div
                  key={template.id}
                  className="bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group relative"
                  onClick={() => router.push(`/communications/templates/${template.id}`)}
                >
                  {/* Preview area */}
                  <div className="h-32 bg-gradient-to-br from-patina-off-white to-patina-clay-beige/10 flex items-center justify-center">
                    <LayoutTemplate className="w-8 h-8 text-patina-clay-beige/30" />
                  </div>

                  {/* Hover actions overlay */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const t = template as typeof template & {
                          frequency_cap_count?: number | null;
                          frequency_cap_window_days?: number | null;
                        };
                        setCapTarget({
                          id: template.id,
                          name: template.name,
                          frequency_cap_count: t.frequency_cap_count ?? null,
                          frequency_cap_window_days: t.frequency_cap_window_days ?? null,
                        });
                      }}
                      className="p-1.5 bg-white rounded-lg shadow-sm border border-patina-clay-beige/20 hover:bg-patina-off-white transition-colors"
                      title="Frequency cap"
                    >
                      <Timer className="w-3.5 h-3.5 text-patina-clay-beige" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(template); }}
                      className="p-1.5 bg-white rounded-lg shadow-sm border border-patina-clay-beige/20 hover:bg-patina-off-white transition-colors"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5 text-patina-clay-beige" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(template.id); }}
                      className="p-1.5 bg-white rounded-lg shadow-sm border border-patina-clay-beige/20 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-patina-charcoal group-hover:text-patina-mocha-brown transition-colors line-clamp-1">
                        {template.name}
                      </h3>
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 flex items-center gap-1', config.color)}>
                        {config.icon}
                        {config.label}
                      </span>
                    </div>
                    {template.description && (
                      <p className="text-xs text-patina-clay-beige line-clamp-2 mb-2">
                        {template.description}
                      </p>
                    )}
                    {template.subject_default && (
                      <p className="text-xs text-patina-clay-beige/80 truncate">
                        Default: {template.subject_default}
                      </p>
                    )}
                    {(() => {
                      const t = template as typeof template & {
                        frequency_cap_count?: number | null;
                        frequency_cap_window_days?: number | null;
                      };
                      const cap = formatCap(t.frequency_cap_count, t.frequency_cap_window_days);
                      if (!cap) return null;
                      return (
                        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-patina-mocha-brown bg-patina-off-white px-2 py-0.5 rounded-full">
                          <Timer className="w-3 h-3" />
                          {cap}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              );
            })}

            {(templates || []).length === 0 && (
              <div className="col-span-full bg-white rounded-xl border border-patina-clay-beige/20 p-12 text-center">
                <LayoutTemplate className="w-12 h-12 text-patina-clay-beige/50 mx-auto mb-4" />
                <h3 className="text-lg font-display font-semibold text-patina-charcoal mb-2">No templates found</h3>
                <p className="text-sm text-patina-clay-beige">
                  {filter !== 'all' ? 'No templates in this category.' : 'Create your first email template.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Template"
        message="Are you sure you want to delete this template? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <FrequencyCapDialog
        open={!!capTarget}
        template={capTarget}
        onSave={async (id, count, days) => {
          await updateTemplate.mutateAsync({
            id,
            frequency_cap_count: count,
            frequency_cap_window_days: days,
          } as Partial<import('@patina/shared/types').EmailTemplate>);
          setCapTarget(null);
        }}
        onCancel={() => setCapTarget(null)}
      />
    </div>
  );
}
