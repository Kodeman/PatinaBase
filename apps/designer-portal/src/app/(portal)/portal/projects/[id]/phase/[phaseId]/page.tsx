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
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { PhaseDot } from '@/components/portal/phase-dot';
import { ProgressBar } from '@/components/portal/progress-bar';
import { TaskChecklist } from '@/components/portal/task-checklist';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PHASE_CONFIG, ALL_PHASES, type ProjectPhase } from '@/types/project-ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

export default function PhaseTaskViewPage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string }>;
}) {
  const { id, phaseId } = use(params);
  const router = useRouter();
  const { data: project, isLoading } = useProject(id) as { data: AnyProject; isLoading: boolean };
  const { data: allTasks = [] } = useProjectTasks(id);
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const updateProject = useUpdateProject();

  const phase = phaseId as ProjectPhase;
  const phaseConfig = PHASE_CONFIG[phase];
  const phaseIndex = ALL_PHASES.indexOf(phase);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = useMemo(() => {
    const arr = Array.isArray(allTasks) ? allTasks : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return arr.filter((t: any) => t.phase === phaseId);
  }, [allTasks, phaseId]);

  if (isLoading) return <LoadingStrata />;
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
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: project.name, href: `/portal/projects/${id}` },
          { label: phaseConfig.label },
        ]}
      />

      {/* Phase header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <PhaseDot phase={phase} />
            <span className="type-meta" style={{ color: phaseConfig.color }}>
              Phase {phaseIndex + 1} of {ALL_PHASES.length}
            </span>
          </div>
          <h1 className="type-section-head mb-1" style={{ fontSize: '1.5rem' }}>
            {phaseConfig.label}
          </h1>
          <div className="type-label-secondary">
            {project.name} · {completedCount} of {totalCount} tasks complete
          </div>
        </div>
        <div className="flex gap-2">
          {isActivePhase && (
            <>
              <button
                className="type-btn-text rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[0.72rem] text-[var(--text-primary)]"
                onClick={handleAddTask}
              >
                + Add Task
              </button>
              <button
                className="type-btn-text rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[0.72rem] text-[var(--text-primary)]"
                onClick={handleAdvancePhase}
              >
                Advance Phase →
              </button>
            </>
          )}
        </div>
      </div>

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
