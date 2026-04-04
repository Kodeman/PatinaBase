'use client';

import { PhaseDot } from '@/components/portal/phase-dot';
import {
  PHASE_CONFIG,
  ALL_PHASES,
  type ProjectPhase,
  type MockTask,
  type MockTimelineSegment,
} from '@/types/project-ui';

interface PhaseTimelineV2Props {
  segments: MockTimelineSegment[];
  tasks: MockTask[];
  onTaskToggle?: (taskId: string, done: boolean) => void;
}

const indicatorStyles: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  decision: {
    bg: 'rgba(196, 165, 123, 0.06)',
    border: 'rgba(196, 165, 123, 0.12)',
    color: 'var(--color-clay)',
    icon: '',
  },
  blocked: {
    bg: 'rgba(199, 123, 110, 0.04)',
    border: 'rgba(199, 123, 110, 0.12)',
    color: 'var(--color-terracotta)',
    icon: '',
  },
  deliverable: {
    bg: 'rgba(139, 156, 173, 0.06)',
    border: 'rgba(139, 156, 173, 0.12)',
    color: 'var(--color-dusty-blue)',
    icon: '',
  },
  gate: {
    bg: 'rgba(196, 165, 123, 0.08)',
    border: 'rgba(196, 165, 123, 0.15)',
    color: 'var(--color-clay)',
    icon: '',
  },
};

function TaskRow({ task, onToggle, isFuture }: { task: MockTask; onToggle?: (id: string, done: boolean) => void; isFuture: boolean }) {
  const isDone = task.status === 'done';
  const isBlocked = task.status === 'blocked';

  return (
    <div
      className="grid items-start gap-2.5 py-1"
      style={{
        gridTemplateColumns: '18px 1fr auto',
        paddingLeft: '1.5rem',
        opacity: isFuture ? 0.45 : 1,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle?.(task.id, !isDone)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm"
        style={{
          border: `1.5px solid ${isDone ? 'var(--color-sage)' : isBlocked ? 'var(--color-terracotta)' : task.indicators?.includes('decision') ? 'var(--color-golden-hour)' : 'var(--color-pearl)'}`,
          background: isDone ? 'rgba(122, 155, 118, 0.08)' : 'transparent',
          color: isDone ? 'var(--color-sage)' : isBlocked ? 'var(--color-terracotta)' : 'var(--color-golden-hour)',
          fontSize: '0.5rem',
        }}
      >
        {isDone && '✓'}
        {isBlocked && '⚡'}
        {!isDone && !isBlocked && task.indicators?.includes('decision') && '◉'}
      </button>

      {/* Task content */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: isDone ? 'line-through' : 'none',
            textDecorationColor: isDone ? 'var(--color-pearl)' : undefined,
          }}
        >
          {task.title}
        </div>
        {task.indicators && task.indicatorText && (
          <span
            className="mt-0.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.48rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: indicatorStyles[task.indicators[0]]?.bg,
              border: `1px solid ${indicatorStyles[task.indicators[0]]?.border}`,
              color: indicatorStyles[task.indicators[0]]?.color,
              fontWeight: task.indicators[0] === 'gate' ? 500 : 400,
            }}
          >
            {task.indicators[0] === 'gate' && '★ '}
            {task.indicators[0] === 'decision' && !isDone && '◉ '}
            {task.indicators[0] === 'decision' && isDone && '✓ '}
            {task.indicators[0] === 'blocked' && '⚡ '}
            {task.indicatorText}
          </span>
        )}
      </div>

      {/* Date */}
      <div
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.48rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: isBlocked
            ? 'var(--color-terracotta)'
            : 'var(--text-muted)',
          whiteSpace: 'nowrap',
          paddingTop: '0.15rem',
        }}
      >
        {isBlocked
          ? 'Blocked'
          : task.completedAt
            ? new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : task.dueDate
              ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : ''}
      </div>
    </div>
  );
}

export function PhaseTimelineV2({ segments, tasks, onTaskToggle }: PhaseTimelineV2Props) {
  return (
    <div>
      <h3
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: '1.25rem',
          lineHeight: 1.35,
          marginBottom: '0.25rem',
        }}
      >
        Phase Timeline
      </h3>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Phases advance through client approval gates · Each phase has deliverables and sign-off
      </div>

      {ALL_PHASES.map((phase) => {
        const segment = segments.find((s) => s.phase === phase);
        const phaseTasks = tasks.filter((t) => t.phase === phase);
        const config = PHASE_CONFIG[phase];
        const status = segment?.status ?? 'pending';
        const isDone = status === 'completed';
        const isActive = status === 'in_progress';
        const isFuture = status === 'pending';

        // Format dates
        const startDate = segment?.startDate
          ? new Date(segment.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '';
        const endDate = segment?.endDate
          ? new Date(segment.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : isActive ? 'Present' : '';
        const dateRange = startDate ? `${startDate}${endDate ? `–${endDate}` : ''}` : '';

        return (
          <div
            key={phase}
            className={`border-b py-5 ${isFuture ? 'future' : ''}`}
            style={{ borderColor: 'var(--border-default)' }}
          >
            {/* Phase header */}
            <div className="mb-2.5 flex items-center gap-2.5">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{
                  background: isDone
                    ? 'var(--color-sage)'
                    : isActive
                      ? 'var(--color-clay)'
                      : 'var(--color-pearl)',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.92rem',
                  color: isFuture ? 'var(--color-pearl)' : isDone ? 'var(--text-muted)' : 'var(--text-primary)',
                }}
              >
                {config.label}
              </span>
              {isDone && (
                <span
                  className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5"
                  style={{
                    background: 'rgba(196, 165, 123, 0.06)',
                    border: '1px solid rgba(196, 165, 123, 0.12)',
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-clay)',
                  }}
                >
                  ✓ Gate Passed
                </span>
              )}
              <span
                className="ml-auto"
                style={{
                  fontFamily: 'var(--font-meta)',
                  fontSize: '0.52rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: isActive ? 'var(--color-clay)' : 'var(--text-muted)',
                }}
              >
                {isActive ? `${startDate}–Present` : dateRange ? dateRange : `Est. ${config.typicalWeeks}`}
              </span>
            </div>

            {/* Tasks */}
            {phaseTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={onTaskToggle}
                isFuture={isFuture}
              />
            ))}
          </div>
        );
      })}

      <div className="mt-3 flex gap-2">
        <button
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          + Add Task
        </button>
        <button
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          + Add Phase
        </button>
      </div>
    </div>
  );
}
