'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProject, useUpdateProject, useProjectTimeline } from '@/hooks/use-projects';
import { useUpdatePhaseEstimates } from '@/hooks/use-time-tracking';
import { PageActionBar } from '@/components/portal';
import { ProjectForm } from '@/components/portal/project-form';
import { ChangeHistory } from '@/components/portal/change-history';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { useToast } from '@/components/portal/toast-provider';
import { Button, Input } from '@/components/ui/controls';
import { normalizePhaseSlug, PHASE_CONFIG } from '@/types/project-ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const hydrated = useHydrated();
  const { data: project, isLoading } = useProject(id) as { data: AnyProject; isLoading: boolean };
  const updateProject = useUpdateProject();
  const isRealProject = UUID_PATTERN.test(id);
  // Phase rows for the Est. hours editor (project_phases; real projects only —
  // slug fixtures return mock segments without phase ids).
  const { data: timeline = [] } = useProjectTimeline(isRealProject ? id : null);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
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
      {/* The global breadcrumb (SubNav) carries the project name + "Edit" step;
          the bar surfaces the step context as meta. */}
      <PageActionBar
        meta={<span className="type-label-secondary">Edit Project</span>}
      />

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

      {/* Phase Hour Estimates (project_phases.estimated_hours, 00177) —
          feeds the Time Tracking panel's spent-vs-estimated bars. */}
      {isRealProject && Array.isArray(timeline) && timeline.length > 0 && (
        <>
          <PhaseEstimatesSection
            projectId={id}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            phases={timeline as any[]}
          />
          <StrataMark variant="mini" />
        </>
      )}

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

// ── Phase Hour Estimates ──
//
// One numeric "Est. hours" input per project_phases row, saved in a batch via
// useUpdatePhaseEstimates. Rendered only after the timeline query resolves, so
// the initial state snapshot is the loaded values.
function PhaseEstimatesSection({
  projectId,
  phases,
}: {
  projectId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  phases: any[];
}) {
  const { toast } = useToast();
  const updateEstimates = useUpdatePhaseEstimates();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      phases.map((p) => [p.id, p.estimated_hours != null ? String(p.estimated_hours) : ''])
    )
  );

  const handleSave = async () => {
    const changes = phases
      .map((p) => {
        const raw = (values[p.id] ?? '').trim();
        const parsed = raw === '' ? null : Math.round(parseFloat(raw) * 10) / 10;
        if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return null;
        const current = p.estimated_hours != null ? Number(p.estimated_hours) : null;
        if (parsed === current) return null;
        return { phaseId: p.id as string, estimatedHours: parsed };
      })
      .filter((c): c is { phaseId: string; estimatedHours: number | null } => c !== null);

    if (changes.length === 0) return;
    try {
      await updateEstimates.mutateAsync({ projectId, changes });
      toast('Phase estimates saved', 'success');
    } catch {
      toast('Could not save phase estimates', 'error');
    }
  };

  return (
    <div>
      <h3
        className="type-section-head mb-1 border-b border-[var(--border-default)] pb-2"
        style={{ fontSize: '1.25rem' }}
      >
        Phase Hour Estimates
      </h3>
      <p className="type-body mb-4" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Estimated hours per phase — the Time Tracking panel measures logged time against these.
      </p>
      <div className="mb-4 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        {phases.map((p) => {
          const slug = normalizePhaseSlug(p.phase_key);
          const label = p.name ?? PHASE_CONFIG[slug]?.label ?? slug;
          return (
            <div key={p.id}>
              <label htmlFor={`phase-est-${p.id}`} className="mb-1.5 block type-meta-small">
                {label} — Est. hours
              </label>
              <Input
                id={`phase-est-${p.id}`}
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                placeholder="—"
                value={values[p.id] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
              />
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={handleSave}
        disabled={updateEstimates.isPending}
        loading={updateEstimates.isPending}
      >
        {updateEstimates.isPending ? 'Saving…' : 'Save estimates'}
      </Button>
    </div>
  );
}
