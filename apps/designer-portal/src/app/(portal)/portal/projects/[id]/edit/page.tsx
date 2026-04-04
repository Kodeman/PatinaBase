'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useProject, useUpdateProject } from '@/hooks/use-projects';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { ProjectForm } from '@/components/portal/project-form';
import { ChangeHistory } from '@/components/portal/change-history';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: project, isLoading } = useProject(id) as { data: AnyProject; isLoading: boolean };
  const updateProject = useUpdateProject();

  if (isLoading) return <LoadingStrata />;
  if (!project) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Project not found.
      </p>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSubmit = (data: any) => {
    updateProject.mutate(
      { id, data },
      {
        onSuccess: () => {
          router.push(`/portal/projects/${id}`);
        },
      }
    );
  };

  // Mock change history
  const changeHistory = [
    {
      id: 'ch-1',
      actorName: 'Leah',
      description: `updated budget from $20,000 to ${formatCurrency(project.budget)} — dining room added`,
      timestamp: 'Feb 3, 2026',
    },
    {
      id: 'ch-2',
      actorName: 'Leah',
      description: 'changed project name to include "Living & Dining"',
      timestamp: 'Feb 3, 2026',
    },
    {
      id: 'ch-3',
      actorName: 'System',
      description: 'project created from accepted lead',
      timestamp: new Date(project.startDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    },
  ];

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: project.name, href: `/portal/projects/${id}` },
          { label: 'Edit' },
        ]}
      />

      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
          Edit Project
        </h1>
      </div>

      <ProjectForm
        isEdit
        initialData={{
          name: project.name,
          clientName: project.client_name ?? '',
          projectType: project.project_type ?? 'Full Room Design',
          rooms: project.rooms ?? '',
          location: project.client_location ?? '',
          description: project.description ?? '',
          totalBudget: formatCurrency(project.budget),
          designFee: project.design_fee ? formatCurrency(project.design_fee) : '',
          status: project.status === 'active' ? 'Active' : project.status,
          startDate: project.startDate
            ? new Date(project.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '',
          estCompletion: project.endDate
            ? new Date(project.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '',
          currentPhase: project.current_phase
            ? project.current_phase.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
            : '',
        }}
        originalBudget={formatCurrency(project.budget)}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/portal/projects/${id}`)}
      />

      <StrataMark variant="mini" />

      {/* Change History */}
      <h3
        className="type-section-head mb-3 border-b border-[var(--border-default)] pb-2"
        style={{ fontSize: '1.25rem' }}
      >
        Change History
      </h3>
      <ChangeHistory items={changeHistory} />
    </div>
  );
}
