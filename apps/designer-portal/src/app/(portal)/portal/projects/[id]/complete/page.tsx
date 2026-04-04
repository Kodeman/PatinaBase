'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProject, useCompleteProject } from '@/hooks/use-projects';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { PhaseDot } from '@/components/portal/phase-dot';
import { ClosureChecklist } from '@/components/portal/closure-checklist';
import { PortfolioSnapshotForm } from '@/components/portal/portfolio-snapshot-form';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import type { ClosureItem } from '@/types/project-ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

function formatBudget(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const DEFAULT_CLOSURE_ITEMS: ClosureItem[] = [
  { key: 'walkthrough', label: 'Final walkthrough completed with client', completed: true, date: 'Mar 22' },
  { key: 'punch_list', label: 'All punch list items resolved', completed: true, date: 'Mar 24' },
  { key: 'payment', label: 'Final payment collected', completed: true, date: 'Mar 24' },
  { key: 'photography', label: 'Professional photography scheduled', completed: true, date: 'Confirmed Apr 1' },
  { key: 'photos', label: 'Upload final project photos (for portfolio)', completed: false, date: 'After Apr 1' },
  { key: 'case_study', label: 'Write project case study for portfolio', completed: false, date: 'By Apr 5' },
  { key: 'review', label: 'Send client review request', completed: false, date: 'Apr 2' },
];

export default function ProjectClosurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: project, isLoading } = useProject(id) as { data: AnyProject; isLoading: boolean };
  const completeProject = useCompleteProject();
  const [closureItems, setClosureItems] = useState<ClosureItem[]>(DEFAULT_CLOSURE_ITEMS);

  if (isLoading) return <LoadingStrata />;
  if (!project) {
    return <p className="type-body py-16 text-center text-[var(--text-muted)]">Project not found.</p>;
  }

  const handleToggle = (key: string) => {
    setClosureItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const allComplete = closureItems.every((item) => item.completed);

  const handleComplete = () => {
    completeProject.mutate(
      { id, data: { closureItems } },
      {
        onSuccess: () => {
          router.push('/portal/projects');
        },
      }
    );
  };

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: project.name, href: `/portal/projects/${id}` },
          { label: 'Complete Project' },
        ]}
      />

      {/* Phase header */}
      <div className="mb-2 flex items-center gap-2">
        <PhaseDot phase="final_walkthrough" />
        <span className="type-meta" style={{ color: 'var(--phase-walkthrough)' }}>
          Final Walkthrough
        </span>
      </div>
      <h1 className="type-section-head mb-1" style={{ fontSize: '1.5rem' }}>
        Complete Project
      </h1>
      <div className="type-label-secondary mb-8">
        {project.name} · {project.client_name} · {formatBudget(project.budget)}
      </div>

      {/* Closure Checklist */}
      <h3
        className="type-section-head mb-4 border-b border-[var(--border-default)] pb-2"
        style={{ fontSize: '1.25rem' }}
      >
        Closure Checklist
      </h3>
      <ClosureChecklist items={closureItems} onToggle={handleToggle} />

      <StrataMark variant="mini" />

      {/* Portfolio Snapshot */}
      <h3
        className="type-section-head mb-4 border-b border-[var(--border-default)] pb-2"
        style={{ fontSize: '1.25rem' }}
      >
        Portfolio Snapshot
      </h3>
      <PortfolioSnapshotForm
        initialValue={project.budget}
        initialDuration="5 months"
        initialRooms={project.rooms}
        initialTags={['Warm Minimalist', 'Prairie Modern', 'Natural Materials']}
      />

      {/* Info banner */}
      <div
        className="mt-6 rounded-md border px-4 py-3.5"
        style={{
          background: 'rgba(168, 181, 160, 0.06)',
          borderColor: 'rgba(168, 181, 160, 0.2)',
        }}
      >
        <p className="type-meta mb-0.5" style={{ color: 'var(--color-sage)' }}>
          Almost Done
        </p>
        <p className="font-body text-[0.82rem] text-[var(--text-body)]">
          Once all checklist items are complete and photos are uploaded, this project will appear in
          your public portfolio and the client will receive a review request. Completed projects also
          improve your platform ranking and lead quality.
        </p>
      </div>

      {/* Actions */}
      <div className="mt-8 flex gap-2 border-t border-[var(--border-default)] pt-6">
        <button
          className="type-btn-text rounded-[3px] px-5 py-2.5 text-white disabled:opacity-50"
          style={{ background: 'var(--color-sage)' }}
          disabled={!allComplete}
          onClick={handleComplete}
        >
          Complete & Archive Project
        </button>
        <button
          className="type-btn-text rounded-[3px] border border-[var(--border-default)] bg-transparent px-5 py-2.5 text-[var(--text-primary)]"
          onClick={() => router.push(`/portal/projects/${id}`)}
        >
          Save Progress
        </button>
      </div>
    </div>
  );
}
