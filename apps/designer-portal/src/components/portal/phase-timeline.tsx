'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PhaseDot } from './phase-dot';
import { TaskChecklist } from './task-checklist';
import { PhaseDecisions } from './phase-decisions';
import { PHASE_CONFIG, type ProjectPhase, type MockTimelineSegment, type MockTask } from '@/types/project-ui';

interface PhaseTimelineProps {
  segments: MockTimelineSegment[];
  tasks: MockTask[];
  onTaskToggle?: (taskId: string, done: boolean) => void;
  onAddTask?: () => void;
  onAdvancePhase?: () => void;
  /** When provided, phase labels link to the Phase Task View page instead of expanding inline */
  projectId?: string;
}

export function PhaseTimeline({
  segments,
  tasks,
  onTaskToggle,
  onAddTask,
  onAdvancePhase,
  projectId,
}: PhaseTimelineProps) {
  const activeSegment = segments.find((s) => s.status === 'in_progress');
  const [expandedPhase, setExpandedPhase] = useState<ProjectPhase | null>(
    projectId ? null : (activeSegment?.phase ?? null)
  );

  return (
    <div className="relative pl-8">
      {/* Vertical line */}
      <div
        className="absolute top-2.5 bottom-2.5"
        style={{ left: '5px', width: '2px', background: 'var(--border-default)' }}
      />

      {segments.map((segment) => {
        const config = PHASE_CONFIG[segment.phase];
        const isActive = segment.status === 'in_progress';
        const isDone = segment.status === 'completed';
        const isUpcoming = segment.status === 'pending';
        const isExpanded = !projectId && expandedPhase === segment.phase;
        const phaseTasks = tasks.filter((t) => t.phase === segment.phase);

        const dateText = isDone && segment.startDate && segment.endDate
          ? `${formatDate(segment.startDate)} – ${formatDate(segment.endDate)} · Complete`
          : isDone && segment.startDate
            ? `${formatDate(segment.startDate)} · Complete`
            : isActive && segment.startDate
              ? `Started ${formatDate(segment.startDate)} · In Progress`
              : isUpcoming
                ? 'Upcoming'
                : '';

        const labelContent = (
          <>
            <div className="flex items-center gap-2">
              <PhaseDot phase={segment.phase} size="sm" />
              <span
                className={`font-body ${
                  isActive
                    ? 'text-[1rem] font-medium text-[var(--text-primary)]'
                    : isDone
                      ? 'text-[0.9rem] text-[var(--text-muted)]'
                      : 'text-[0.9rem] font-light text-[var(--border-default)]'
                }`}
              >
                {config.label}
              </span>
            </div>
            <div className="type-meta-small mt-0.5">{dateText}</div>
          </>
        );

        return (
          <div key={segment.id} className="relative py-3">
            {/* Dot on the timeline */}
            <div
              className="absolute rounded-full border-[2.5px]"
              style={{
                left: '-2rem',
                top: '1rem',
                width: '12px',
                height: '12px',
                borderColor: isDone
                  ? 'var(--color-sage)'
                  : isActive
                    ? config.color
                    : 'var(--border-default)',
                backgroundColor: isDone
                  ? 'var(--color-sage)'
                  : isActive
                    ? config.color
                    : 'var(--bg-surface)',
              }}
            />

            {/* Phase label — link or expand */}
            {projectId ? (
              <Link
                href={`/portal/projects/${projectId}/phase/${segment.phase}`}
                className="block w-full text-left no-underline"
              >
                {labelContent}
              </Link>
            ) : (
              <button
                className="w-full text-left"
                onClick={() => setExpandedPhase(isExpanded ? null : segment.phase)}
              >
                {labelContent}
              </button>
            )}

            {/* Expanded task list (only in non-link mode) */}
            {isExpanded && phaseTasks.length > 0 && (
              <div className="mt-3">
                <TaskChecklist
                  tasks={phaseTasks}
                  onToggle={onTaskToggle}
                  onAddTask={isActive ? onAddTask : undefined}
                  canAdvancePhase={isActive}
                  onAdvancePhase={isActive ? onAdvancePhase : undefined}
                />
              </div>
            )}

            {/* Phase decisions (shown when expanded or in link mode) */}
            {(isExpanded || projectId) && projectId && (
              <PhaseDecisions
                projectId={projectId}
                phase={segment.phase}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
