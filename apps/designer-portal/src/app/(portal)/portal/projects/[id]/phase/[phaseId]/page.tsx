'use client';

import { use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useProject,
  useProjectTasks,
  useUpdateTask,
  useCreateTask,
  useUpdateProject,
} from '@/hooks/use-projects';
import { PhaseDot } from '@/components/portal/phase-dot';
import { PageActionBar } from '@/components/portal';
import { Button } from '@/components/ui/controls';
import { ProgressBar } from '@/components/portal/progress-bar';
import { TaskChecklist } from '@/components/portal/task-checklist';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { PHASE_CONFIG, ALL_PHASES, normalizePhaseSlug, type ProjectPhase } from '@/types/project-ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

export default function PhaseTaskViewPage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string }>;
}) {
  const { id, phaseId } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  const { data: project, isLoading } = useProject(id) as { data: AnyProject; isLoading: boolean };
  const { data: allTasks = [] } = useProjectTasks(id);
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const updateProject = useUpdateProject();

  // phaseId in the URL may be a simplified/legacy key (e.g. 'concept');
  // normalize for display config, but keep raw phaseId for task matching.
  const phase = normalizePhaseSlug(phaseId) as ProjectPhase;
  const phaseConfig = PHASE_CONFIG[phase];
  const phaseIndex = ALL_PHASES.indexOf(phase);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = useMemo(() => {
    const arr = Array.isArray(allTasks) ? allTasks : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return arr.filter((t: any) => t.phase === phaseId);
  }, [allTasks, phaseId]);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!project || !phaseConfig) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Project or phase not found.
      </p>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completedCount = tasks.filter((t: any) => t.status === 'done').length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const currentPhase = project.current_phase as ProjectPhase;
  const isActivePhase = phase === currentPhase;

  const handleTaskToggle = (taskId: string, done: boolean) => {
    updateTask.mutate({ taskId, data: { status: done ? 'done' : 'todo' } });
  };

  const handleAddTask = () => {
    const title = prompt('Task title:');
    if (title) {
      createTask.mutate({
        projectId: id,
        data: { title, phase: phaseId, status: 'todo' },
      });
    }
  };

  const handleAdvancePhase = () => {
    const nextIndex = phaseIndex + 1;
    if (nextIndex < ALL_PHASES.length) {
      const nextPhase = ALL_PHASES[nextIndex];
      updateProject.mutate(
        { id, data: { current_phase: nextPhase } },
        {
          onSuccess: () => {
            router.push(`/portal/projects/${id}`);
          },
        }
      );
    }
  };

  return (
    <div className="pt-8">
      {/* The global breadcrumb (SubNav) carries the project name + phase-label
          step; the bar surfaces the phase indicator + task progress as meta.
          PhaseDot + phaseConfig.color stay in `meta` so the rich per-phase
          color is preserved (semantic tones can't match it). */}
      <PageActionBar
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-2">
              <PhaseDot phase={phase} />
              <span className="type-meta" style={{ color: phaseConfig.color }}>
                Phase {phaseIndex + 1} of {ALL_PHASES.length}
              </span>
            </div>
            <span className="type-label-secondary">
              {project.name} · {completedCount} of {totalCount} tasks complete
            </span>
          </div>
        }
        actions={
          isActivePhase ? (
            <>
              <Button variant="secondary" size="sm" onClick={handleAddTask}>
                + Add Task
              </Button>
              <Button variant="secondary" size="sm" onClick={handleAdvancePhase}>
                Advance Phase →
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Progress bar */}
      <div className="mb-8" style={{ height: '4px' }}>
        <ProgressBar progress={progressPercent} />
      </div>

      {/* Task list */}
      {tasks.length > 0 ? (
        <TaskChecklist
          tasks={tasks}
          onToggle={handleTaskToggle}
          onAddTask={isActivePhase ? handleAddTask : undefined}
          canAdvancePhase={isActivePhase}
          onAdvancePhase={isActivePhase ? handleAdvancePhase : undefined}
        />
      ) : (
        <p className="type-body py-8 text-center italic text-[var(--text-muted)]">
          No tasks for this phase yet.
        </p>
      )}
    </div>
  );
}
