'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProposalTemplates, useCreateProposal } from '@/hooks/use-proposals';
import { useProjects } from '@/hooks/use-projects';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { TemplateCard } from '@/components/portal/template-card';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

export default function NewProposalPage() {
  const router = useRouter();
  const { data: templates, isLoading: templatesLoading } = useProposalTemplates();
  const { data: projects } = useProjects();
  const createProposal = useCreateProposal();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [version, setVersion] = useState('v1.0');

  const handleCreate = async () => {
    if (!selectedTemplateId) return;

    const template = templates?.find((t) => t.id === selectedTemplateId);
    const project = projects?.find((p: { id: string }) => p.id === selectedProjectId);

    try {
      const result = await createProposal.mutateAsync({
        title: project ? `${(project as { id: string; name: string }).name} \u2014 ${template?.name || 'Proposal'}` : template?.name || 'New Proposal',
        projectId: selectedProjectId || undefined,
        templateId: selectedTemplateId,
      });

      router.push(`/portal/proposals/${result.id}`);
    } catch (err) {
      console.error('Failed to create proposal:', err);
    }
  };

  if (templatesLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Proposals', href: '/portal/proposals' },
          { label: 'New Proposal' },
        ]}
      />

      <h1 className="type-section-head mb-1" style={{ fontSize: '1.5rem' }}>
        New Proposal
      </h1>
      <p className="type-label-secondary mb-8">
        Select a template, then customize for your client.
      </p>

      {/* Project link + Version */}
      <div className="mb-8 grid max-w-[500px] grid-cols-2 gap-6">
        <div className="flex flex-col gap-1.5">
          <label
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            Linked Project
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <option value="">&mdash; No linked project &mdash;</option>
            {projects?.map((p: { id: string; name: string }) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            Proposal Version
          </label>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="max-w-[100px] rounded border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            style={{ fontFamily: 'var(--font-body)' }}
          />
        </div>
      </div>

      {/* Template label */}
      <div
        className="mb-3"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        Choose a Template
      </div>

      {/* Template grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {templates?.map((template) => (
          <TemplateCard
            key={template.id}
            name={template.name}
            description={template.description}
            sectionCount={Array.isArray(template.sections_config) ? template.sections_config.length : 0}
            estimatedPages={template.estimated_pages}
            selected={selectedTemplateId === template.id}
            onSelect={() => setSelectedTemplateId(template.id)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="mt-8 flex gap-2 border-t border-[var(--border-subtle)] pt-6">
        <PortalButton
          variant="primary"
          onClick={handleCreate}
          disabled={!selectedTemplateId || createProposal.isPending}
        >
          {createProposal.isPending ? 'Creating...' : 'Create Proposal \u2192'}
        </PortalButton>
        <PortalButton variant="ghost" onClick={() => router.back()}>
          Cancel
        </PortalButton>
      </div>
    </div>
  );
}
